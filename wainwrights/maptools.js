(function(){
  "use strict";

  // Small OS-map helpers used by the planner (a map on each walk card), the hike page (the walk and, for the
  // host and approved walkers only, the meeting point) and the meeting-point picker on the host forms.
  // Everything sits on OSMap.createMap (osmap.js), so it needs a signed-in user and Leaflet; if either is missing the box
  // says so and the page carries on. Tiles are only requested when someone asks for a map.
  //
  //   WWMaps.view(el, { fells: [{name,lat,lng,m}], start: {lat,lng,name}, parks: [{lat,lng,name}], meet: {lat,lng}, climbed: {name:true} })
  //   WWMaps.pick(el, { lat, lng, fells, onChange(lat, lng) })   -> { map, point() } ; tap or drag the pin
  //   WWMaps.fell(name) -> the fell record from FELLS_DATA (or null)

  const T = window.WWMaps = {};
  // FELLS_DATA is a top-level const in fells-data.js (not a window property), so read it by name, once, when first needed
  let byName = null;
  const index = () => {
    if (byName) return byName;
    byName = {};
    if (typeof FELLS_DATA !== "undefined") FELLS_DATA.forEach(a => a.fells.forEach(f => { byName[f.name] = f; }));
    return byName;
  };
  T.fell = name => index()[name] || null;
  T.fells = names => (names || []).map(n => index()[n]).filter(Boolean);

  // Where the hike forms accept a meeting point (same box as the database check in hike_check_fields)
  const BOX = { s: 53.8, n: 55.2, w: -3.8, e: -2.2 };
  T.inBox = (lat, lng) => lat >= BOX.s && lat <= BOX.n && lng >= BOX.w && lng <= BOX.e;
  const CENTRE = [54.5, -3.05];

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pin = cls => L.divIcon({ className: "ww-pin " + cls, html: "<span></span>", iconSize: [26, 34], iconAnchor: [13, 34], tooltipAnchor: [0, -30] });
  const numPin = (n, cls) => L.divIcon({ className: "ww-num " + (cls || ""), html: "<b>" + n + "</b>", iconSize: [26, 26], iconAnchor: [13, 13], tooltipAnchor: [0, -14] });
  const parkTip = p => esc(p.name) + (p.fee === "pay" ? " · pay" : p.fee === "free" ? " · free" : "") + (p.distM != null ? " · " + (p.distM < 1000 ? Math.round(p.distM / 10) * 10 + " m" : (p.distM / 1000).toFixed(1) + " km") + " from the start" : "");
  const note = (el, msg) => { el.classList.remove("os-map"); el.innerHTML = '<p class="map-note">' + esc(msg) + "</p>"; };

  async function baseMap(el){
    if (!window.L || !window.OSMap) { note(el, "The map couldn't load. Check your connection and reload."); return null; }
    el.classList.add("os-map", "os-map-small");
    const map = await OSMap.createMap(el, {});
    if (!map) { note(el, "The OS map isn't available right now."); return null; }
    return map;
  }

  // Numbered car park markers (replaces any shown before). onPick(park, index) makes them tappable; fit zooms to include them.
  T.setParks = function(map, parks, o){
    o = o || {};
    if (!map) return;
    if (map.__parks) map.removeLayer(map.__parks);
    const g = L.layerGroup();
    (parks || []).forEach((p, i) => {
      const mk = L.marker([p.lat, p.lng], { icon: numPin(i + 1, "is-park"), zIndexOffset: 500 }).bindTooltip(parkTip(p));
      if (o.onPick) mk.on("click", () => o.onPick(p, i));
      g.addLayer(mk);
    });
    g.addTo(map);
    map.__parks = g;
    if (o.fit && parks && parks.length) {
      map.fitBounds((map.__pts || []).concat(parks.map(p => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 16 });
    }
  };

  T.view = async function(el, o){
    o = o || {};
    const map = await baseMap(el);
    if (!map) return null;
    const pts = [];
    (o.fells || []).forEach(f => {
      if (!f || f.lat == null || f.lng == null) return;
      const done = o.climbed && o.climbed[f.name];
      L.circleMarker([f.lat, f.lng], { radius: 7, weight: 2, color: "#1f3d2b", fillColor: done ? "#1f3d2b" : "#ffffff", fillOpacity: 0.92 })
        .bindTooltip(esc(f.name) + (f.m ? " · " + f.m + " m" : "") + (done ? " · climbed" : "")).addTo(map);
      pts.push([f.lat, f.lng]);
    });
    (o.parks || []).forEach(p => pts.push([p.lat, p.lng]));
    if (o.start) {
      L.marker([o.start.lat, o.start.lng], { icon: pin("is-start") }).bindTooltip("Start (approximate): " + esc(o.start.name || "parking")).addTo(map);
      pts.push([o.start.lat, o.start.lng]);
    }
    if (o.meet) {
      L.marker([o.meet.lat, o.meet.lng], { icon: pin("is-meet") }).bindTooltip("Meeting point").addTo(map);
      pts.push([o.meet.lat, o.meet.lng]);
    }
    if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
    else if (pts.length === 1) map.setView(pts[0], 14);
    else map.setView(CENTRE, 10);
    map.__pts = pts;
    if (o.parks && o.parks.length) T.setParks(map, o.parks, {});
    return map;
  };

  // A map with one movable pin. The caller is told every time it moves (tap on the map, or drag the pin).
  T.pick = async function(el, o){
    o = o || {};
    const map = await baseMap(el);
    if (!map) return null;
    let marker = null;
    const set = (lat, lng, quiet) => {
      lat = Number(Number(lat).toFixed(5)); lng = Number(Number(lng).toFixed(5));
      if (!marker) {
        marker = L.marker([lat, lng], { icon: pin("is-meet"), draggable: true }).addTo(map);
        marker.on("dragend", () => { const p = marker.getLatLng(); set(p.lat, p.lng); });
      } else marker.setLatLng([lat, lng]);
      if (!quiet && o.onChange) o.onChange(lat, lng);
    };
    // context: the walk's fells, so it's clear where the pin sits relative to the hills
    (o.fells || []).forEach(f => {
      if (f && f.lat != null) L.circleMarker([f.lat, f.lng], { radius: 5, weight: 2, color: "#1f3d2b", fillColor: "#fff", fillOpacity: 0.9 }).bindTooltip(esc(f.name)).addTo(map);
    });
    map.on("click", e => set(e.latlng.lat, e.latlng.lng));
    // the walk's own start point (blue pin): tap it to use it as the meeting point
    const startPt = o.start && o.start.lat != null && !isNaN(o.start.lat) ? [Number(o.start.lat), Number(o.start.lng)] : null;
    if (startPt) {
      L.marker(startPt, { icon: pin("is-start"), zIndexOffset: 200 }).bindTooltip("Walk start: " + esc(o.start.name || "parking") + " (tap to use it)")
        .on("click", () => set(startPt[0], startPt[1])).addTo(map);
    }
    const have = o.lat != null && o.lng != null && !isNaN(o.lat) && !isNaN(o.lng);
    if (have) { set(o.lat, o.lng, true); map.setView([o.lat, o.lng], 15); }
    else {
      const pts = (o.fells || []).filter(f => f && f.lat != null).map(f => [f.lat, f.lng]);
      if (startPt) pts.push(startPt);
      if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 }); else if (pts.length === 1) map.setView(pts[0], 14); else map.setView(CENTRE, 10);
    }
    map.__pts = (o.fells || []).filter(f => f && f.lat != null).map(f => [f.lat, f.lng]).concat(startPt ? [startPt] : []);
    return {
      map,
      point: () => (marker ? marker.getLatLng() : null),
      moveTo: (lat, lng) => { set(lat, lng); map.panTo([lat, lng]); },
      setParks: (parks, onPick) => T.setParks(map, parks, { onPick, fit: true })
    };
  };
})();
