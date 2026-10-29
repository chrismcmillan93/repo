(function(){
  "use strict";

  // Fell planner: ranks walks for a chosen day by fells you haven't climbed,
  // the forecast on the highest summit, the drive from your area, and
  // whether the whole day fits in the daylight.
  //
  // Data: FELLS_DATA (fells-data.js), PLANNER_WALKS (planner-walks.js), your
  // ticks from checkbox_states, your saved area from planner_user_location,
  // drive times from the drive-times Edge Function (cached per user),
  // forecasts from Open-Meteo (keyless, called from the browser).

  const DASHBOARD_ID = "wainwrights";
  const esc = WW.escapeHtml;
  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const PAIR_MAX_MILES = 12;   // two starts this close make a camping weekend
  const ROAD_FACTOR = 1.35;    // straight line -> rough road miles, for estimates
  const EST_MPH = 38;          // rough average for those estimates

  // ---------- state ----------
  let user = null;
  let climbed = {};            // fell name -> true
  let location = null;         // { lat, lng, precision, district }
  let drive = {};              // start key -> { miles, minutes, estimated }
  let forecast = null;         // { days: [YYYY-MM-DD], byWalk: { id: [dayWeather] } }
  let selectedDay = null;
  let pairMode = false;
  let showAll = false;
  let expanded = false;        // "Show all" pressed for the current day
  const INITIAL_SHOWN = 8;

  // ---------- fells & walks ----------
  const fellsByName = {};
  FELLS_DATA.forEach(b => b.fells.forEach(f => { fellsByName[f.name] = f; }));

  const topOf = fells => fells.reduce((a, f) => (!a || f.m > a.m ? f : a), null);
  const naismith = (miles, ascent) => miles / 3 + ascent / 600;

  // Named rounds from the tracker (planner-walks.js).
  const namedWalks = Object.entries(PLANNER_WALKS).map(([id, w]) => {
    const fells = Object.values(fellsByName).filter(f => (f.routes || []).includes(id));
    return Object.assign({ id, fells, top: topOf(fells), hours: naismith(w.miles, w.ascent) }, w);
  }).filter(w => w.fells.length && w.top);

  // Suggested walks for every fell no named round covers: each fell goes to
  // its nearest valley car park (PLANNER_BASES), then fells sharing a car
  // park are chained into walks of up to 5 summits, each hop under ~2 miles,
  // loop under ~13 miles. Distance = straight-line loop x 1.3 for paths;
  // ascent = car park to highest summit plus a rough allowance per extra
  // summit. Estimates, and labelled as such on the page.
  const PATH_FACTOR = 1.3, MAX_HOP_MILES = 2.0, MAX_LOOP_MILES = 13, MAX_FELLS = 5;
  const generatedWalks = (function(){
    const covered = new Set(namedWalks.flatMap(w => w.fells.map(f => f.name)));
    const byBase = new Map();
    Object.values(fellsByName).forEach(f => {
      if (covered.has(f.name) || f.lat == null) return;
      let best = null, bestD = Infinity;
      const forced = (typeof PLANNER_BASE_OVERRIDES !== "undefined") && PLANNER_BASE_OVERRIDES[f.name];
      if (forced) best = PLANNER_BASES.find(b => b.key === forced) || null;
      if (!best) PLANNER_BASES.forEach(b => { const d = haversineMiles(b, f); if (d < bestD) { bestD = d; best = b; } });
      if (!byBase.has(best.key)) byBase.set(best.key, { base: best, fells: [] });
      byBase.get(best.key).fells.push(f);
    });
    const loopMiles = (base, chain) => {
      let d = haversineMiles(base, chain[0]);
      for (let i = 1; i < chain.length; i++) d += haversineMiles(chain[i - 1], chain[i]);
      return (d + haversineMiles(chain[chain.length - 1], base)) * PATH_FACTOR;
    };
    const out = [];
    byBase.forEach(({ base, fells }) => {
      const left = fells.slice().sort((a, b) => haversineMiles(base, a) - haversineMiles(base, b));
      while (left.length) {
        const chain = [left.shift()];
        for (;;) {
          const last = chain[chain.length - 1];
          let pick = -1, pickD = Infinity;
          left.forEach((f, i) => { const d = haversineMiles(last, f); if (d < pickD) { pickD = d; pick = i; } });
          if (pick < 0 || pickD > MAX_HOP_MILES || chain.length >= MAX_FELLS) break;
          if (loopMiles(base, chain.concat(left[pick])) > MAX_LOOP_MILES) break;
          chain.push(left.splice(pick, 1)[0]);
        }
        const top = topOf(chain);
        const miles = Math.max(2, Math.round(loopMiles(base, chain) * 2) / 2);
        const extra = chain.filter(f => f !== top).reduce((s, f) => s + Math.max(60, 0.35 * (f.m - 300)), 0);
        const ascent = Math.round((Math.max(100, top.m - base.elev) + extra) / 10) * 10;
        const names = chain.map(f => f.name);
        const label = (names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " & " + names[names.length - 1]) + " from " + base.name.split(",")[0];
        out.push({
          id: "gen_" + base.key + "_" + out.length, generated: true, label, url: null,
          start: { key: base.key, name: base.name, lat: base.lat, lng: base.lng },
          miles, ascent, fells: chain, top, hours: naismith(miles, ascent)
        });
      }
    });
    return out;
  })();

  const walks = namedWalks.concat(generatedWalks);

  // ---------- helpers ----------
  function haversineMiles(a, b){
    const R = 3958.8, toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // Snap to a ~1 mile grid before anything is saved.
  const snap = (v, step) => Math.round(v / step) * step;
  function snapPoint(lat, lng){
    return { lat: Number(snap(lat, 0.015).toFixed(4)), lng: Number(snap(lng, 0.025).toFixed(4)) };
  }
  function fmtDuration(mins){
    if (mins == null) return "";
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
  }
  function fmtHours(h){
    const whole = Math.floor(h), m = Math.round((h - whole) * 60 / 5) * 5;
    return m === 60 ? `${whole + 1}h` : m ? `${whole}h ${m}m` : `${whole}h`;
  }
  function localISO(d){
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function dayLabel(iso){
    const d = new Date(iso + "T12:00:00");
    const today = localISO(new Date());
    if (iso === today) return "Today";
    return `${DAY_NAMES[d.getDay()]} ${d.getDate()}`;
  }
  function isWeekend(iso){ const d = new Date(iso + "T12:00:00").getDay(); return d === 0 || d === 6; }
  function timeOf(isoDateTime){ return isoDateTime ? isoDateTime.slice(11, 16) : ""; }

  // ---------- data loading ----------
  async function loadClimbed(){
    const { data, error } = await WW.sb.from("checkbox_states")
      .select("item_id,is_checked")
      .eq("dashboard_id", DASHBOARD_ID)
      .eq("user_id", user.id);
    if (error) throw error;
    climbed = {};
    (data || []).forEach(r => { if (r.is_checked) climbed[r.item_id] = true; });
  }

  async function loadLocation(){
    const { data, error } = await WW.sb.from("planner_user_location")
      .select("lat,lng,precision,district").eq("user_id", user.id).maybeSingle();
    if (error) { console.error(error); location = null; return; }
    location = data ? { lat: Number(data.lat), lng: Number(data.lng), precision: data.precision, district: data.district } : null;
  }

  function estimateDrives(){
    drive = {};
    if (!location) return;
    walks.forEach(w => {
      const miles = haversineMiles(location, w.start) * ROAD_FACTOR;
      drive[w.start.key] = { miles: Math.round(miles), minutes: Math.round(miles / EST_MPH * 60), estimated: true };
    });
  }

  async function loadDrives(){
    estimateDrives();
    if (!location) return;
    const starts = [];
    const seen = new Set();
    walks.forEach(w => { if (!seen.has(w.start.key)) { seen.add(w.start.key); starts.push({ key: w.start.key, lat: w.start.lat, lng: w.start.lng }); } });
    try {
      const { data, error } = await WW.sb.functions.invoke("drive-times", { body: { starts } });
      if (error) throw error;
      Object.entries((data && data.times) || {}).forEach(([k, t]) => {
        if (t && t.minutes != null) drive[k] = { miles: t.miles, minutes: t.minutes, estimated: false };
      });
    } catch (e) {
      // Not configured yet, rate-limited, or offline: keep the estimates.
      console.warn("drive-times unavailable, using estimates", e);
    }
  }

  async function loadForecast(){
    const lat = walks.map(w => w.top.lat.toFixed(4)).join(",");
    const lng = walks.map(w => w.top.lng.toFixed(4)).join(",");
    const elev = walks.map(w => w.top.m).join(",");
    const url = "https://api.open-meteo.com/v1/forecast"
      + `?latitude=${lat}&longitude=${lng}&elevation=${elev}`
      + "&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,cloud_cover_low"
      + "&daily=sunrise,sunset&forecast_days=7&timezone=Europe%2FLondon&wind_speed_unit=mph";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Forecast unavailable (HTTP ${res.status})`);
    let body = await res.json();
    if (!Array.isArray(body)) body = [body];
    const byWalk = {};
    let days = [];
    body.forEach((loc, i) => {
      const w = walks[i];
      days = loc.daily.time;
      byWalk[w.id] = loc.daily.time.map((day, di) => summariseDay(loc, day, loc.daily.sunrise[di], loc.daily.sunset[di]));
    });
    forecast = { days, byWalk };
  }

  // Walking hours 09:00-16:00 at the summit.
  function summariseDay(loc, day, sunrise, sunset){
    const h = loc.hourly;
    const idx = [];
    h.time.forEach((t, i) => { if (t.startsWith(day)) { const hr = Number(t.slice(11, 13)); if (hr >= 9 && hr <= 16) idx.push(i); } });
    const pick = (k) => idx.map(i => h[k][i]).filter(v => v != null);
    const max = a => a.length ? Math.max(...a) : null;
    const min = a => a.length ? Math.min(...a) : null;
    const sum = a => a.reduce((s, v) => s + v, 0);
    const avg = a => a.length ? sum(a) / a.length : null;
    const gust = max(pick("wind_gusts_10m"));
    const wind = avg(pick("wind_speed_10m"));
    const rain = sum(pick("precipitation"));
    const rainChance = max(pick("precipitation_probability"));
    const feels = min(pick("apparent_temperature"));
    const temp = avg(pick("temperature_2m"));
    const lowCloud = avg(pick("cloud_cover_low"));

    let score = 100;
    if (gust != null) score -= gust > 55 ? 100 : gust > 45 ? 50 : gust > 35 ? 25 : gust > 25 ? 10 : 0;
    score -= rain > 6 ? 40 : rain > 2 ? 25 : rain > 0.5 ? 10 : 0;
    if (lowCloud != null) score -= lowCloud > 80 ? 15 : lowCloud > 60 ? 8 : 0;
    if (feels != null) score -= feels < -8 ? 20 : feels < -3 ? 10 : 0;
    score = Math.max(0, score);
    const verdict = gust != null && gust > 55 ? "Not advised" : score >= 75 ? "Good" : score >= 50 ? "Fair" : score >= 25 ? "Poor" : "Not advised";

    const daylightHours = sunrise && sunset ? (new Date(sunset) - new Date(sunrise)) / 3.6e6 : null;
    return { day, gust, wind, rain, rainChance, feels, temp, lowCloud, score, verdict, sunrise, sunset, daylightHours };
  }

  // ---------- ranking ----------
  function rankFor(day){
    const di = forecast ? forecast.days.indexOf(day) : -1;
    const rows = walks.map(w => {
      const newFells = w.fells.filter(f => !climbed[f.name]);
      const wx = di >= 0 ? forecast.byWalk[w.id][di] : null;
      const d = drive[w.start.key] || null;
      const driveMins = d ? d.minutes : null;
      // Walk must fit between sunrise and sunset; the drives can be in the dark.
      const spare = wx && wx.daylightHours != null ? wx.daylightHours - w.hours - 0.5 : null;
      const tight = spare != null && spare < 0;
      let score = newFells.length * 12;
      if (wx) score += wx.score * 0.6;
      if (driveMins != null) score -= driveMins * 0.15;
      if (tight) score -= 25;
      if (w.linear) score -= 5;
      return { w, newFells, wx, d, spare, tight, score };
    });
    const filtered = showAll ? rows : rows.filter(r => r.newFells.length);
    return (filtered.length ? filtered : rows).sort((a, b) => b.score - a.score);
  }

  // Best Saturday + Sunday pair whose starts are close together.
  function bestPair(){
    if (!forecast) return null;
    const sat = forecast.days.find(d => new Date(d + "T12:00:00").getDay() === 6);
    if (!sat) return null;
    const sunIdx = forecast.days.indexOf(sat) + 1;
    const sun = forecast.days[sunIdx];
    if (!sun) return null;
    const a = rankFor(sat), b = rankFor(sun);
    let best = null;
    a.slice(0, 8).forEach(x => b.slice(0, 8).forEach(y => {
      if (x.w.id === y.w.id) return;
      const gap = haversineMiles(x.w.start, y.w.start);
      if (gap > PAIR_MAX_MILES) return;
      const overlap = x.newFells.filter(f => y.newFells.includes(f)).length;
      const total = x.score + y.score - overlap * 12 + (12 - gap);
      if (!best || total > best.total) best = { sat, sun, x, y, gap, total };
    }));
    return best;
  }

  // ---------- rendering ----------
  function renderLocation(){
    const el = document.getElementById("planner-location");
    if (location) {
      el.innerHTML = `
        <div class="plan-loc-row">
          <div><span class="plan-loc-label">Planning from</span>
            <strong>${esc(location.district)} area</strong>
            <span class="plan-loc-sub">${location.precision === "postcode" ? "full postcode, saved to the nearest mile" : "postcode district only"}</span></div>
          <div class="plan-loc-actions">
            <button type="button" class="btn" id="loc-change">Change</button>
            <button type="button" class="btn" id="loc-remove">Remove</button>
          </div>
        </div>`;
      el.querySelector("#loc-change").addEventListener("click", () => { location = null; renderLocationForm(); });
      el.querySelector("#loc-remove").addEventListener("click", removeLocation);
    } else {
      renderLocationForm();
    }
  }

  function renderLocationForm(){
    const el = document.getElementById("planner-location");
    el.innerHTML = `
      <form id="loc-form" class="plan-loc-form" autocomplete="off">
        <label class="plan-loc-label" for="loc-input">Where are you driving from?</label>
        <div class="plan-loc-inputs">
          <input type="text" id="loc-input" class="lock-input" placeholder="Postcode, e.g. PR2 1AB or PR2" maxlength="9" required>
          <button type="submit" class="btn" id="loc-save">Save</button>
        </div>
        <fieldset class="plan-precision">
          <label><input type="radio" name="precision" value="postcode" checked> Full postcode <span>— most accurate drive times</span></label>
          <label><input type="radio" name="precision" value="district"> District only <span>— e.g. "PR2", more private, accurate to a few miles</span></label>
        </fieldset>
        <p class="chart-note">We never store your postcode. It's looked up once, then only a point rounded to about a mile and the district (e.g. PR2) are saved, visible only to you. You can remove it any time.</p>
        <p class="lock-error" id="loc-error" style="display:none;"></p>
      </form>`;
    el.querySelector("#loc-form").addEventListener("submit", saveLocation);
  }

  async function saveLocation(e){
    e.preventDefault();
    const input = document.getElementById("loc-input");
    const err = document.getElementById("loc-error");
    const btn = document.getElementById("loc-save");
    const precision = document.querySelector('input[name="precision"]:checked').value;
    const raw = input.value.trim().toUpperCase().replace(/\s+/g, " ");
    err.style.display = "none";
    btn.disabled = true;
    try {
      let lat, lng, district;
      const outward = raw.split(" ")[0].replace(/[^A-Z0-9]/g, "");
      const isFull = /^[A-Z]{1,2}[0-9][0-9A-Z]? ?[0-9][A-Z]{2}$/.test(raw);
      if (precision === "postcode") {
        if (!isFull) throw new Error("That doesn't look like a full postcode — enter it all (e.g. PR2 1AB), or choose District only.");
        const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(raw.replace(/\s/g, ""))}`);
        const j = await r.json();
        if (!r.ok || !j.result) throw new Error("Couldn't find that postcode.");
        lat = j.result.latitude; lng = j.result.longitude; district = j.result.outcode;
      } else {
        if (!/^[A-Z]{1,2}[0-9][0-9A-Z]?$/.test(outward)) throw new Error("Enter a postcode district, e.g. PR2.");
        const r = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(outward)}`);
        const j = await r.json();
        if (!r.ok || !j.result) throw new Error("Couldn't find that district.");
        lat = j.result.latitude; lng = j.result.longitude; district = j.result.outcode;
      }
      if (lat == null || lng == null) throw new Error("That postcode has no location on record.");
      const p = snapPoint(lat, lng);
      const { error } = await WW.sb.from("planner_user_location").upsert({
        user_id: user.id, lat: p.lat, lng: p.lng, precision, district, updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
      if (error) throw error;
      location = { lat: p.lat, lng: p.lng, precision, district };
      renderLocation();
      setResults('<p class="chart-note">Working out drive times…</p>');
      await loadDrives();
      renderResults();
    } catch (ex) {
      err.textContent = ex.message || "Couldn't save that.";
      err.style.display = "";
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function removeLocation(){
    const { error } = await WW.sb.from("planner_user_location").delete().eq("user_id", user.id);
    if (error) { alert("Couldn't remove it: " + error.message); return; }
    location = null; drive = {};
    renderLocation(); renderResults();
  }

  function renderDays(){
    const el = document.getElementById("planner-days");
    if (!forecast) { el.innerHTML = ""; return; }
    if (!selectedDay) {
      const weekendDay = forecast.days.find(isWeekend);
      selectedDay = weekendDay || forecast.days[0];
    }
    el.innerHTML = forecast.days.map(d =>
      `<button type="button" class="lb-toggle-btn ${d === selectedDay ? "is-active" : ""} ${isWeekend(d) ? "is-weekend" : ""}" data-day="${d}" role="tab" aria-selected="${d === selectedDay}">${dayLabel(d)}</button>`
    ).join("");
    el.querySelectorAll("[data-day]").forEach(b => b.addEventListener("click", () => {
      selectedDay = b.dataset.day; expanded = false; renderDays(); renderResults();
    }));
    el.style.display = pairMode ? "none" : "";
  }

  function verdictClass(v){ return v === "Good" ? "is-good" : v === "Fair" ? "is-fair" : v === "Poor" ? "is-poor" : "is-bad"; }

  function mapsUrl(p){
    return `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(5)},${p.lng.toFixed(5)}&travelmode=driving`;
  }

  function walkCardHtml(r, rank){
    const w = r.w, wx = r.wx, d = r.d;
    const fellChips = w.fells
      .slice().sort((a, b) => b.m - a.m)
      .map(f => `<span class="chal-chip ${climbed[f.name] ? "is-done" : "is-new"}">${esc(f.name)}</span>`).join("");
    const driveTxt = d
      ? `${d.estimated ? "about " : ""}${fmtDuration(d.minutes)} · ${d.estimated ? "~" : ""}${d.miles} mi${d.estimated ? " (estimate)" : ""}`
      : `<a href="#planner-location">Add your area</a> for drive times`;
    const wxTxt = wx ? `
      <div class="plan-wx">
        <span class="plan-verdict ${verdictClass(wx.verdict)}">${wx.verdict}</span>
        <span>${esc(w.top.name)} (${w.top.m} m): gusts ${Math.round(wx.gust)} mph · rain ${wx.rain < 0.1 ? "none" : wx.rain.toFixed(1) + " mm"} · feels ${Math.round(wx.feels)}°C${wx.lowCloud > 70 ? " · likely in cloud" : ""}</span>
      </div>
      <div class="plan-daylight ${r.tight ? "is-tight" : ""}">
        Sunrise ${timeOf(wx.sunrise)}, sunset ${timeOf(wx.sunset)} — ${r.tight ? `walk is longer than the daylight; start at first light or pick a shorter round` : `about ${fmtHours(r.spare)} spare`}
      </div>` : "";
    return `
      <article class="chal-card plan-walk">
        <h3><span class="plan-rank">${rank}</span>${esc(w.label)}</h3>
        <p class="plan-meta"><strong>${r.newFells.length} new</strong> of ${w.fells.length} fell${w.fells.length === 1 ? "" : "s"} · ${w.generated ? "~" : ""}${w.miles} mi · ${w.generated ? "~" : ""}${w.ascent} m ascent · ${fmtHours(w.hours)} walking${w.linear ? " · one-way" : ""}</p>
        ${w.generated ? '<p class="plan-est">Suggested walk — distance, ascent and route are estimates. Plan the line on a map.</p>' : ""}
        ${wxTxt}
        <p class="plan-meta">Park: ${esc(w.start.name)} · ${driveTxt}</p>
        <a class="plan-maps" href="${mapsUrl(w.start)}" target="_blank" rel="noopener">Directions to parking in Google Maps ↗</a>
        <div class="chal-fell-list">${fellChips}</div>
        ${w.url ? `<a class="chal-link" href="${esc(w.url)}" target="_blank" rel="noopener">Route details ↗</a>` : ""}
      </article>`;
  }

  function setResults(html){ document.getElementById("planner-results").innerHTML = html; }

  function renderResults(){
    if (!forecast) return;
    const cov = document.getElementById("planner-coverage");
    const unclimbed = Object.keys(fellsByName).filter(n => !climbed[n]);
    const covered = new Set(walks.flatMap(w => w.fells.map(f => f.name)));
    const inWalks = unclimbed.filter(n => covered.has(n)).length;
    cov.textContent = `${namedWalks.length} named rounds plus ${generatedWalks.length} suggested walks cover ${inWalks} of your ${unclimbed.length} remaining fells.`;

    if (pairMode) {
      const p = bestPair();
      if (!p) { setResults('<p class="chart-note">No good Saturday + Sunday pair within 12 miles of each other in this forecast.</p>'); return; }
      setResults(`
        <p class="plan-pair-note">Two walks ${p.gap < 1 ? "from the same area" : `${p.gap.toFixed(0)} miles apart`} — sleep in the car nearby on Saturday night.</p>
        <div class="section-heading plan-subhead"><h2>${dayLabel(p.sat)}</h2><div class="rule"></div></div>
        ${walkCardHtml(p.x, 1)}
        <div class="section-heading plan-subhead"><h2>${dayLabel(p.sun)}</h2><div class="rule"></div></div>
        ${walkCardHtml(p.y, 2)}`);
      return;
    }
    const ranked = rankFor(selectedDay);
    const shown = expanded ? ranked : ranked.slice(0, INITIAL_SHOWN);
    const more = ranked.length - shown.length;
    setResults(shown.map((r, i) => walkCardHtml(r, i + 1)).join("")
      + (more > 0 ? `<div class="share-row"><button type="button" class="btn" id="planner-more">Show all ${ranked.length} walks</button></div>` : ""));
    const btn = document.getElementById("planner-more");
    if (btn) btn.addEventListener("click", () => { expanded = true; renderResults(); });
  }

  // ---------- startup ----------
  WW.onAuthReady(async (u) => {
    user = u;
    document.getElementById("planner-pair").addEventListener("change", (e) => { pairMode = e.target.checked; renderDays(); renderResults(); });
    document.getElementById("planner-all").addEventListener("change", (e) => { showAll = e.target.checked; renderResults(); });
    try {
      await Promise.all([loadClimbed(), loadLocation()]);
      renderLocation();
      await Promise.all([
        loadDrives(),
        loadForecast().catch(e => { setResults(`<p class="lock-error">${esc(e.message)}</p>`); })
      ]);
      renderDays();
      renderResults();
    } catch (e) {
      console.error(e);
      setResults(`<p class="lock-error">Couldn't load the planner: ${esc(e.message || String(e))}</p>`);
    }
  });
})();
