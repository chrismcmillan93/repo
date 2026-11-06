(function(root){
  "use strict";

  // Difficulty ratings for walks and single peaks. Two separate 1-5 scores:
  //
  //   Effort     how tiring: Naismith time (3 mph + 1 h per 600 m of ascent).
  //              For a walk that is the walk's own miles and ascent. For a single
  //              peak it is the simplest sensible walk: out and back from the
  //              nearest valley car park (planner-walks.js PLANNER_BASES), path
  //              length = straight line x 1.5. A peak climbed in a long round will
  //              feel easier per summit than its number suggests.
  //   Technical  the ground and the exposure: 1 easy paths ... 5 exposed
  //              scrambling. For a peak it rates the EASIEST normal way up, and
  //              if there is a famous harder way ("Striding Edge") that is shown
  //              beside it (T2-4). For a walk it is the hardest section of the
  //              standard route (WALK_TECH for the named rounds, otherwise the
  //              hardest of its summits).
  //
  // This is a formula plus hand-tagged exceptions, NOT measured terrain data:
  // the technical grades below are estimates from general knowledge of the
  // routes. To correct one, edit TECH / EDGE / WALK_TECH in this file. When OS
  // Terrain 50 slope statistics are worked out per summit, they can replace the
  // height-based default in techFor() without touching any page.
  //
  // Pure data and functions: no DOM at load, so it can be tested in Node.

  const EFFORT_BANDS = [   // upper bound (hours, exclusive) -> grade
    [2, 1], [3.5, 2], [5, 3], [6.5, 4], [Infinity, 5]
  ];
  const EFFORT_LABEL = ["", "Gentle", "Moderate", "Strenuous", "Hard", "Very hard"];
  const EFFORT_HELP = ["",
    "Under 2 hours of walking",
    "2 to 3.5 hours",
    "3.5 to 5 hours",
    "5 to 6.5 hours",
    "More than 6.5 hours: a long, full day"];
  const TECH_LABEL = ["", "Easy paths", "Steep or stony paths", "Rough, loose or pathless ground", "Grade 1 scrambling", "Exposed scrambling"];
  const TECH_HELP = ["",
    "Clear, well-made paths and grass. Hands stay in pockets.",
    "Steeper, stonier paths and some boggy or rocky ground. Little or no route-finding in clear weather.",
    "Boulder fields, loose scree, steep rock steps or pathless ground. Hands used now and then; navigation matters.",
    "Hands-on scrambling over rock (Grade 1), with some drop either side.",
    "Exposed scrambling where a slip could be fatal. Not for anyone nervous of heights."];

  // Technical grade for the EASIEST normal route up, where it differs from the
  // height default (700 m and over = 2, below = 1).
  const TECH = {
    3: ["Scafell Pike", "Scafell", "Great End", "Great Gable", "Bowfell", "Crinkle Crags", "Dow Crag", "Pavey Ark",
        "Pike O'Stickle", "Blencathra", "Haystacks", "Fleetwith Pike", "Yewbarrow", "Kirk Fell", "Steeple"],
    2: ["Barf", "Rannerdale Knotts", "Catbells", "Mellbreak", "Castle Crag", "Causey Pike", "Great Calva", "Carrock Fell",
        "Lank Rigg", "Helm Crag", "Place Fell", "Hopegill Head", "Whiteless Pike"],
    1: ["Great Dodd", "Stybarrow Dodd", "Watson's Dodd", "Hart Side", "Clough Head", "Loft Crag", "Thunacar Knott",
        "Harrison Stickle", "High Raise (Langdale)", "Ullscarf", "Haycock", "Seatallan", "Caw Fell", "Kidsty Pike",
        "High Raise (Martindale)", "Rest Dodd", "Loadpot Hill", "Wether Hill", "Branstree", "Selside Pike", "Knott",
        "Great Calva", "Skiddaw"]
  };
  // Skiddaw and the Dodds are 700 m+ but are plain walking; Great Calva sits in the 2 list above (pathless) and is
  // removed from the 1 list at build time below, so each fell has exactly one answer.

  // A famous harder way up, shown as the upper end of the range (T2-4).
  const EDGE = {
    "Helvellyn":     { t: 4, label: "Striding Edge" },
    "Catstycam":     { t: 3, label: "Swirral Edge" },
    "Blencathra":    { t: 5, label: "Sharp Edge" },
    "Pavey Ark":     { t: 4, label: "Jack's Rake" },
    "Scafell":       { t: 4, label: "Lord's Rake / Foxes Tarn" },
    "Crinkle Crags": { t: 4, label: "The Bad Step" },
    "Bowfell":       { t: 4, label: "The Climbers' Traverse" },
    "Helm Crag":     { t: 3, label: "the Howitzer (summit rocks)" },
    "Wetherlam":     { t: 3, label: "Prison Band" }
  };

  // Standard circuits of the named rounds: the hardest section they actually cross.
  const WALK_TECH = {
    helvellyn_striding_edge: { t: 4, note: "Striding Edge: Grade 1 scramble, exposed" },
    scafell_traverse:        { t: 4, note: "Mickledore and the Foxes Tarn / Lord's Rake scrambling" },
    bowfell_crinkles:        { t: 4, note: "The Climbers' Traverse and the Bad Step" },
    langdale_pikes:          { t: 3, note: "Steep rocky ground; Jack's Rake is an optional Grade 1 scramble (4)" },
    mungrisdale_round:       { t: 3, note: "Blencathra by its easier routes; Sharp Edge (5) is optional" },
    coniston_horseshoe:      { t: 3, note: "Rocky ridges around Dow Crag and Swirl How" },
    great_gable_group:       { t: 3, note: "Boulder fields on Great Gable" },
    wasdale_screes:          { t: 2, note: "Path along the top of the screes" }
  };

  // ---------------------------------------------------------------- lookups

  const techByName = Object.create(null);
  [3, 2, 1].forEach(g => TECH[g].forEach(n => { if (!(n in techByName)) techByName[n] = g; }));   // first list wins: 3, then 2, then 1

  function fellIndex(){
    const byName = Object.create(null);
    if (typeof FELLS_DATA !== "undefined") FELLS_DATA.forEach(b => b.fells.forEach(f => { byName[f.name] = f; }));
    return byName;
  }
  let _byName = null;
  const byName = () => _byName || (_byName = fellIndex());

  const clamp15 = n => Math.max(1, Math.min(5, n));
  const naismith = (miles, ascent) => miles / 3 + ascent / 600;
  function effortGrade(hours){
    for (let i = 0; i < EFFORT_BANDS.length; i++) if (hours < EFFORT_BANDS[i][0]) return EFFORT_BANDS[i][1];
    return 5;
  }
  function effortFromHours(hours){
    if (!(hours > 0)) return null;
    const g = effortGrade(hours);
    return { grade: g, label: EFFORT_LABEL[g], hours, help: EFFORT_HELP[g] };
  }

  const D2R = Math.PI / 180;
  function haversineMiles(a, b){
    const R = 3958.8, dφ = (b.lat - a.lat) * D2R, dλ = (b.lng - a.lng) * D2R;
    const x = Math.sin(dφ / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dλ / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  // Height-based default; the overrides above replace it for specific fells.
  function techFor(fell){
    if (fell.name in techByName) return techByName[fell.name];
    return fell.m >= 700 ? 2 : 1;
  }

  // ---------------------------------------------------------------- per peak

  // Straight line to real path length. A bit above the planner's 1.3 because a single peak is mostly one
  // winding ascent, and out and back doubles the error.
  const PEAK_PATH_FACTOR = 1.5;
  const fellCache = Object.create(null);
  function standaloneWalk(fell){
    if (typeof PLANNER_BASES === "undefined" || fell.lat == null) return null;
    let base = null, best = Infinity;
    const forced = (typeof PLANNER_BASE_OVERRIDES !== "undefined") && PLANNER_BASE_OVERRIDES[fell.name];
    if (forced) base = PLANNER_BASES.find(b => b.key === forced) || null;
    if (!base) PLANNER_BASES.forEach(b => { const d = haversineMiles(b, fell); if (d < best) { best = d; base = b; } });
    if (!base) return null;
    const miles = Math.max(1, 2 * haversineMiles(base, fell) * PEAK_PATH_FACTOR);
    const ascent = Math.max(50, fell.m - (base.elev || 0));
    return { miles, ascent, base };
  }

  // { effort: {grade,label,hours,help,from} | null, tech: {grade,label,help,edge?} }
  function forFell(fell){
    if (!fell) return null;
    if (fellCache[fell.name]) return fellCache[fell.name];
    const w = standaloneWalk(fell);
    const effort = w ? Object.assign(effortFromHours(naismith(w.miles, w.ascent)), { from: w.base.name, miles: w.miles, ascent: w.ascent }) : null;
    const g = techFor(fell), edge = EDGE[fell.name] || null;
    const tech = { grade: g, label: TECH_LABEL[g], help: TECH_HELP[g] };
    if (edge && edge.t > g) tech.edge = { grade: edge.t, label: edge.label };
    return (fellCache[fell.name] = { effort, tech });
  }

  // ---------------------------------------------------------------- per walk

  // walk: { miles, ascent, fells: [fell objects or names], routeId?, label? }
  // miles/ascent may be missing (custom hikes): effort is then null.
  function forWalk(walk){
    const idx = byName();
    const fells = (walk.fells || []).map(f => typeof f === "string" ? idx[f] : f).filter(Boolean);
    const miles = Number(walk.miles), ascent = Number(walk.ascent);
    const effort = (miles > 0 && ascent >= 0 && isFinite(ascent)) ? effortFromHours(naismith(miles, ascent)) : null;
    let routeId = walk.routeId || null;
    if (!routeId && walk.label && typeof PLANNER_WALKS !== "undefined") {
      const hit = Object.keys(PLANNER_WALKS).find(k => PLANNER_WALKS[k].label === walk.label);
      if (hit) routeId = hit;
    }
    const ov = routeId && WALK_TECH[routeId];
    let g = fells.reduce((m, f) => Math.max(m, techFor(f)), 1), note = "";
    if (ov) { g = ov.t; note = ov.note; }
    else {
      const worst = fells.filter(f => techFor(f) === g).slice(0, 2).map(f => f.name);
      if (g >= 3 && worst.length) note = "Hardest ground: " + worst.join(", ");
    }
    return { effort, tech: { grade: clamp15(g), label: TECH_LABEL[clamp15(g)], help: TECH_HELP[clamp15(g)], note } };
  }

  // ---------------------------------------------------------------- display

  const RAMP = [   // [background, text], 1 = easiest. Dark text on all but the top step (checked for contrast).
    ["", ""],
    ["#e1eed5", "#26401c"], ["#f1e8b4", "#4f420c"], ["#f1c97f", "#4f3204"], ["#e09a5b", "#3a1c04"], ["#b24f2b", "#ffffff"]
  ];
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const hoursTxt = h => { const m = Math.round(h * 60); return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min"; };

  function techText(t){ return t.edge ? "Technical " + t.grade + " by the easiest way, " + t.edge.grade + " by " + t.edge.label : "Technical " + t.grade + " (" + t.label + ")"; }
  function pill(kind, grade, text){
    return '<span class="diff-pill ' + kind + grade + '" style="background:' + RAMP[grade][0] + ";color:" + RAMP[grade][1] + '">' + text + "</span>";
  }

  // Short chip for dense lists: "E3 T2" or "E3 T2-4".
  function compactHtml(d){
    if (!d) return "";
    const parts = [], label = [];
    if (d.effort) { parts.push(pill("e", d.effort.grade, "E" + d.effort.grade)); label.push("Effort " + d.effort.grade + " (" + d.effort.label + ")"); }
    const t = d.tech;
    parts.push(pill("t", t.grade, "T" + t.grade + (t.edge ? "&ndash;" + t.edge.grade : "")));
    label.push(techText(t));
    return '<span class="diff diff-compact" role="img" aria-label="' + esc(label.join(". ")) + '" title="' + esc(label.join(" · ")) + '">' + parts.join("") + "</span>";
  }

  // Labelled version for cards: two badges and a one-line explanation, plus a "?" that opens the key.
  function fullHtml(d, opts){
    if (!d) return "";
    opts = opts || {};
    const t = d.tech;
    const effort = d.effort
      ? '<span class="diff-badge">' + pill("e", d.effort.grade, "Effort " + d.effort.grade) + " <span class=\"diff-name\">" + esc(d.effort.label) + "</span></span>"
      : '<span class="diff-badge diff-none">Effort: not rated (no distance or climb given)</span>';
    const tech = '<span class="diff-badge">' + pill("t", t.grade, "Technical " + t.grade + (t.edge ? "&ndash;" + t.edge.grade : "")) + ' <span class="diff-name">' + esc(t.label) + "</span></span>";
    const notes = [];
    if (t.note) notes.push(t.note);
    if (t.edge) notes.push(t.edge.label + " is Technical " + t.edge.grade);
    if (opts.showFrom && d.effort && d.effort.from) notes.push("Effort assumes out and back from " + d.effort.from);
    return '<div class="diff diff-full">' + effort + tech +
      '<button type="button" class="diff-help" data-diff-legend aria-label="How are walks rated?">?</button>' +
      (notes.length ? '<p class="diff-note">' + esc(notes.join(" · ")) + "</p>" : "") + "</div>";
  }

  // ---------------------------------------------------------------- key / legend (browser only)

  let sheet = null;
  function closeLegend(){ if (sheet) { sheet.remove(); sheet = null; } document.removeEventListener("keydown", onKey); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  let lastFocus = null;
  function onKey(e){ if (e.key === "Escape") closeLegend(); }

  function showLegend(){
    if (typeof document === "undefined" || sheet) return;
    lastFocus = document.activeElement;
    const rows = (labels, helps, kind) => [1, 2, 3, 4, 5].map(g =>
      '<li>' + pill(kind, g, kind === "e" ? "E" + g : "T" + g) + " <strong>" + esc(labels[g]) + "</strong> &mdash; " + esc(helps[g]) + "</li>").join("");
    sheet = document.createElement("div");
    sheet.className = "terms-modal diff-modal";
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-labelledby", "diff-title");
    sheet.innerHTML = '<div class="terms-card"><h3 id="diff-title">How walks and peaks are rated</h3><div class="terms-body">' +
      "<p><strong>Effort</strong> is how tiring: Naismith time (3 mph plus an hour per 600 m climbed). For a single peak it assumes out and back from the nearest car park.</p>" +
      '<ul class="diff-key">' + rows(EFFORT_LABEL, EFFORT_HELP, "e") + "</ul>" +
      "<p><strong>Technical</strong> is the ground and the exposure. A peak shows its easiest normal way up, and a range like <em>T2&ndash;4</em> means a famous harder way exists (Striding Edge, Sharp Edge&hellip;). A walk shows the hardest section of its standard route.</p>" +
      '<ul class="diff-key">' + rows(TECH_LABEL, TECH_HELP, "t") + "</ul>" +
      "<p class=\"diff-fine\">These are estimates from distance, climb, height and notes on well-known routes, not measured terrain data, and conditions change everything: snow, ice, wind and cloud make any of these harder. Always check the forecast and your route.</p>" +
      '</div><button type="button" class="btn" id="diff-close">Close</button></div>';
    document.body.appendChild(sheet);
    sheet.querySelector("#diff-close").addEventListener("click", closeLegend);
    sheet.addEventListener("click", e => { if (e.target === sheet) closeLegend(); });
    document.addEventListener("keydown", onKey);
    sheet.querySelector("#diff-close").focus({ preventScroll: true });
    sheet.querySelector(".terms-card").scrollTop = 0;
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", e => {
      const b = e.target.closest && e.target.closest("[data-diff-legend]");
      if (b) { e.preventDefault(); showLegend(); }
    });
  }

  root.Difficulty = {
    forFell, forWalk, compactHtml, fullHtml, showLegend,
    effortGrade, naismith, hoursTxt, RAMP, EFFORT_LABEL, TECH_LABEL, EDGE, WALK_TECH, TECH
  };
})(typeof window !== "undefined" ? window : globalThis);
