(function(){
  "use strict";

  // Community heat map on the leaderboard page: how many people have ticked each fell.
  //
  // Opt-in and anonymous. Joining the leaderboard does not add anyone: the leaderboard terms
  // promise that specific fells aren't shared, so this has its own checkbox ("Include my ticked
  // fells, anonymously"). The database only returns counts per fell, nothing until 5 people have
  // opted in, and nothing for a fell with fewer than 3 ticks (supabase/migrations/
  // 20261106110000_wainwrights_fell_heatmap.sql). Two views of the same data: a schematic drawn
  // from each fell's position (always works, no network needed beyond the data) and the OS map.
  //
  // leaderboard.js calls WWHeat.init(user) once and WWHeat.refresh() after someone joins or
  // leaves the leaderboard (WW.onAuthReady only holds one callback, so this can't register its own).

  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  // Sequential teal ramp (more walkers = darker). Deliberately not the red/amber difficulty ramp.
  const RAMP = [["", ""], ["#d9ecf0", "#12404f"], ["#a5d0dc", "#0f3a48"], ["#6fb0c6", "#08303d"], ["#3a8aa8", "#ffffff"], ["#165c7a", "#ffffff"]];

  const S = { user: null, data: null, mine: null, view: "sketch", map: null, busy: false };
  const $ = id => document.getElementById(id);

  const fells = (function(){
    const out = [];
    if (typeof FELLS_DATA !== "undefined") FELLS_DATA.forEach(b => b.fells.forEach(f => out.push(f)));
    return out;
  })();

  function bucketFor(count, min, max){
    if (!count) return 0;
    const t = max > min ? (count - min) / (max - min) : 1;
    return 1 + Math.min(4, Math.floor(t * 5));
  }

  function summarise(){
    const counts = Object.create(null);
    (S.data.fells || []).forEach(r => { counts[r.name] = Number(r.count); });
    const vals = Object.values(counts);
    return { counts, min: vals.length ? Math.min.apply(null, vals) : 0, max: vals.length ? Math.max.apply(null, vals) : 0 };
  }

  function destroyMap(){ if (S.map) { try { S.map.remove(); } catch (e) {} S.map = null; } }

  // ---------------------------------------------------------------- views

  function sketchSvg(sum){
    const ordered = fells.slice().sort((a, b) => (sum.counts[a.name] || 0) - (sum.counts[b.name] || 0));   // darkest on top
    let s = '<svg id="heat-svg" class="heat-svg" viewBox="30 30 930 850" role="img" aria-label="Map of the fells shaded by how many walkers have climbed each">';
    ordered.forEach(f => {
      const n = sum.counts[f.name] || 0, b = bucketFor(n, sum.min, sum.max);
      const title = esc(f.name) + (n ? " — climbed by " + n + " walker" + (n === 1 ? "" : "s") : " — fewer than " + S.data.min_per_fell + " walkers so far");
      s += b
        ? '<circle cx="' + f.x + '" cy="' + f.y + '" r="' + (9 + b * 3) + '" fill="' + RAMP[b][0] + '" fill-opacity="0.85" stroke="#165c7a" stroke-width="1"><title>' + title + "</title></circle>"
        : '<circle cx="' + f.x + '" cy="' + f.y + '" r="4.5" fill="none" stroke="#9a9684" stroke-width="1.2"><title>' + title + "</title></circle>";
    });
    return s + "</svg>";
  }

  async function paintOsMap(sum){
    const el = $("heat-os");
    if (!el) return false;
    el.style.display = "";
    const map = (window.OSMap && window.L) ? await OSMap.createMap(el) : null;
    if (!map) { el.style.display = "none"; return false; }
    S.map = map;
    const pts = [];
    fells.slice().sort((a, b) => (sum.counts[a.name] || 0) - (sum.counts[b.name] || 0)).forEach(f => {
      if (f.lat == null) return;
      const n = sum.counts[f.name] || 0, b = bucketFor(n, sum.min, sum.max);
      const m = L.circleMarker([f.lat, f.lng], b
        ? { radius: 5 + b * 2.4, color: "#165c7a", weight: 1, fillColor: RAMP[b][0], fillOpacity: 0.85 }
        : { radius: 3.5, color: "#6b6858", weight: 1.2, fillColor: "#ffffff", fillOpacity: 0.4 }).addTo(map);
      m.bindTooltip(f.name + (n ? " · " + n + " walker" + (n === 1 ? "" : "s") : " · fewer than " + S.data.min_per_fell), { direction: "top", offset: [0, -3] });
      pts.push([f.lat, f.lng]);
    });
    map.fitBounds(pts, { padding: [24, 24] });
    return true;
  }

  function legendHtml(sum){
    return '<div class="heat-legend" aria-hidden="true"><span>fewer walkers</span>' +
      [1, 2, 3, 4, 5].map(b => '<span class="heat-swatch" style="background:' + RAMP[b][0] + '"></span>').join("") +
      '<span>more (' + sum.max + ')</span><span class="heat-swatch heat-none"></span><span>under ' + S.data.min_per_fell + ' / none yet</span></div>';
  }

  function topList(sum){
    const top = (S.data.fells || []).slice(0, 5);
    if (!top.length) return "";
    const quiet = fells.filter(f => !sum.counts[f.name]).length;
    return '<div class="heat-top"><h4 class="where-h">Most climbed</h4><ol>' +
      top.map(r => "<li><strong>" + esc(r.name) + "</strong> <span class=\"heat-n\">" + Number(r.count) + " walkers</span></li>").join("") +
      "</ol><p class=\"lb-intro\">" + quiet + " fells have been climbed by fewer than " + S.data.min_per_fell + " opted-in walkers so far, so they're left blank.</p></div>";
  }

  // ---------------------------------------------------------------- card

  function optInHtml(){
    if (S.mine === null) return '<p class="lb-intro">Join the leaderboard above if you want to add your own ticks to this map.</p>';
    return '<label class="plan-check heat-optin"><input type="checkbox" id="heat-optin"' + (S.mine ? " checked" : "") + '> Include my ticked fells in this map, anonymously</label>' +
      '<p class="lb-intro">Only a count per fell is shown, never who ticked what. Nothing is shown until at least ' + (S.data ? S.data.min_contributors : 5) + ' people have opted in. Untick any time and your ticks drop out straight away.</p>' +
      '<p class="lock-error" id="heat-error" style="display:none;"></p>';
  }

  async function render(){
    const body = $("heat-body");
    if (!body) return;
    destroyMap();
    if (!S.data) { body.innerHTML = '<p class="lb-empty">Couldn\'t load the map right now.</p>' + optInHtml(); wire(); return; }
    if (S.data.contributors == null) {
      body.innerHTML = '<p class="lb-empty">Not enough walkers have opted in yet. The map appears once ' + S.data.min_contributors + ' people have, so nobody\'s own ticks can be picked out.</p>' + optInHtml();
      wire(); return;
    }
    const sum = summarise();
    body.innerHTML =
      '<p class="lb-intro">' + S.data.contributors + ' walkers have added their ticks. Darker means more of them have climbed that fell.</p>' +
      '<div class="map-tools"><div class="map-modes" role="group" aria-label="Map style">' +
        '<button type="button" class="map-mode' + (S.view === "sketch" ? " is-on" : "") + '" data-heat-view="sketch" aria-pressed="' + (S.view === "sketch") + '">Sketch</button>' +
        '<button type="button" class="map-mode' + (S.view === "os" ? " is-on" : "") + '" data-heat-view="os" aria-pressed="' + (S.view === "os") + '">OS map</button></div></div>' +
      '<div class="map-card heat-card-map"><div id="heat-sketch"' + (S.view === "os" ? ' style="display:none;"' : "") + ">" + sketchSvg(sum) + "</div>" +
      '<div id="heat-os" class="os-map" style="display:none;" role="application" aria-label="Ordnance Survey map shaded by how many walkers have climbed each fell"></div>' +
      '<p class="map-note" id="heat-note" style="display:none;"></p></div>' +
      legendHtml(sum) + topList(sum) + optInHtml();
    wire();
    if (S.view === "os") await showView("os");
  }

  async function showView(v){
    const sum = S.data && S.data.contributors != null ? summarise() : null;
    if (!sum) return;
    const sk = $("heat-sketch"), os = $("heat-os"), note = $("heat-note");
    note.style.display = "none";
    let want = v;
    if (v === "os") {
      sk.style.display = "none";
      destroyMap();
      const ok = await paintOsMap(sum);
      if (!ok) { want = "sketch"; note.textContent = "The OS map isn't available right now, so you're seeing the sketch."; note.style.display = ""; }
    }
    if (want === "sketch") { destroyMap(); if (os) os.style.display = "none"; sk.style.display = ""; }
    S.view = want;
    document.querySelectorAll("[data-heat-view]").forEach(b => { const on = b.dataset.heatView === want; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); });
  }

  function wire(){
    document.querySelectorAll("[data-heat-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.heatView)));
    const cb = $("heat-optin");
    if (cb) cb.addEventListener("change", async () => {
      const want = cb.checked, err = $("heat-error");
      cb.disabled = true; if (err) err.style.display = "none";
      const { error } = await WW.sb.rpc("set_heatmap_sharing", { p_on: want });
      if (error) {
        cb.checked = !want; cb.disabled = false;
        if (err) { err.textContent = /not_on_leaderboard/.test(error.message || "") ? "Join the leaderboard first." : "Couldn't save that. Try again."; err.style.display = "block"; }
        return;
      }
      S.mine = want;
      await load();
    });
  }

  async function load(){
    if (!WW.sb) return;
    const [heat, mine] = await Promise.all([
      WW.sb.rpc("wainwright_fell_heat").then(r => r, () => ({ error: true })),
      WW.sb.rpc("my_heatmap_sharing").then(r => r, () => ({ error: true }))
    ]);
    S.data = (!heat.error && heat.data && typeof heat.data === "object") ? heat.data : null;
    S.mine = mine.error ? null : (mine.data === true ? true : mine.data === false ? false : null);
    await render();
  }

  window.WWHeat = {
    init(user){ S.user = user; return load(); },
    refresh(){ return load(); }
  };
})();
