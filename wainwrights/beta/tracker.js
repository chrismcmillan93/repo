(function(){
  "use strict";

  const DASHBOARD_ID = "wainwrights";
  const TABLE = "checkbox_states";

  const TOTAL = FELLS_DATA.reduce((n,a)=>n+a.fells.length,0);
  const ROMAN = ["I","II","III","IV","V","VI","VII"];
  const MOUNTAIN_M = 610; // 2,000ft — conventional England hill/mountain line
  const MTN_ICON = '<svg viewBox="0 0 14 11" aria-hidden="true"><path d="M1 10 L4 4 L6 6.5 L9 2 L11 5 L13 10 Z"></path></svg>';
  const FLAG_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1 L3 13" stroke="currentColor" stroke-width="1.3" fill="none"></path><path d="M3 2 L11 4.3 L3 6.6 Z"></path></svg>';
  const ROUTE_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4.5 9.5 Q7 7 9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.3"></path><circle cx="3" cy="11" r="1.8"></circle><circle cx="11" cy="3" r="1.8"></circle></svg>';

  // Real, well-documented classic route/horseshoe groupings — deliberately
  // conservative. Only fells genuinely, commonly combined in one walk are
  // tagged; being geographically close isn't enough on its own.
  const ROUTES = {
    coniston_horseshoe: {
      label: "Coniston Fells Horseshoe",
      blurb: "A popular circuit from Coniston taking in the Old Man and its neighbouring summits above Levers Water and Goat's Water, often extended to Wetherlam or Grey Friar.",
      url: "https://www.mudandroutes.com/routes/the-coniston-round/"
    },
    bowfell_crinkles: {
      label: "Bowfell & Crinkle Crags Round",
      blurb: "A classic Langdale horseshoe linking Bowfell, Esk Pike and Crinkle Crags via The Band and the Climbers' Traverse, usually completed from Great Langdale.",
      url: "https://www.walkupscafellpike.co.uk/lake-district-walk/classic-lake-district-walks-bowfell-and-crinkle-crags-from-great-langdale/"
    },
    scafell_traverse: {
      label: "Scafell Massif Traverse",
      blurb: "A serious high-level round of England's two highest summits and their neighbours, usually approached from Wasdale or via the Corridor Route from Borrowdale.",
      url: "https://where2walk.co.uk/walk/scafell-from-wasdale-head/"
    },
    wasdale_screes: {
      label: "The Wasdale Screes",
      blurb: "Illgill Head and Whin Rigg together form the ridge above the famous Screes on Wastwater's southern shore, usually walked as one there-and-back or circular route.",
      url: "https://www.walklakes.co.uk/walk_62.html"
    },
    glaramara_ridge: {
      label: "The Glaramara Ridge",
      blurb: "A ridge walk above Borrowdale linking Glaramara with its neighbouring tops, popular as a there-and-back or extended towards Esk Hause.",
      url: "https://www.walklakes.co.uk/walk_165.html"
    },

    // Eastern Fells
    fairfield_horseshoe: {
      label: "The Fairfield Horseshoe",
      blurb: "A classic ridge circuit from Ambleside — out along Low Pike and High Pike to Fairfield, then back via Great Rigg, Heron Pike and Nab Scar above Rydal.",
      url: "https://www.walklakes.co.uk/walk_42.html"
    },
    helvellyn_striding_edge: {
      label: "Helvellyn via Striding Edge",
      blurb: "England's most famous ridge scramble, climbing to Helvellyn's summit with Red Tarn below, usually completed with a descent over Catstycam via Swirral Edge.",
      url: "https://www.walkinginthewild.co.uk/walks/helvellyn-via-striding-edge-1"
    },
    dodds_traverse: {
      label: "The Helvellyn Range",
      blurb: "A long end-to-end ridge traverse from Clough Head in the north over the Dodds and Raise to Helvellyn and on to Dollywaggon Pike, rarely dropping below 620m.",
      url: "https://www.thegreatoutdoorsmag.com/spot/helvellyn-range-traverse-route-guide/"
    },

    // Far Eastern Fells
    kentmere_horseshoe: {
      label: "The Kentmere Horseshoe",
      blurb: "A long circuit around the head of the Kentmere valley, taking in Yoke, Ill Bell, Froswick and Thornthwaite Crag before returning via Mardale Ill Bell, Harter Fell, Kentmere Pike and Shipman Knotts.",
      url: "https://www.walklakes.co.uk/walk_14.html"
    },

    // Central Fells
    langdale_pikes: {
      label: "The Langdale Pikes",
      blurb: "The unmistakable skyline above Great Langdale — a rocky circuit of Harrison Stickle, Pike O'Stickle, Loft Crag, Pavey Ark and Thunacar Knott above Stickle Tarn.",
      url: "https://www.walklakes.co.uk/walk_63.html"
    },

    // Northern Fells
    skiddaw_horseshoe: {
      label: "The Skiddaw Horseshoe",
      blurb: "The scenic way up England's fourth-highest mountain, via the ridge of Ullock Pike and Long Side and back down over Bakestall, avoiding the direct tourist path.",
      url: "https://www.bigwalks.com/skiddaw-horseshoe.html"
    },
    mungrisdale_round: {
      label: "The Mungrisdale Round",
      blurb: "A quieter circuit from Mungrisdale over Souther Fell and Blencathra's northern side to Bannerdale Crags and Bowscale Fell.",
      url: "https://www.paulbeal.com/bannerdale-crags/"
    },

    // North Western Fells
    coledale_round: {
      label: "The Coledale Round",
      blurb: "A horseshoe of high summits around the Coledale valley above Braithwaite — Grisedale Pike, Hopegill Head, Eel Crag and Sail, with Wainwright's favourite ridge walk on to Scar Crags and Causey Pike.",
      url: "https://where2walk.co.uk/walk/coledale-round/"
    },
    newlands_round: {
      label: "The Newlands Round",
      blurb: "A classic circuit above the Newlands valley — Catbells, Maiden Moor and High Spy, then over Dale Head, Hindscarth and Robinson.",
      url: "https://where2walk.co.uk/walk/newlands-round/"
    },

    // Western Fells
    buttermere_horseshoe: {
      label: "The Buttermere Horseshoe",
      blurb: "The ridge dividing Buttermere and Ennerdale — Red Pike, High Stile and High Crag, commonly extended to Wainwright's favourite fell, Haystacks.",
      url: "https://fabulousnorth.com/walks/red-pike-high-stile-high-crag-and-haystacks/"
    },
    mosedale_horseshoe: {
      label: "The Mosedale Horseshoe",
      blurb: "A remote, rugged circuit of the Mosedale valley from Wasdale Head, taking in Pillar, Scoat Fell, Steeple, Red Pike, Yewbarrow and Kirk Fell.",
      url: "https://www.walkwainwrights.co.uk/2021/12/maximum-mosedale.html"
    },
    great_gable_group: {
      label: "The Great Gable Group",
      blurb: "The fells at the head of Ennerdale and Borrowdale surrounding Great Gable — usually combined with Green Gable, and often Brandreth and Grey Knotts from Honister.",
      url: "https://www.walkingbritain.co.uk/walk-1112-description"
    }
  };

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
          const routeBadge = (f.routes && f.routes.length)
            ? '<span class="route-badge" data-fell="' + escapeHtml(f.name) + '" title="Often climbed with other fells — tap for details">' + ROUTE_ICON + '</span>'
            : '';
          html += '<tr class="fell-row' + (climbed ? ' is-climbed' : '') + (visible ? '' : ' is-hidden') + '" data-area="' + ai + '" data-fell="' + fi + '">';
          html += '  <td class="cell-check"><input type="checkbox" ' + (climbed ? 'checked' : '') + ' aria-label="Mark ' + escapeHtml(f.name) + ' as climbed"></td>';
          html += '  <td class="cell-name">'
               + (isMountain ? '<span class="mtn-badge" title="Mountain — 2,000ft / 610m or higher">' + MTN_ICON + '</span>' : '')
               + challengeBadge
               + routeBadge
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
    document.querySelectorAll(".route-badge").forEach(badge=>{
      badge.onclick = (e)=>{
        e.stopPropagation();
        showRouteModal(badge.dataset.fell);
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

  // ---------- "often climbed with" route modal ----------

  function getFellByName(name){
    for(let ai=0; ai<FELLS_DATA.length; ai++){
      const fells = FELLS_DATA[ai].fells;
      for(let fi=0; fi<fells.length; fi++){
        if(fells[fi].name === name) return fells[fi];
      }
    }
    return null;
  }

  function showRouteModal(fellName){
    const modal = document.getElementById("route-modal");
    const title = document.getElementById("route-modal-title");
    const body = document.getElementById("route-modal-body");
    const fell = getFellByName(fellName);
    if(!fell || !fell.routes || !fell.routes.length) return;

    title.textContent = fellName;

    let html = "";
    fell.routes.forEach(key=>{
      const route = ROUTES[key];
      if(!route) return;
      const companions = FELLS_DATA
        .flatMap(area=> area.fells)
        .filter(f=> f.routes && f.routes.indexOf(key) !== -1);

      const routeAt = "https://www.google.com/search?q="
                     + encodeURIComponent("alltrails " + route.label + " Lake District walk");

      html += '<div class="route-modal-section">';
      html += '  <p class="route-modal-label">' + escapeHtml(route.label) + '</p>';
      html += '  <p>' + escapeHtml(route.blurb) + '</p>';
      html += '  <div class="route-modal-links">';
      if(route.url){
        html += '    <a href="' + route.url + '" target="_blank" rel="noopener noreferrer">Route guide →</a>';
      }
      html += '    <a href="' + routeAt + '" target="_blank" rel="noopener noreferrer">AllTrails →</a>';
      html += '  </div>';
      html += '  <p class="route-modal-label" style="margin-top:12px;">Often climbed with</p>';
      html += '  <div class="route-fell-list">';
      companions.forEach(c=>{
        if(c.name === fellName){
          html += '<span class="route-chip is-current" title="This fell">' + escapeHtml(c.name) + '</span>';
        } else {
          const climbed = !!state[c.name];
          html += '<span class="route-chip' + (climbed ? ' is-climbed' : '') + '" data-fell="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</span>';
        }
      });
      html += '  </div>';
      html += '</div>';
    });
    body.innerHTML = html;

    body.querySelectorAll(".route-chip[data-fell]").forEach(chip=>{
      chip.onclick = ()=> showRouteModal(chip.dataset.fell);
    });

    modal.style.display = "flex";
  }

  function setupRouteModal(){
    const modal = document.getElementById("route-modal");
    const closeBtn = document.getElementById("route-modal-close");
    closeBtn.onclick = ()=>{ modal.style.display = "none"; };
    modal.onclick = (e)=>{ if(e.target === modal) modal.style.display = "none"; };
  }

  function attachSkylineEvents(){
    document.querySelectorAll(".peak").forEach(p=>{
      p.onclick = ()=> jumpToPeak(parseInt(p.dataset.area,10), parseInt(p.dataset.fell,10));
    });
  }

  // ---------- touch-scrub preview (skyline + map) ----------
  //
  // On touch devices, dragging a thumb across the skyline or map shows a
  // floating label with the fell's name and climbed status above whatever
  // peak is currently under the finger — the jump only happens on release,
  // over whichever peak the finger ends on. We take full manual control of
  // this gesture (rather than relying on the native synthetic click after
  // touchend, whose target is pinned to wherever the touch *started*, not
  // where it ends) so drag-to-release lands on the right fell.

  function positionTouchLabel(label, containerEl, targetEl, f){
    const climbed = !!state[f.name];
    label.querySelector(".touch-label-name").textContent = f.name;
    const statusEl = label.querySelector(".touch-label-status");
    statusEl.textContent = climbed ? "Climbed" : "Not yet";
    statusEl.classList.toggle("is-climbed", climbed);

    const tRect = targetEl.getBoundingClientRect();
    const cRect = containerEl.getBoundingClientRect();
    let x = tRect.left + tRect.width / 2 - cRect.left;
    const y = tRect.top - cRect.top;
    const margin = 56; // keep the label from overflowing the container's edges
    x = Math.max(margin, Math.min(cRect.width - margin, x));
    label.style.left = x + "px";
    label.style.top = Math.max(0, y) + "px";
    label.style.display = "flex";
  }

  function hideTouchLabel(label){
    label.style.display = "none";
  }

  function setupChartTouchPreview(containerEl, peakSelector, label){
    if(!containerEl || !label) return;

    function peakInfoFromPoint(x, y){
      const el = document.elementFromPoint(x, y);
      const target = el && el.closest ? el.closest(peakSelector) : null;
      if(!target || !containerEl.contains(target)) return null;
      const ai = parseInt(target.dataset.area, 10), fi = parseInt(target.dataset.fell, 10);
      const f = FELLS_DATA[ai] && FELLS_DATA[ai].fells[fi];
      if(!f) return null;
      return { target, ai, fi, f };
    }

    containerEl.addEventListener("touchstart", (e)=>{
      const t = e.touches[0];
      const info = peakInfoFromPoint(t.clientX, t.clientY);
      if(info) positionTouchLabel(label, containerEl, info.target, info.f);
      else hideTouchLabel(label);
    }, { passive: true });

    containerEl.addEventListener("touchmove", (e)=>{
      const t = e.touches[0];
      const info = peakInfoFromPoint(t.clientX, t.clientY);
      if(info){
        positionTouchLabel(label, containerEl, info.target, info.f);
        e.preventDefault(); // lock the scrub in place, stop the page scrolling underneath
      } else {
        hideTouchLabel(label);
      }
    }, { passive: false });

    containerEl.addEventListener("touchend", (e)=>{
      const t = e.changedTouches[0];
      const info = peakInfoFromPoint(t.clientX, t.clientY);
      hideTouchLabel(label);
      if(info){
        e.preventDefault(); // suppress the native synthetic click so we don't double-jump
        jumpToPeak(info.ai, info.fi);
      }
    }, { passive: false });

    containerEl.addEventListener("touchcancel", ()=> hideTouchLabel(label));
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

  // ---------- share card ----------
  //
  // Renders a portrait (1080x1920) image matching the app's own look -- same
  // grid-paper background, same map, same region rings -- for sharing to
  // Instagram Stories via the Web Share API. Runs entirely client-side.
  //
  // The map is the page's real <svg id="fell-map">, cloned and rasterised via
  // a blob-image data URL. That isolated image-decode context has no access
  // to shared.css or the page's CSS custom properties, so the clone needs a
  // fully self-contained <style> block with colours resolved to literal hex
  // values and generic font fallbacks (Georgia/monospace) rather than the
  // webfonts -- those aren't reliably available in that context either.
  // Canvas text elsewhere on the card (wordmark, stats, ring labels) draws in
  // the normal document font context, so the real Fraunces/JetBrains Mono
  // webfonts apply there without issue.

  const SHARE_CARD_W = 1080, SHARE_CARD_H = 1920, SHARE_MARGIN = 56;
  const SHARE_COLORS = {
    paper: "#e8e2d0", paperCard: "#f1ecdd", paperDeep: "#ddd4bb",
    ink: "#262a1f", inkSoft: "#5b5f4d", inkFaint: "#8b8d78",
    green: "#3c5a41", greenDeep: "#24392a"
  };

  function drawSpacedText(ctx, text, cx, y, spacing){
    // canvas has no letter-spacing; measure and hand-space short caps/mono labels
    const widths = Array.from(text).map(ch=> ctx.measureText(ch).width);
    const totalW = widths.reduce((a,b)=>a+b, 0) + spacing * (text.length - 1);
    let x = cx - totalW / 2;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = "left";
    Array.from(text).forEach((ch, i)=>{
      ctx.fillText(ch, x, y);
      x += widths[i] + spacing;
    });
    ctx.textAlign = prevAlign;
  }

  function drawShareGridBackground(ctx){
    ctx.fillStyle = SHARE_COLORS.paper;
    ctx.fillRect(0, 0, SHARE_CARD_W, SHARE_CARD_H);
    ctx.strokeStyle = "#c9c5b4";
    ctx.lineWidth = 1;
    const step = 34;
    for(let x = -1; x < SHARE_CARD_W; x += step){
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, SHARE_CARD_H); ctx.stroke();
    }
    for(let yy = -1; yy < SHARE_CARD_H; yy += step){
      ctx.beginPath(); ctx.moveTo(0, yy + 0.5); ctx.lineTo(SHARE_CARD_W, yy + 0.5); ctx.stroke();
    }
  }

  function svgToImage(svgEl, selfContainedStyle){
    const clone = svgEl.cloneNode(true);
    clone.setAttribute("width", MAP_W);
    clone.setAttribute("height", MAP_H);
    const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.textContent = selfContainedStyle;
    clone.insertBefore(styleEl, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    return new Promise((resolve, reject)=>{
      const img = new Image();
      img.onload = ()=> resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function drawShareMap(ctx, y){
    const c = SHARE_COLORS;
    const mapStyle = `
      .map-frame-outer{ fill:none; stroke:${c.ink}; stroke-width:2.5; }
      .map-frame-inner{ fill:none; stroke:${c.ink}; stroke-width:0.8; }
      .map-region-label{ font-family:Georgia,serif; font-size:17px; font-style:italic; fill:${c.inkFaint}; text-anchor:middle; letter-spacing:0.04em; }
      .map-title{ font-family:Georgia,serif; font-size:26px; font-weight:600; fill:${c.greenDeep}; text-anchor:middle; letter-spacing:0.06em; }
      .map-sub{ font-family:monospace; font-size:11px; fill:${c.inkFaint}; text-anchor:middle; letter-spacing:0.16em; }
      .peak-mark .body{ fill:none; stroke:${c.inkFaint}; stroke-width:1.1; stroke-linejoin:round; }
      .peak-mark .hatch{ stroke:${c.greenDeep}; stroke-width:0.9; opacity:0; }
      .peak-mark.done .body{ fill:${c.green}; stroke:${c.greenDeep}; stroke-width:1.2; }
      .peak-mark.done .hatch{ opacity:0.45; stroke:${c.paperCard}; }
      .compass{ fill:${c.inkFaint}; }
      .compass-ring{ fill:none; stroke:${c.inkFaint}; stroke-width:0.9; }
      .compass-n{ font-family:Georgia,serif; font-size:13px; fill:${c.ink}; text-anchor:middle; }
    `;
    const mapSvg = document.getElementById("fell-map");
    const img = await svgToImage(mapSvg, mapStyle);
    const w = SHARE_CARD_W - SHARE_MARGIN * 2;
    const h = w * (MAP_H / MAP_W);
    ctx.fillStyle = c.paperCard;
    ctx.fillRect(SHARE_MARGIN - 8, y - 8, w + 16, h + 16);
    ctx.drawImage(img, SHARE_MARGIN, y, w, h);
    return h;
  }

  function drawShareRings(ctx, y){
    const c = SHARE_COLORS;
    const n = FELLS_DATA.length;
    const ringD = 132;
    const gap = (SHARE_CARD_W - SHARE_MARGIN * 2 - ringD * n) / (n - 1);
    const r = ringD / 2 - 8;
    FELLS_DATA.forEach((area, i)=>{
      const cx = SHARE_MARGIN + ringD / 2 + i * (ringD + gap);
      const cy = y + ringD / 2;
      const counts = computeAreaCounts(area);

      ctx.lineWidth = 8;
      ctx.strokeStyle = c.paperDeep;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      if(counts.percent > 0){
        ctx.strokeStyle = c.green;
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (counts.percent / 100) * Math.PI * 2);
        ctx.stroke();
      }

      ctx.textAlign = "center";
      ctx.fillStyle = c.greenDeep;
      ctx.font = "700 30px 'Fraunces', Georgia, serif";
      ctx.fillText(counts.percent + "%", cx, cy - 2);
      ctx.font = "400 15px 'JetBrains Mono', monospace";
      ctx.fillStyle = c.inkFaint;
      ctx.fillText(counts.climbed + " / " + counts.total, cx, cy + 24);
      ctx.font = "600 16px Georgia, serif";
      ctx.fillStyle = c.ink;
      const label = area.name.replace(/^The /, "").replace(/ Fells$/, "");
      const words = label.split(" ");
      if(words.length > 1){
        ctx.fillText(words.slice(0, -1).join(" "), cx, cy + ringD / 2 + 26);
        ctx.fillText(words[words.length - 1], cx, cy + ringD / 2 + 46);
      } else {
        ctx.fillText(label, cx, cy + ringD / 2 + 26);
      }
    });
    return ringD + 50;
  }

  async function buildShareCard(){
    if(document.fonts && document.fonts.load){
      try{
        await Promise.all([
          document.fonts.load("700 26px 'JetBrains Mono'"),
          document.fonts.load("400 22px 'JetBrains Mono'"),
          document.fonts.load("700 72px 'Fraunces'"),
          document.fonts.load("700 30px 'Fraunces'")
        ]);
      }catch(e){ /* proceed with system fallbacks if webfonts aren't ready */ }
    }

    const canvas = document.createElement("canvas");
    canvas.width = SHARE_CARD_W;
    canvas.height = SHARE_CARD_H;
    const ctx = canvas.getContext("2d");
    drawShareGridBackground(ctx);

    let y = 90;
    ctx.fillStyle = SHARE_COLORS.inkSoft;
    ctx.font = "700 26px 'JetBrains Mono', monospace";
    ctx.textBaseline = "alphabetic";
    drawSpacedText(ctx, "THE WAINWRIGHTS", SHARE_CARD_W / 2, y, 3);
    y += 90;

    const { climbed, percent, elevation } = computeCounts();
    const vals = [climbed + " / " + TOTAL, percent + "%", elevation.toLocaleString() + "m"];
    const labels = ["FELLS CLIMBED", "COMPLETE", "ELEVATION"];
    const colW = (SHARE_CARD_W - SHARE_MARGIN * 2) / 3;
    ctx.textAlign = "center";
    for(let i = 0; i < 3; i++){
      const cx = SHARE_MARGIN + colW * i + colW / 2;
      ctx.font = "700 72px 'Fraunces', Georgia, serif";
      ctx.fillStyle = SHARE_COLORS.greenDeep;
      ctx.fillText(vals[i], cx, y + 70);
      ctx.font = "400 22px 'JetBrains Mono', monospace";
      ctx.fillStyle = SHARE_COLORS.inkSoft;
      drawSpacedText(ctx, labels[i], cx, y + 105, 1.5);
    }
    y += 165;

    const mapH = await drawShareMap(ctx, y);
    y += mapH + 56;
    drawShareRings(ctx, y);

    return new Promise(resolve=> canvas.toBlob(resolve, "image/jpeg", 0.92));
  }

  async function shareProgressCard(){
    const btn = document.getElementById("share-btn");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing…";

    let blob;
    try{
      blob = await buildShareCard();
    }catch(err){
      console.error("Building share card failed", err);
      btn.textContent = "Couldn't build image";
      setTimeout(()=>{ btn.textContent = originalText; btn.disabled = false; }, 2000);
      return;
    }

    const file = new File([blob], "wainwrights-progress.jpg", { type: "image/jpeg" });

    if(navigator.canShare && navigator.canShare({ files: [file] })){
      try{
        await navigator.share({ files: [file], title: "My Wainwrights progress" });
      }catch(err){
        if(!err || err.name !== "AbortError") console.error("Share failed", err);
      }
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }

    // fallback for browsers without file-sharing support (mainly desktop):
    // just download the image so it can be shared manually
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wainwrights-progress.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    btn.textContent = "Saved — share it from your photos";
    setTimeout(()=>{ btn.textContent = originalText; btn.disabled = false; }, 2500);
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
    setupRouteModal();
    setupChartTouchPreview(document.getElementById("skyline"), ".peak", document.getElementById("skyline-touch-label"));
    setupChartTouchPreview(document.querySelector(".map-card"), ".peak-mark", document.getElementById("map-touch-label"));
    document.getElementById("export-btn").onclick = exportCsv;
    document.getElementById("share-btn").onclick = shareProgressCard;
    subscribeRealtime(user.id);

    const profile = await loadProfile(user.id);
    setupNamePrompt(user, profile);

    // re-attach skyline click handlers after any re-render triggered internally
    const observer = new MutationObserver(()=> attachSkylineEvents());
    observer.observe(document.getElementById("skyline"), { childList: true });
  });
})();
