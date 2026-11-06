(function(){
  "use strict";

  // Ordnance Survey helpers shared by the tracker and the hike page.
  //
  //  - OSMap.createMap(el)    a Leaflet map on OS Outdoor tiles (needs window.L)
  //  - OSMap.gridRef(lat,lng) "NY 34200 15100" style grid references (works offline)
  //  - OSMap.whereAmI()       the "Where am I?" sheet: grid ref, nearest summit,
  //                           nearest named place
  //
  // Credentials: the OS project key and secret never reach the browser. The
  // os-token Edge Function (supabase/functions/os-token) trades them for a
  // short-lived OAuth2 token for signed-in users only; tiles and OS Names
  // calls then go straight to api.os.uk with `Authorization: Bearer <token>`.
  // If that function isn't deployed or configured, everything here degrades
  // quietly: createMap() resolves null and the callers keep their old view.

  const OS_TILES = "https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/{z}/{x}/{y}.png";
  const OS_NAMES_NEAREST = "https://api.os.uk/search/names/v1/nearest";
  const OS_TERMS = "https://osdatahub.os.uk/support/legal/api-terms";
  // Outdoor is OS OpenData up to zoom 16; 17+ is Premium data, so stop there
  // and let Leaflet scale the last level up if someone zooms further.
  const MAX_NATIVE_ZOOM = 16;

  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const OSMap = window.OSMap = {};

  // ---------------------------------------------------------------- token

  let tok = null, tokExpires = 0, inflight = null, failedAt = 0;
  const RETRY_AFTER_FAIL_MS = 60 * 1000;   // don't hammer a function that isn't set up

  function getToken(force){
    if (!force && tok && Date.now() < tokExpires - 20 * 1000) return Promise.resolve(tok);
    if (inflight) return inflight;
    if (!force && failedAt && Date.now() - failedAt < RETRY_AFTER_FAIL_MS) return Promise.reject(new Error("os_unavailable"));
    if (!window.WW || !WW.sb) return Promise.reject(new Error("no_supabase"));
    inflight = (async function(){
      try {
        const r = await WW.sb.functions.invoke("os-token");
        const d = r && r.data;
        if (r.error || !d || typeof d.access_token !== "string") throw new Error("os_unavailable");
        tok = d.access_token;
        tokExpires = Date.now() + (Number(d.expires_in) || 240) * 1000;
        failedAt = 0;
        return tok;
      } catch (e) {
        tok = null; failedAt = Date.now();
        throw e;
      } finally { inflight = null; }
    })();
    return inflight;
  }
  OSMap.getToken = getToken;
  OSMap.available = () => getToken().then(() => true, () => false);

  // ---------------------------------------------------------------- map

  let OSLayer = null;
  function layerClass(){
    if (OSLayer) return OSLayer;
    // Tiles need an Authorization header, which an <img src> can't send, so each
    // tile is fetched with the token and handed to the <img> as a blob.
    OSLayer = L.TileLayer.extend({
      createTile: function(coords, done){
        const img = document.createElement("img");
        img.alt = "";
        img.setAttribute("role", "presentation");
        const url = this.getTileUrl(coords);
        const load = retried => getToken(retried).then(t => fetch(url, { headers: { Authorization: "Bearer " + t } }))
          .then(res => {
            if (res.status === 401 && !retried) { tok = null; return load(true); }
            if (!res.ok) throw new Error("tile_" + res.status);
            return res.blob();
          });
        load(false).then(blob => {
          const u = URL.createObjectURL(blob);
          img.onload = () => { URL.revokeObjectURL(u); done(null, img); };
          img.onerror = () => { URL.revokeObjectURL(u); done(new Error("tile_decode"), img); };
          img.src = u;
        }).catch(err => done(err, img));
        return img;
      }
    });
    return OSLayer;
  }

  // Resolves a Leaflet map showing OS Outdoor, or null if OS maps aren't
  // available (no Leaflet, not signed in, function not configured).
  OSMap.createMap = async function(el, opts){
    if (!window.L) return null;
    try { await getToken(); } catch (e) { return null; }
    opts = opts || {};
    const map = L.map(el, Object.assign({ minZoom: 7, maxZoom: 18, zoomSnap: 0.5, worldCopyJump: false }, opts));
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution(
      "Contains OS data &copy; Crown copyright and database right " + new Date().getFullYear() +
      ' &middot; <a href="' + OS_TERMS + '" target="_blank" rel="noopener">Terms</a>');
    const Layer = layerClass();
    new Layer(OS_TILES, { maxNativeZoom: MAX_NATIVE_ZOOM, maxZoom: 18, minZoom: 7, tileSize: 256, detectRetina: false, keepBuffer: 2 }).addTo(map);
    return map;
  };

  // ---------------------------------------------------------------- grid references

  // WGS84 latitude/longitude -> OSGB36 National Grid easting/northing
  // (Helmert datum shift, then a transverse Mercator projection on the Airy 1830
  // ellipsoid). Good to a few metres, which is what a phone GPS is anyway.
  const D2R = Math.PI / 180;
  function toOSGB(lat, lng){
    // 1. lat/lng -> cartesian on WGS84
    const wa = 6378137, wb = 6356752.314245;
    const we2 = 1 - (wb * wb) / (wa * wa);
    const φ = lat * D2R, λ = lng * D2R;
    const sinφ = Math.sin(φ), cosφ = Math.cos(φ);
    const ν = wa / Math.sqrt(1 - we2 * sinφ * sinφ);
    const x1 = ν * cosφ * Math.cos(λ), y1 = ν * cosφ * Math.sin(λ), z1 = ν * (1 - we2) * sinφ;
    // 2. Helmert WGS84 -> OSGB36
    const tx = -446.448, ty = 125.157, tz = -542.060;
    const s = 20.4894 / 1e6 + 1;
    const as = Math.PI / 180 / 3600;
    const rx = -0.1502 * as, ry = -0.2470 * as, rz = -0.8421 * as;
    const x2 = tx + x1 * s - y1 * rz + z1 * ry;
    const y2 = ty + x1 * rz + y1 * s - z1 * rx;
    const z2 = tz - x1 * ry + y1 * rx + z1 * s;
    // 3. cartesian -> lat/lng on Airy 1830
    const a = 6377563.396, b = 6356256.909;
    const e2 = 1 - (b * b) / (a * a);
    const p = Math.sqrt(x2 * x2 + y2 * y2);
    let φ2 = Math.atan2(z2, p * (1 - e2));
    for (let i = 0; i < 10; i++) {
      const sp = Math.sin(φ2), v = a / Math.sqrt(1 - e2 * sp * sp);
      const next = Math.atan2(z2 + e2 * v * sp, p);
      if (Math.abs(next - φ2) < 1e-12) { φ2 = next; break; }
      φ2 = next;
    }
    const λ2 = Math.atan2(y2, x2);
    // 4. transverse Mercator
    const F0 = 0.9996012717, φ0 = 49 * D2R, λ0 = -2 * D2R, N0 = -100000, E0 = 400000;
    const n = (a - b) / (a + b), n2 = n * n, n3 = n * n * n;
    const sp = Math.sin(φ2), cp = Math.cos(φ2), tp = Math.tan(φ2);
    const ν2 = a * F0 / Math.sqrt(1 - e2 * sp * sp);
    const ρ = a * F0 * (1 - e2) / Math.pow(1 - e2 * sp * sp, 1.5);
    const η2 = ν2 / ρ - 1;
    const Ma = (1 + n + (5 / 4) * n2 + (5 / 4) * n3) * (φ2 - φ0);
    const Mb = (3 * n + 3 * n * n + (21 / 8) * n3) * Math.sin(φ2 - φ0) * Math.cos(φ2 + φ0);
    const Mc = ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * (φ2 - φ0)) * Math.cos(2 * (φ2 + φ0));
    const Md = (35 / 24) * n3 * Math.sin(3 * (φ2 - φ0)) * Math.cos(3 * (φ2 + φ0));
    const M = b * F0 * (Ma - Mb + Mc - Md);
    const cp3 = cp * cp * cp, cp5 = cp3 * cp * cp;
    const tp2 = tp * tp, tp4 = tp2 * tp2;
    const I = M + N0;
    const II = (ν2 / 2) * sp * cp;
    const III = (ν2 / 24) * sp * cp3 * (5 - tp2 + 9 * η2);
    const IIIA = (ν2 / 720) * sp * cp5 * (61 - 58 * tp2 + tp4);
    const IV = ν2 * cp;
    const V = (ν2 / 6) * cp3 * (ν2 / ρ - tp2);
    const VI = (ν2 / 120) * cp5 * (5 - 18 * tp2 + tp4 + 14 * η2 - 58 * tp2 * η2);
    const dλ = λ2 - λ0, dλ2 = dλ * dλ;
    const N = I + II * dλ2 + III * dλ2 * dλ2 + IIIA * dλ2 * dλ2 * dλ2;
    const E = E0 + IV * dλ + V * dλ2 * dλ + VI * dλ2 * dλ2 * dλ;
    return { e: E, n: N };
  }
  OSMap.toOSGB = toOSGB;

  const GRID_LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ";   // no I
  // digits: 6 -> "NY 342 151", 10 -> "NY 34200 15100". Returns "" outside the grid.
  OSMap.gridRef = function(lat, lng, digits){
    const p = toOSGB(lat, lng);
    return gridRefFromEN(p.e, p.n, digits == null ? 10 : digits);
  };
  function gridRefFromEN(E, N, digits){
    if (!(E >= 0 && E < 700000 && N >= 0 && N < 1300000)) return "";
    const e100k = Math.floor(E / 100000), n100k = Math.floor(N / 100000);
    const l1 = (19 - n100k) - (19 - n100k) % 5 + Math.floor((e100k + 10) / 5);
    const l2 = (19 - n100k) * 5 % 25 + e100k % 5;
    const half = digits / 2;
    const div = Math.pow(10, 5 - half);
    const pad = v => String(Math.floor((v % 100000) / div)).padStart(half, "0");
    return GRID_LETTERS[l1] + GRID_LETTERS[l2] + " " + pad(E) + " " + pad(N);
  }
  OSMap.eastingNorthing = (lat, lng) => { const p = toOSGB(lat, lng); return { e: Math.round(p.e), n: Math.round(p.n) }; };

  // ---------------------------------------------------------------- nearest fells

  function distanceM(lat1, lng1, lat2, lng2){
    const R = 6371000, dφ = (lat2 - lat1) * D2R, dλ = (lng2 - lng1) * D2R;
    const a = Math.sin(dφ / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dλ / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function bearingDeg(lat1, lng1, lat2, lng2){
    const φ1 = lat1 * D2R, φ2 = lat2 * D2R, dλ = (lng2 - lng1) * D2R;
    const y = Math.sin(dλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
    return (Math.atan2(y, x) / D2R + 360) % 360;
  }
  const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const compass = deg => POINTS[Math.round(deg / 22.5) % 16];
  const fmtDist = m => m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(m < 10000 ? 1 : 0) + " km";
  OSMap.distanceM = distanceM;

  // The n closest Wainwrights, each with distance (m) and the bearing to walk to reach it.
  OSMap.nearestFells = function(lat, lng, n){
    const out = [];
    if (typeof FELLS_DATA === "undefined") return out;
    FELLS_DATA.forEach(area => area.fells.forEach(f => {
      if (f.lat == null || f.lng == null) return;
      out.push({ fell: f, m: distanceM(lat, lng, f.lat, f.lng), bearing: bearingDeg(lat, lng, f.lat, f.lng) });
    }));
    out.sort((a, b) => a.m - b.m);
    return out.slice(0, n || 3);
  };

  // ---------------------------------------------------------------- OS Names (nearest named place)

  async function nearestPlace(E, N){
    let t;
    try { t = await getToken(); } catch (e) { return null; }
    const url = OS_NAMES_NEAREST + "?point=" + Math.round(E) + "," + Math.round(N) + "&radius=1000&format=JSON";
    try {
      const res = await fetch(url, { headers: { Authorization: "Bearer " + t } });
      if (!res.ok) return null;
      const d = await res.json();
      const r = d && d.results && d.results[0] && d.results[0].GAZETTEER_ENTRY;
      if (!r || !r.NAME1) return null;
      return { name: r.NAME1, type: r.LOCAL_TYPE || "", district: r.DISTRICT_BOROUGH || r.COUNTY_UNITARY || "" };
    } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- Where am I?

  let sheet = null, watchId = null;

  function closeSheet(){
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    if (sheet) { sheet.remove(); sheet = null; }
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e){ if (e.key === "Escape") closeSheet(); }

  async function copyText(text, btn){
    const orig = btn.textContent;
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
    catch (e) {
      // clipboard blocked: select the text instead so it can be copied by hand
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); btn.textContent = "Copied"; } catch (e2) { btn.textContent = "Copy failed"; }
      ta.remove();
    }
    setTimeout(() => { btn.textContent = orig; }, 1600);
  }

  OSMap.whereAmI = function(){
    if (sheet) return;
    sheet = document.createElement("div");
    sheet.className = "terms-modal where-modal";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "where-title");
    sheet.innerHTML =
      '<div class="terms-card">' +
        '<h3 id="where-title">Where am I?</h3>' +
        '<div class="terms-body" id="where-body"><p class="where-status">Finding you&hellip;</p></div>' +
        '<button type="button" class="btn" id="where-close">Close</button>' +
      '</div>';
    document.body.appendChild(sheet);
    sheet.querySelector("#where-close").addEventListener("click", closeSheet);
    sheet.addEventListener("click", e => { if (e.target === sheet) closeSheet(); });
    document.addEventListener("keydown", onKey);
    sheet.querySelector("#where-close").focus();

    const body = sheet.querySelector("#where-body");
    if (!navigator.geolocation) { body.innerHTML = '<p class="where-status">This browser can\'t share its location.</p>'; return; }
    if (window.isSecureContext === false) { body.innerHTML = '<p class="where-status">Location only works on a secure (https) page.</p>'; return; }

    let placeFor = "", place = null;   // OS Names result, looked up once per ~100 m of movement
    const render = pos => {
      if (!sheet) return;
      const c = pos.coords, lat = c.latitude, lng = c.longitude;
      const en = OSMap.eastingNorthing(lat, lng);
      const g10 = gridRefFromEN(en.e, en.n, 10), g6 = gridRefFromEN(en.e, en.n, 6);
      const acc = Math.round(c.accuracy);
      const near = OSMap.nearestFells(lat, lng, 3);
      const first = near[0];
      const outside = !g10;

      const placeKey = Math.round(en.e / 100) + "," + Math.round(en.n / 100);
      if (!outside && placeKey !== placeFor) {
        placeFor = placeKey; place = null;
        nearestPlace(en.e, en.n).then(p => { if (sheet && placeFor === placeKey) { place = p; paint(); } });
      }

      const message = outside ? "" :
        "I'm at grid reference " + g10 + " (E " + en.e + " N " + en.n + ", accuracy about " + acc + " m). " +
        (first ? "Nearest summit: " + first.fell.name + ", " + fmtDist(first.m) + " " + compass(first.bearing) + " of me. " : "") +
        "Lat/long " + lat.toFixed(5) + ", " + lng.toFixed(5) + ".";

      function paint(){
        if (!sheet) return;
        body.innerHTML =
          (outside
            ? '<p class="where-status">You appear to be outside Great Britain, so there\'s no National Grid reference. Lat/long: ' + lat.toFixed(5) + ", " + lng.toFixed(5) + '</p>'
            : '<div class="where-ref" aria-label="Grid reference">' + esc(g10) + '</div>' +
              '<p class="where-sub">' + esc(g6) + ' (6-figure) &middot; E ' + en.e + ' N ' + en.n + '</p>') +
          '<p class="where-sub">' + lat.toFixed(5) + ", " + lng.toFixed(5) +
            ' &middot; &plusmn;' + acc + ' m' + (c.altitude != null && isFinite(c.altitude) ? ' &middot; ' + Math.round(c.altitude) + ' m up' : '') + '</p>' +
          (acc > 100 ? '<p class="where-warn">GPS accuracy is poor (&plusmn;' + acc + ' m). Give it a minute in the open and this will tighten up.</p>' : '') +
          (place ? '<p class="where-place">Near <strong>' + esc(place.name) + '</strong>' + (place.type ? ' (' + esc(place.type.toLowerCase()) + ')' : '') + (place.district ? ', ' + esc(place.district) : '') + '</p>' : '') +
          '<h4 class="where-h">Nearest summits</h4><ul class="where-fells">' +
            near.map(x => '<li><strong>' + esc(x.fell.name) + '</strong> ' + x.fell.m + ' m &mdash; ' + (x.m < 30 ? 'you\'re on it' : fmtDist(x.m) + ' ' + compass(x.bearing)) + '</li>').join("") +
          '</ul>' +
          (outside ? '' : '<p class="where-actions"><button type="button" class="btn" id="where-copy-ref">Copy grid ref</button> <button type="button" class="btn" id="where-copy-msg">Copy full message</button> <a class="btn" href="emergency.html">Emergency card</a></p>') +
          '<p class="where-sos">In an emergency call <strong>999</strong>, ask for <strong>Police</strong>, then <strong>Mountain Rescue</strong>, and read out the grid reference above. Don\'t rely on this page &mdash; carry a paper map and compass.</p>' +
          '<p class="where-fine">Updates while this is open. Your position isn\'t sent anywhere except to look up the nearest place name.</p>';
        const r = sheet.querySelector("#where-copy-ref"), m = sheet.querySelector("#where-copy-msg");
        if (r) r.addEventListener("click", () => copyText(g10, r));
        if (m) m.addEventListener("click", () => copyText(message, m));
      }
      paint();
    };
    const fail = err => {
      if (!sheet) return;
      const msg = err && err.code === 1 ? "Location permission was denied. Allow location for this site in your browser settings, then try again."
        : err && err.code === 3 ? "Couldn't get a GPS fix in time. Step into the open and try again."
        : "Couldn't work out where you are.";
      body.innerHTML = '<p class="where-status">' + msg + '</p>';
    };
    watchId = navigator.geolocation.watchPosition(render, fail, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  };
})();
