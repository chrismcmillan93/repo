(function(){
  "use strict";

  // Car park finder for the planner: the nearest public car parks to a walk's start pin,
  // from Ordnance Survey's OS NGD API - Features ("Site" features whose description is
  // "Public Car Park"). Needs the same OS access as the map (osmap.js + the os-token Edge
  // Function); without it, find() rejects with code "unavailable" and the planner just
  // shows a message.
  //
  // Called only when someone taps the button on a walk card, never on page load, so it
  // costs a transaction or two per walk looked at. Results are kept on this device only
  // (localStorage, 30 days) so the same walk isn't looked up twice; nothing is stored on
  // our server.
  //
  //   CarParks.find(start, { force })  -> { parks: [{ name, lat, lng, distM, bearing }], radiusM, fromCache }
  //   start = { key, lat, lng }.  Rejects with an Error whose .code is one of
  //   unavailable | not_allowed | not_found | busy | failed.

  const BASE = "https://api.os.uk/features/ngd/ofa/v1/collections/";
  // Schema versions 2 and 1 of the Site feature; try the newer one first.
  const COLLECTIONS = ["lus-fts-site-2", "lus-fts-site-1"];
  const FILTER = "description = 'Public Car Park'";
  const CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";
  const RADII_M = [1500, 4000];          // look close first, then widen once
  const MAX_SHOWN = 4;
  const CACHE_PREFIX = "ww_carparks_v1:", CACHE_MS = 30 * 24 * 3600 * 1000;
  const D2R = Math.PI / 180;

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

  // bbox in lon/lat (CRS84) around a point, `r` metres each way
  function bboxFor(lat, lng, r){
    const dLat = r / 111320, dLng = r / (111320 * Math.cos(lat * D2R));
    return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
  }

  // area-weighted centre of a polygon ring ([[lng, lat], ...]); falls back to the vertex average
  function ringCentre(ring){
    if (!ring || ring.length < 3) return null;
    const x0 = ring[0][0], y0 = ring[0][1];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const x1 = ring[i][0] - x0, y1 = ring[i][1] - y0, x2 = ring[i + 1][0] - x0, y2 = ring[i + 1][1] - y0;
      const c = x1 * y2 - x2 * y1;
      a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c;
    }
    if (Math.abs(a) < 1e-14) {
      const n = ring.length;
      return { lng: ring.reduce((s, p) => s + p[0], 0) / n, lat: ring.reduce((s, p) => s + p[1], 0) / n, size: 0 };
    }
    return { lng: x0 + cx / (3 * a), lat: y0 + cy / (3 * a), size: Math.abs(a) };
  }
  function featureCentre(f){
    const g = f && f.geometry;
    if (!g) return null;
    if (g.type === "Point") return { lng: g.coordinates[0], lat: g.coordinates[1] };
    if (g.type === "Polygon") return ringCentre(g.coordinates[0]);
    if (g.type === "MultiPolygon") {
      return g.coordinates.map(p => ringCentre(p[0])).filter(Boolean).sort((a, b) => b.size - a.size)[0] || null;
    }
    return null;
  }
  CarParks._featureCentre = featureCentre;   // exposed for tests

  async function getJson(url, retried){
    if (!window.OSMap) throw fail("unavailable");
    let token;
    try { token = await OSMap.getToken(!!retried); } catch (e) { throw fail("unavailable"); }
    let res;
    try { res = await fetch(url, { headers: { Authorization: "Bearer " + token, Accept: "application/geo+json, application/json" } }); }
    catch (e) { throw fail("failed"); }
    if (res.status === 401 && !retried) return getJson(url, true);
    if (res.status === 401 || res.status === 403) throw fail("not_allowed", res.status);
    if (res.status === 404) throw fail("not_found", 404);
    if (res.status === 429) throw fail("busy", 429);
    if (!res.ok) throw fail("failed", res.status);
    try { return await res.json(); } catch (e) { throw fail("failed"); }
  }

  async function query(lat, lng, r){
    const bbox = bboxFor(lat, lng, r).map(n => n.toFixed(6)).join(",");
    let lastErr = null;
    for (const coll of COLLECTIONS) {
      const url = BASE + coll + "/items?bbox=" + bbox + "&filter=" + encodeURIComponent(FILTER) + "&limit=100&crs=" + encodeURIComponent(CRS84);
      try { return await getJson(url); }
      catch (e) { if (e.code === "not_found") { lastErr = e; continue; } throw e; }
    }
    throw lastErr || fail("not_found");
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

  CarParks.find = async function(start, opts){
    opts = opts || {};
    const key = (start.key || "start") + "@" + start.lat.toFixed(4) + "," + start.lng.toFixed(4);
    if (!opts.force) {
      const hit = readCache(key);
      if (hit) return { parks: hit.parks, radiusM: hit.radiusM, fromCache: true };
    }
    for (const r of RADII_M) {
      const data = await query(start.lat, start.lng, r);
      const parks = ((data && data.features) || []).map(f => {
        const c = featureCentre(f);
        if (!c) return null;
        const p = f.properties || {};
        const here = { lat: c.lat, lng: c.lng };
        return { name: (p.name1_text && String(p.name1_text).trim()) || "", lat: c.lat, lng: c.lng, distM: distanceM(start, here), bearing: bearingDeg(start, here) };
      }).filter(p => p && p.distM <= r).sort((a, b) => a.distM - b.distM).slice(0, MAX_SHOWN);
      if (parks.length || r === RADII_M[RADII_M.length - 1]) {
        writeCache(key, parks, r);
        return { parks, radiusM: r, fromCache: false };
      }
    }
    return { parks: [], radiusM: RADII_M[RADII_M.length - 1], fromCache: false };
  };
})();
