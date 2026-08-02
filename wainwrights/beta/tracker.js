(function(){
  "use strict";

  const DASHBOARD_ID = "wainwrights";
  const TABLE = "checkbox_states";

  const TOTAL = FELLS_DATA.reduce((n,a)=>n+a.fells.length,0);
  const ROMAN = ["I","II","III","IV","V","VI","VII"];
  const MOUNTAIN_M = 610; // 2,000ft — conventional England hill/mountain line
  const MTN_ICON = '<svg viewBox="0 0 14 11" aria-hidden="true"><path d="M1 10 L4 4 L6 6.5 L9 2 L11 5 L13 10 Z"></path></svg>';
  const FLAG_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1 L3 13" stroke="currentColor" stroke-width="1.3" fill="none"></path><path d="M3 2 L11 4.3 L3 6.6 Z"></path></svg>';

  const CHALLENGES = {
    three_peaks: {
      label: "National Three Peaks Challenge",
      blurb: "Climb the highest peaks of England, Scotland and Wales — Ben Nevis, Scafell Pike and Snowdon — within 24 hours. Scafell Pike is the England leg; the other two aren't in the Lake District.",
      url: "https://en.wikipedia.org/wiki/National_Three_Peaks_Challenge"
    },
    bob_graham: {
      label: "Bob Graham Round",
      blurb: "A gruelling 24-hour fell-running challenge tracing 42 Lakeland summits — 66 miles and around 8,200m of ascent — starting and finishing at Keswick's Moot Hall. First completed by Bob Graham in 1932.",
      url: "https://www.bobgrahamclub.org.uk/"
    },
    "10in10": {
      label: "10in10 Challenge",
      blurb: "An annual charity walk for the MS Society: 10 peaks in the Newlands Valley near Keswick, climbed in 10 hours. Running since 2011.",
      url: "https://www.10in10.org.uk/"
    },
    challenge5: {
      label: "Challenge 5",
      blurb: "A shorter, family-friendly version of 10in10 — 5 peaks in the Newlands Valley, also in aid of the MS Society.",
      url: "https://www.10in10.org.uk/events/challenge-5/"
    }
  };

  const escapeHtml = WW.escapeHtml;

  // state: { "<fell name>": true|false }
  let state = {};
  let expandedAreas = new Set();
  let searchQuery = "";

  function defaultState(){
    const s = {};
    FELLS_DATA.forEach(area=>{
      area.fells.forEach(f=>{
        s[f.name] = !!f.climbed;
      });
    });
    return s;
  }

  // load: spreadsheet baseline, overridden by anything already saved in Supabase
  async function loadState(userId){
    const fallback = defaultState();
    if(!WW.sb){
      showSyncStatus("offline", "Supabase not available — using local defaults only.");
      return fallback;
    }
    try{
      const { data, error } = await WW.sb
        .from(TABLE)
        .select("item_id,is_checked")
        .eq("dashboard_id", DASHBOARD_ID)
        .eq("user_id", userId);
      if(error) throw error;
      const merged = Object.assign({}, fallback);
      (data || []).forEach(row=>{ merged[row.item_id] = !!row.is_checked; });
      showSyncStatus("ok");
      return merged;
    }catch(e){
      console.error("Supabase load failed", e);
      showSyncStatus("error", "Couldn't reach Supabase — showing your last known state.");
      return fallback;
    }
  }

  // save one fell's state the moment its checkbox changes
  async function upsertFell(name, checked){
    if(!WW.sb || !WW.currentUser){ showSyncStatus("offline"); return; }
    try{
      const { error } = await WW.sb
        .from(TABLE)
        .upsert(
          { dashboard_id: DASHBOARD_ID, item_id: name, is_checked: checked, user_id: WW.currentUser.id },
          { onConflict: "user_id,dashboard_id,item_id" }
        );
      if(error) throw error;
      flashSaved();
      showSyncStatus("ok");
    }catch(e){
      console.error("Supabase save failed", e);
      showSyncStatus("error", "Couldn't save that tick to Supabase — it'll stay local for now.");
    }
  }

  // live sync: reflect ticks made elsewhere (another tab/device) immediately
  function subscribeRealtime(userId){
    if(!WW.sb) return;
    WW.sb.channel("checkbox_states_" + userId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: "user_id=eq." + userId },
        (payload)=>{
          const row = (payload.eventType === "DELETE") ? payload.old : payload.new;
          if(!row || !row.item_id) return;
          const checked = (payload.eventType === "DELETE") ? false : !!row.is_checked;
          if(state[row.item_id] !== checked){
            state[row.item_id] = checked;
            renderAll();
          }
        })
      .subscribe();
  }

  function showSyncStatus(kind, msg){
    const el = document.getElementById("sync-status");
    if(!el) return;
    el.classList.toggle("is-error", kind === "error");
    el.classList.toggle("is-offline", kind === "offline");
    el.textContent = msg || (kind === "ok" ? "" : "");
    el.style.display = msg ? "block" : "none";
  }

  function flashSaved(){
    const el = document.getElementById("save-flash");
    el.classList.add("show");
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(()=> el.classList.remove("show"), 1200);
  }

  // ---------- computed stats ----------

  function computeCounts(){
    let climbed = 0, elevation = 0;
    FELLS_DATA.forEach(area=> area.fells.forEach(f=>{
      if(state[f.name]){ climbed++; elevation += f.m; }
    }));
    return { climbed, remaining: TOTAL - climbed, percent: Math.round((climbed/TOTAL)*100), elevation };
  }

  function computeAreaCounts(area){
    let climbed = 0;
    area.fells.forEach(f=>{ if(state[f.name]) climbed++; });
    return { climbed, total: area.fells.length, percent: area.fells.length ? Math.round((climbed/area.fells.length)*100) : 0 };
  }

  // ---------- render: hero ----------

  function renderHero(){
    const { climbed, remaining, percent, elevation } = computeCounts();
    document.getElementById("stat-climbed").innerHTML = climbed + "<small> / " + TOTAL + "</small>";
    document.getElementById("stat-remaining").textContent = remaining;
    document.getElementById("stat-percent").textContent = percent + "%";
    document.getElementById("stat-elevation").textContent = elevation.toLocaleString() + "m";
  }

  function renderSkyline(){
    const wrap = document.getElementById("skyline");
    const divWrap = document.getElementById("skyline-divisions");
    const allHeights = [];
    FELLS_DATA.forEach(a=> a.fells.forEach(f=> allHeights.push(f.m)));
    const maxH = Math.max.apply(null, allHeights);
    const minH = Math.min.apply(null, allHeights);

    let html = "";
    FELLS_DATA.forEach((area, ai)=>{
      area.fells.forEach((f, fi)=>{
        const pct = 18 + ((f.m - minH) / (maxH - minH)) * 82; // keep a visible baseline
        const climbed = !!state[f.name];
        html += '<div class="peak' + (climbed ? ' is-climbed' : '') +
          '" style="height:' + pct.toFixed(1) + '%" data-area="' + ai + '" data-fell="' + fi +
          '" title="' + escapeHtml(f.name) + ' · ' + f.m + 'm · ' + (climbed ? 'climbed' : 'not yet') + '"></div>';
      });
    });
    wrap.innerHTML = html;

    const thresholdPct = 18 + ((MOUNTAIN_M - minH) / (maxH - minH)) * 82;
    const line = document.createElement("div");
    line.className = "mountain-line";
    line.style.bottom = thresholdPct.toFixed(1) + "%";
    line.title = "2,000ft / 610m — the conventional line between a hill and a mountain in England";
    const label = document.createElement("span");
    label.className = "mountain-line-label";
    label.textContent = "2,000ft";
    line.appendChild(label);
    wrap.appendChild(line);

    let divHtml = "";
    FELLS_DATA.forEach((area, ai)=>{
      divHtml += '<div class="division" style="flex:' + area.fells.length + '">' + ROMAN[ai] + '</div>';
    });
    divWrap.innerHTML = divHtml;
  }

  // ---------- render: charts ----------

  const RING_R = 44;
  const RING_C = 2 * Math.PI * RING_R;

  function renderCharts(){
    const el = document.getElementById("chart-books");
    let html = '<div class="region-grid">';
    FELLS_DATA.forEach((area, ai)=>{
      const c = computeAreaCounts(area);
      const offset = RING_C * (1 - c.percent/100);
      const complete = c.percent === 100;
      html += '<div class="region-card' + (complete ? ' is-complete' : '') + '" data-area="' + ai + '">';
      html += '  <div class="ring-wrap">';
      html += '    <svg class="ring" viewBox="0 0 100 100">';
      html += '      <circle class="ring-track" cx="50" cy="50" r="' + RING_R + '"></circle>';
      html += '      <circle class="ring-fill" cx="50" cy="50" r="' + RING_R + '" stroke-dasharray="' + RING_C.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"></circle>';
      html += '    </svg>';
      html += '    <div class="ring-center"><div class="ring-percent">' + c.percent + '%</div><div class="ring-count">' + c.climbed + ' / ' + c.total + '</div></div>';
      html += '  </div>';
      html += '  <div class="region-label"><span class="num">' + ROMAN[ai] + '</span><span class="name">' + escapeHtml(area.name.replace(/^The /,'')) + '</span></div>';
      html += '</div>';
    });
    html += '</div>';
    el.innerHTML = html;

    el.querySelectorAll(".region-card").forEach(card=>{
      card.onclick = ()=> jumpToArea(parseInt(card.dataset.area,10));
    });
  }

  // ---------- render: areas ----------

  function fellMatchesSearch(f){
    if(!searchQuery) return true;
    return f.name.toLowerCase().indexOf(searchQuery) !== -1;
  }

  function renderAreas(){
    const container = document.getElementById("areas");
    let html = "";

    FELLS_DATA.forEach((area, ai)=>{
      const counts = computeAreaCounts(area);
      const matches = area.fells.filter(fellMatchesSearch);
      const searching = searchQuery.length > 0;
      const isOpen = searching ? matches.length > 0 : expandedAreas.has(ai);
      if(searching && matches.length === 0) return;

      html += '<section class="area' + (isOpen ? ' is-open' : '') + '" data-area-idx="' + ai + '">';
      html += '<button class="area-header" data-toggle="' + ai + '" aria-expanded="' + isOpen + '">';
      html += '  <span class="area-num">' + ROMAN[ai] + '</span>';
      html += '  <span class="area-name-wrap"><span class="area-name">' + escapeHtml(area.name) + '</span> <span class="area-year">' + area.year + '</span></span>';
      html += '  <span class="area-progress-wrap"><span class="bar-track"><span class="bar-fill" style="width:' + counts.percent + '%"></span></span></span>';
      html += '  <span class="area-count">' + counts.climbed + ' / ' + counts.total + '</span>';
      html += '  <span class="chevron">▾</span>';
      html += '</button>';

      html += '<div class="area-body" id="area-body-' + ai + '"' + (isOpen ? '' : ' hidden') + '>';
      if(matches.length === 0){
        html += '<div class="area-empty-search">No fells match “' + escapeHtml(searchQuery) + '” in this region.</div>';
      } else {
        html += '<table class="fell-table"><tbody>';
        area.fells.forEach((f, fi)=>{
          const climbed = !!state[f.name];
          const visible = fellMatchesSearch(f);
          const isMountain = f.m >= MOUNTAIN_M;
          // Routed via Google rather than linking alltrails.com directly: the
          // AllTrails app claims its own domain but drops the search query,
          // stranding mobile users on its home screen.
          const at = "https://www.google.com/search?q="
                   + encodeURIComponent("alltrails " + f.name + " Lake District walk");
          const osm = "https://www.openstreetmap.org/?mlat=" + f.lat + "&mlon=" + f.lng
                    + "#map=15/" + f.lat + "/" + f.lng;
          const challengeBadge = (f.challenges && f.challenges.length)
            ? '<span class="chal-badge" data-challenges="' + f.challenges.join(",") + '" title="Part of a known challenge — tap for details">' + FLAG_ICON + '</span>'
            : '';
          html += '<tr class="fell-row' + (climbed ? ' is-climbed' : '') + (visible ? '' : ' is-hidden') + '" data-area="' + ai + '" data-fell="' + fi + '">';
          html += '  <td class="cell-check"><input type="checkbox" ' + (climbed ? 'checked' : '') + ' aria-label="Mark ' + escapeHtml(f.name) + ' as climbed"></td>';
          html += '  <td class="cell-name">'
               + (isMountain ? '<span class="mtn-badge" title="Mountain — 2,000ft / 610m or higher">' + MTN_ICON + '</span>' : '')
               + challengeBadge
               + escapeHtml(f.name)
               + '<span class="fell-links">'
               + '<a href="' + osm + '" target="_blank" rel="noopener noreferrer">Map</a>'
               + '<a href="' + at + '" target="_blank" rel="noopener noreferrer">Routes</a>'
               + '</span></td>';
          html += '  <td class="cell-height">' + f.m + 'm<span class="ft">' + f.ft + 'ft</span><span class="gr">' + escapeHtml(f.gr) + '</span></td>';
          html += '</tr>';
          if(f.desc){
            html += '<tr class="fell-desc-row' + (visible ? '' : ' is-hidden') + '"><td></td><td colspan="2" class="fell-desc">' + escapeHtml(f.desc) + '</td></tr>';
          }
        });
        html += '</tbody></table>';
      }
      html += '</div>';
      html += '</section>';
    });

    container.innerHTML = html;
  }

  // ---------- render: map ----------

  // Peaks sit at their true projected position; size scales with height so the
  // big fells read as landmarks. Drawn as engraving-style glyphs, not a real
  // topographic map — there's no coastline here, only summits.
  function renderMap(){
    const svg = document.getElementById("fell-map");
    if(!svg) return;

    const all = [];
    FELLS_DATA.forEach((a, ai)=> a.fells.forEach((f, fi)=> all.push({f, ai, fi})));
    const hs = all.map(p=>p.f.m);
    const hmin = Math.min.apply(null, hs), hmax = Math.max.apply(null, hs);

    let s = '<svg id="fell-map" viewBox="0 0 ' + MAP_W + ' ' + MAP_H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Map of the 214 Wainwright fells">';
    s += '<rect class="map-frame-outer" x="8" y="8" width="' + (MAP_W-16) + '" height="' + (MAP_H-16) + '" rx="2"/>';
    s += '<rect class="map-frame-inner" x="18" y="18" width="' + (MAP_W-36) + '" height="' + (MAP_H-36) + '" rx="1"/>';

    // region labels at the centroid of each region's summits
    FELLS_DATA.forEach(area=>{
      const xs = area.fells.map(f=>f.x), ys = area.fells.map(f=>f.y);
      const cx = xs.reduce((a,b)=>a+b,0)/xs.length;
      const cy = ys.reduce((a,b)=>a+b,0)/ys.length;
      s += '<text class="map-region-label" x="' + cx.toFixed(0) + '" y="' + (cy-52).toFixed(0) + '">'
         + escapeHtml(area.name.replace(/^The /,'')) + '</text>';
    });

    // peaks, drawn lowest first so taller ones overlap in front
    all.slice().sort((p,q)=> q.f.y - p.f.y).forEach(({f, ai, fi})=>{
      const t = (f.m - hmin) / (hmax - hmin);
      const w = 5 + t * 7;          // half-width
      const h = 7 + t * 11;         // height of the glyph
      const done = !!state[f.name];
      const x = f.x, y = f.y;
      s += '<g class="peak-mark' + (done ? ' done' : '') + '" data-area="' + ai + '" data-fell="' + fi + '">';
      s += '<title>' + escapeHtml(f.name) + ' — ' + f.m + 'm — ' + escapeHtml(f.gr) + (done ? ' (climbed)' : '') + '</title>';
      s += '<path class="body" d="M' + (x-w).toFixed(1) + ',' + y.toFixed(1)
         + ' L' + (x - w*0.25).toFixed(1) + ',' + (y-h*0.72).toFixed(1)
         + ' L' + x.toFixed(1) + ',' + (y-h).toFixed(1)
         + ' L' + (x + w*0.4).toFixed(1) + ',' + (y-h*0.55).toFixed(1)
         + ' L' + (x+w).toFixed(1) + ',' + y.toFixed(1) + ' Z"/>';
      s += '<path class="hatch" d="M' + (x-w*0.45).toFixed(1) + ',' + (y-h*0.12).toFixed(1)
         + ' L' + x.toFixed(1) + ',' + (y-h*0.78).toFixed(1) + '"/>';
      s += '<circle class="peak-hit" cx="' + x.toFixed(1) + '" cy="' + (y-h*0.4).toFixed(1)
         + '" r="' + Math.max(11, w+4).toFixed(1) + '" fill="transparent"/>';
      s += '</g>';
    });

    // compass rose, bottom-right
    const cx = MAP_W - 78, cy = MAP_H - 78;
    s += '<g><circle class="compass-ring" cx="' + cx + '" cy="' + cy + '" r="26"/>';
    s += '<path class="compass" d="M' + cx + ',' + (cy-22) + ' L' + (cx+7) + ',' + cy + ' L' + cx + ',' + (cy+22) + ' L' + (cx-7) + ',' + cy + ' Z"/>';
    s += '<text class="compass-n" x="' + cx + '" y="' + (cy-32) + '">N</text></g>';

    s += '<text class="map-title" x="' + (MAP_W/2) + '" y="' + (MAP_H-46) + '">The Lakeland Fells</text>';
    s += '<text class="map-sub" x="' + (MAP_W/2) + '" y="' + (MAP_H-28) + '">214 SUMMITS</text>';
    s += '</svg>';

    svg.outerHTML = s;
    const fresh = document.getElementById("fell-map");
    if(fresh){
      fresh.querySelectorAll(".peak-mark").forEach(g=>{
        g.addEventListener("click", ()=> jumpToPeak(parseInt(g.dataset.area,10), parseInt(g.dataset.fell,10)));
      });
    }
  }

  function renderAll(){
    renderHero();
    renderSkyline();
    renderMap();
    renderCharts();
    renderAreas();
    attachAreaEvents();
  }

  // ---------- interactions ----------

  function toggleFell(ai, fi, checked){
    const f = FELLS_DATA[ai].fells[fi];
    state[f.name] = checked;
    renderAll();
    upsertFell(f.name, checked);
  }

  function toggleArea(ai){
    if(expandedAreas.has(ai)) expandedAreas.delete(ai);
    else expandedAreas.add(ai);
    renderAreas();
    attachAreaEvents();
  }

  function jumpToArea(ai){
    expandedAreas.add(ai);
    document.getElementById("search").value = "";
    searchQuery = "";
    renderAreas();
    attachAreaEvents();
    const section = document.querySelector('.area[data-area-idx="' + ai + '"]');
    if(section){
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function jumpToPeak(ai, fi){
    expandedAreas.add(ai);
    document.getElementById("search").value = "";
    searchQuery = "";
    renderAreas();
    attachAreaEvents();
    const row = document.querySelector('.fell-row[data-area="' + ai + '"][data-fell="' + fi + '"]');
    if(row){
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.style.background = "var(--gold)";
      setTimeout(()=>{ row.style.transition = "background 0.8s ease"; row.style.background = ""; }, 60);
    }
  }

  function attachAreaEvents(){
    document.querySelectorAll(".area-header").forEach(btn=>{
      btn.onclick = ()=> toggleArea(parseInt(btn.dataset.toggle,10));
    });
    document.querySelectorAll(".fell-row input[type=checkbox]").forEach(cb=>{
      const row = cb.closest(".fell-row");
      cb.onchange = ()=> toggleFell(parseInt(row.dataset.area,10), parseInt(row.dataset.fell,10), cb.checked);
    });
    document.querySelectorAll(".chal-badge").forEach(badge=>{
      badge.onclick = (e)=>{
        e.stopPropagation();
        const keys = badge.dataset.challenges.split(",").filter(Boolean);
        const row = badge.closest(".fell-row");
        const f = FELLS_DATA[parseInt(row.dataset.area,10)].fells[parseInt(row.dataset.fell,10)];
        showChallengeModal(f.name, keys);
      };
    });
  }

  function showChallengeModal(fellName, keys){
    const modal = document.getElementById("challenge-modal");
    const title = document.getElementById("challenge-modal-title");
    const body = document.getElementById("challenge-modal-body");
    title.textContent = fellName + " is part of:";
    let html = "";
    keys.forEach(k=>{
      const c = CHALLENGES[k];
      if(!c) return;
      html += '<div class="chal-entry">';
      html += '  <h4>' + escapeHtml(c.label) + '</h4>';
      html += '  <p>' + escapeHtml(c.blurb) + '</p>';
      html += '  <a href="' + c.url + '" target="_blank" rel="noopener noreferrer">More about this challenge →</a>';
      html += '</div>';
    });
    body.innerHTML = html;
    modal.style.display = "flex";
  }

  function setupChallengeModal(){
    const modal = document.getElementById("challenge-modal");
    const closeBtn = document.getElementById("challenge-modal-close");
    closeBtn.onclick = ()=>{ modal.style.display = "none"; };
    modal.onclick = (e)=>{ if(e.target === modal) modal.style.display = "none"; };
  }

  function attachSkylineEvents(){
    document.querySelectorAll(".peak").forEach(p=>{
      p.onclick = ()=> jumpToPeak(parseInt(p.dataset.area,10), parseInt(p.dataset.fell,10));
    });
  }

  function attachSearchEvents(){
    const input = document.getElementById("search");
    input.oninput = ()=>{
      searchQuery = input.value.trim().toLowerCase();
      renderAreas();
      attachAreaEvents();
    };
  }

  function exportCsv(){
    let rows = [["No.","Region","Fell","Height (m)","Height (ft)","Climbed"]];
    FELLS_DATA.forEach((area, ai)=>{
      area.fells.forEach(f=>{
        rows.push([ROMAN[ai], area.name, f.name, f.m, f.ft, state[f.name] ? "Yes" : "No"]);
      });
    });
    const csv = rows.map(r => r.map(cell=>{
      const v = String(cell);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
    }).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wainwrights-progress.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- profile / first-sign-in name prompt ----------

  async function loadProfile(userId){
    if(!WW.sb) return null;
    try{
      const { data, error } = await WW.sb
        .from("profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();
      if(error) throw error;
      return data;
    }catch(e){
      console.error("Profile lookup failed", e);
      return null;
    }
  }

  function setupNamePrompt(user, profile){
    const modal = document.getElementById("name-prompt");
    const form = document.getElementById("name-prompt-form");
    const input = document.getElementById("name-prompt-input");
    const skipBtn = document.getElementById("name-prompt-skip");

    if(!WW.sb || profile){ return; } // already have a saved name — nothing to ask

    modal.style.display = "flex";

    form.onsubmit = async (e)=>{
      e.preventDefault();
      const name = input.value.trim();
      if(!name) return;
      try{
        await WW.sb.from("profiles").upsert({ user_id: user.id, display_name: name }, { onConflict: "user_id" });
      }catch(err){
        console.error("Saving display name failed", err);
      }
      modal.style.display = "none";
    };

    skipBtn.onclick = ()=>{ modal.style.display = "none"; };
  }

  // ---------- init ----------

  WW.onAuthReady(async function(user){
    state = await loadState(user.id);
    renderAll();
    attachAreaEvents();
    attachSkylineEvents();
    attachSearchEvents();
    setupChallengeModal();
    document.getElementById("export-btn").onclick = exportCsv;
    subscribeRealtime(user.id);

    const profile = await loadProfile(user.id);
    setupNamePrompt(user, profile);

    // re-attach skyline click handlers after any re-render triggered internally
    const observer = new MutationObserver(()=> attachSkylineEvents());
    observer.observe(document.getElementById("skyline"), { childList: true });
  });
})();
