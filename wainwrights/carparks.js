(function(){
  "use strict";

  // Car park finder for the planner: the nearest car parks to a walk's start pin, from OpenStreetMap
  // (volunteer-mapped data, queried through the public Overpass API). Used because the OS plan here has no
  // car park data: OS's Features API refuses it (Premium only) and the free NGD vector tiles carry no Site layer.
  // Data is (c) OpenStreetMap contributors (ODbL); the planner card says so.
  //
  // Called only when someone taps the button on a walk card, never on page load. No sign-in or OS key is
  // needed, and only the walk's start coordinates (public) are sent, never anything about the person.
  // Results are kept on this device only (localStorage, 30 days) so the same walk isn't looked up twice.
  //
  //   CarParks.find(start, { force }) -> { parks: [{ name, kind, lat, lng, distM, bearing, fee, charge,
  //                                                  capacity, operator, access, osm }], radiusM, fromCache }
  //   start = { key, lat, lng }.  Rejects with an Error whose .code is "busy" | "failed".

  // The main public server first, then a mirror, if the first can't be reached or is overloaded.
  const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  const RADII_M = [1500, 4000];          // look close first, then widen once
  const MAX_SHOWN = 4;
  const CACHE_PREFIX = "ww_carparks_v2:", CACHE_MS = 30 * 24 * 3600 * 1000;
  const D2R = Math.PI / 180;

  // Parking that is not for someone leaving a car to walk, or that they can't use.
  const NOT_FOR_WALKERS_ACCESS = new Set(["private", "no", "customers", "delivery", "permit", "residents", "employees"]);
  const NOT_FOR_WALKERS_KIND = new Set(["multi-storey", "underground", "rooftop", "garage_boxes", "carports", "garages"]);

  const CarParks = window.CarParks = {};
  const fail = (code, status) => Object.assign(new Error("carparks_" + code), { code, status });

  function distanceM(a, b){
    const R = 6371000, dφ = (b.lat - a.lat) * D2R, dλ = (b.lng - a.lng) * D2R;
    const x = Math.sin(dφ / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dλ / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function bearingDeg(a, b){
    const φ1 = a.lat * D2R, φ2 = b.lat * D2R, dλ = (b.lng - a.lng) * D2R;
    return (Math.atan2(Math.sin(dλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)) / D2R + 360) % 360;
  }
  const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  CarParks.compass = deg => POINTS[Math.round(deg / 22.5) % 16];
  CarParks.fmtDist = m => m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1) + " km";

  const clean = s => (typeof s === "string" ? s.trim().slice(0, 80) : "");

  // One OpenStreetMap element -> a car park, or null if it isn't one a walker could use.
  function toPark(el, start){
    const t = el.tags || {};
    if (t.amenity !== "parking") return null;
    const access = clean(t.access).toLowerCase();
    if (NOT_FOR_WALKERS_ACCESS.has(access)) return null;
    const kind = clean(t.parking).toLowerCase();
    if (NOT_FOR_WALKERS_KIND.has(kind)) return null;
    const lat = el.type === "node" ? el.lat : el.center && el.center.lat;
    const lng = el.type === "node" ? el.lon : el.center && el.center.lon;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    const here = { lat, lng };
    const fee = t.fee === "yes" ? "pay" : t.fee === "no" ? "free" : t.fee === "donation" ? "donation" : "";
    const cap = parseInt(t.capacity, 10);
    const name = clean(t.name);
    const operator = clean(t.operator);
    const label = name || (kind === "layby" ? "Lay-by" : kind === "street_side" || kind === "lane" ? "Roadside parking" : "Car park");
    return {
      name: label, named: !!name, kind: kind === "layby" ? "lay-by" : "car park",
      lat, lng, distM: distanceM(start, here), bearing: bearingDeg(start, here),
      fee, charge: fee === "pay" ? clean(t.charge) : "", capacity: cap > 0 && cap < 5000 ? cap : null,
      operator: operator && operator !== name ? operator : "", access: access && access !== "yes" ? access : "",
      osm: (el.type === "node" || el.type === "way" || el.type === "relation") && el.id ? el.type + "/" + el.id : "",
      tagCount: Object.keys(t).length
    };
  }
  CarParks._toPark = toPark;   // exposed for tests

  // The same car park is often mapped twice (a point and an outline); keep the better described one.
  function dedupe(parks){
    const kept = [];
    parks.slice().sort((a, b) => b.tagCount - a.tagCount || a.distM - b.distM).forEach(p => {
      if (!kept.some(k => distanceM(k, p) < 40)) kept.push(p);
    });
    return kept;
  }

  async function overpass(lat, lng, r){
    const q = '[out:json][timeout:20];nwr["amenity"="parking"](around:' + r + "," + lat.toFixed(5) + "," + lng.toFixed(5) + ");out center tags 120;";
    let last = null;
    for (const url of ENDPOINTS) {
      let res;
      try { res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) }); }
      catch (e) { last = fail("failed"); continue; }
      if (res.status === 429 || res.status === 503 || res.status === 504) { last = fail("busy", res.status); continue; }
      if (!res.ok) { last = fail("failed", res.status); continue; }
      let data;
      try { data = await res.json(); } catch (e) { last = fail("failed"); continue; }
      // Overpass reports a query that ran out of time as a remark on an otherwise normal 200 reply
      if (data && typeof data.remark === "string" && /timed out|out of memory/i.test(data.remark) && !(data.elements || []).length) { last = fail("busy"); continue; }
      return data;
    }
    throw last || fail("failed");
  }

  function readCache(key){
    try {
      const v = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || "null");
      if (v && Date.now() - v.at < CACHE_MS && Array.isArray(v.parks)) return v;
    } catch (e) {}
    return null;
  }
  function writeCache(key, parks, radiusM){
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), parks, radiusM })); } catch (e) {}
  }

  // Cache only, never the network: what a previous lookup (on the planner, say) saved on this device for this start, or null.
  CarParks.cached = function(start){
    const key = (start.key || "start") + "@" + start.lat.toFixed(4) + "," + start.lng.toFixed(4);
    const hit = readCache(key);
    return hit ? { parks: hit.parks, radiusM: hit.radiusM, fromCache: true } : null;
  };

  CarParks.find = async function(start, opts){
    opts = opts || {};
    const key = (start.key || "start") + "@" + start.lat.toFixed(4) + "," + start.lng.toFixed(4);
    if (!opts.force) {
      const hit = readCache(key);
      if (hit) return { parks: hit.parks, radiusM: hit.radiusM, fromCache: true };
    }
    for (const r of RADII_M) {
      const data = await overpass(start.lat, start.lng, r);
      const parks = dedupe(((data && data.elements) || []).map(el => toPark(el, start)).filter(p => p && p.distM <= r))
        .sort((a, b) => a.distM - b.distM).slice(0, MAX_SHOWN);
      if (parks.length || r === RADII_M[RADII_M.length - 1]) {
        writeCache(key, parks, r);
        return { parks, radiusM: r, fromCache: false };
      }
    }
    return { parks: [], radiusM: RADII_M[RADII_M.length - 1], fromCache: false };
  };
})();
