(function(){
  "use strict";

  // Hosted hikes: host a walk from the planner, share a link, approve
  // requests, then tick the fells for everyone who came.
  //
  // All writes go through SECURITY DEFINER functions (see
  // supabase/migrations/20261031150000_wainwrights_hosted_hikes.sql); the
  // page only ever reads what the database decides this person may see.
  // Emails go out via the hike-notify Edge Function after each action.
  //
  // URLs:  hike.html?t=<token>  one hike      hike.html?new=1  host form
  //        hike.html?list=1     my hikes (also the default with no params)

  const esc = WW.escapeHtml;
  const root = document.getElementById("hike-root");
  const params = new URLSearchParams(location.search);
  let token = params.get("t");
  const wantsNew = params.get("new") === "1";
  const PENDING = "ww_pending_hike";
  const HOST_WALK = "ww_host_walk";
  const MWIS = "https://www.mwis.org.uk/forecasts/english-and-welsh/lake-district";

  // A magic link returns to this page without the query string, so keep the
  // token for the round trip through sign-in.
  try { if (token) sessionStorage.setItem(PENDING, JSON.stringify({ t: token, at: Date.now() })); } catch (e) {}

  let user = null;
  let hike = null;          // result of get_hike_by_token
  let weather = null;       // { verdict, text } | { note }
  let busy = false;

  const SAFETY_ALL = [
    "This walk is organised by a fellow walker, not a qualified leader or a company. Nobody on it is responsible for your safety except you.",
    "You are responsible for your own fitness, kit, food, water and navigation. Carry a map and compass (or an offline map), a head torch, warm and waterproof layers and a charged phone.",
    "Check the <a href=\"" + MWIS + "\" target=\"_blank\" rel=\"noopener\">Mountain Weather Information Service</a> forecast for the day. Conditions on the tops can be far worse than in the valley. Anyone can turn back at any time, and the group should turn back if conditions change.",
    "In an emergency call 999 and ask for Mountain Rescue."
  ];
  const SAFETY_HOST = "As host you agree to set a turnaround time, to cancel or postpone when the forecast is poor, and to tick fells only for people who were actually on the walk.";
  const DEFAULT_KIT = [
    "Waterproof jacket and trousers", "Warm layer, hat and gloves", "Map and compass (or offline map)",
    "Head torch", "Food and water", "First aid kit and whistle", "Charged phone"
  ];
  // WhatsApp group invite links only (same pattern as set_hike_whatsapp in the database).
  const WA_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{8,64}(\?[A-Za-z0-9=&_.%-]{0,100})?$/;
  const waOk = v => !v || (v.length <= 200 && WA_RE.test(v));
  // Instagram handles: same rule as the leaderboard and the database (lowercase letters, numbers, dots, underscores).
  const IG_RE = /^[a-z0-9._]{1,30}$/;
  // Accepts "@name", "name" or a pasted instagram.com/name link.
  const igClean = raw => {
    let v = String(raw || "").trim();
    const m = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
    if (m) v = m[1];
    return v.replace(/^@/, "").toLowerCase();
  };
  const igLink = h => (h && IG_RE.test(h))
    ? `<a class="hike-ig" href="https://www.instagram.com/${encodeURIComponent(h)}/" target="_blank" rel="noopener noreferrer">@${esc(h)} ↗</a>`
    : "";
  let myIg = "", myIgLoaded = false;   // the signed-in person's own leaderboard handle, used to pre-fill the request form
  const ERRORS = {
    not_signed_in: "Please sign in again.", bad_instagram: "That doesn't look like an Instagram username. Use letters, numbers, dots and underscores (up to 30), e.g. @yourname.", bad_whatsapp: "That doesn't look like a WhatsApp invite link. It should start with https://chat.whatsapp.com/", ack_required: "Please tick the box to confirm you've read the safety notes.",
    bad_title: "Give the hike a title (3–80 characters).", bad_area: "Add the area (2–60 characters), e.g. \"Glenridding\".",
    bad_start: "Pick a start time in the future (within 120 days).", bad_spaces: "Spaces must be between 1 and 20.",
    bad_meeting_point: "The meeting point must be in the Lake District.", bad_kit: "Kit list: up to 20 items, each under 60 characters.",
    bad_turnaround: "Turnaround time must look like 15:00.", bad_text: "A note or contact is too long.",
    bad_walk: "That walk couldn't be used. Go back to the planner and pick it again.", not_in_team: "You're not an approved member of that team.",
    too_many_hikes: "You already have 10 upcoming hikes. Cancel or finish one first.",
    hike_closed: "This hike is no longer open.", hike_full: "All places are taken. Remove someone or raise the spaces first.",
    cannot_rejoin: "You can't request a place on this hike.", is_host: "You're the host of this hike.",
    not_host: "Only the host can do that.", no_pending_request: "That request has already been dealt with.",
    spaces_below_approved: "You can't set fewer spaces than the number of people already approved.",
    confirmation_required: "Please tick the box to confirm who attended.", not_started: "You can tick fells once the walk has started.",
    too_late: "It's more than 14 days since this walk, so it can't be ticked from here any more.",
    already_completed: "Fells have already been ticked for this hike.", not_attendee: "That person isn't an approved attendee.",
    not_found: "Hike not found.", bad_reason: "Please say a little more (5–500 characters)."
  };
  const READABLE = /isn't allowed here|account has been suspended/;
  const errMsg = e => {
    const m = (e && e.message) || "";
    return ERRORS[m] || (READABLE.test(m) ? m : "Something went wrong: " + (m || "unknown error"));
  };

  // ---------- helpers ----------
  async function rpc(name, args){
    const { data, error } = await WW.sb.rpc(name, args || {});
    if (error) throw error;
    return data;
  }
  async function notify(hikeId){
    try { await WW.sb.functions.invoke("hike-notify", { body: { hike_id: hikeId } }); } catch (e) { /* emails are best-effort */ }
  }
  const $ = id => document.getElementById(id);
  const fmtWhen = iso => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const mapsUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}&travelmode=driving`;
  const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hikeLink = t => location.origin + location.pathname.replace(/[^/]*$/, "") + "hike.html?t=" + encodeURIComponent(t);

  // ---------- calendar file (.ics) ----------
  // Hikes have no end time, so the entry runs a flat 6 hours (said so in its description).
  const HIKE_HOURS = 6;
  const icsEsc = v => String(v == null ? "" : v).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const utf8 = new TextEncoder();
  // RFC 5545: lines are at most 75 octets; longer ones are folded onto lines that start with a space.
  function icsFold(line){
    const out = []; let cur = "", bytes = 0;
    for (const ch of line) {
      const b = utf8.encode(ch).length;
      if (bytes + b > 75) { out.push(cur); cur = " "; bytes = 1; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join("\r\n");
  }
  function hikeIcs(h){
    const start = new Date(h.start_at), end = new Date(start.getTime() + HIKE_HOURS * 3600 * 1000);
    const stamp = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const p = h.private || {}, w = h.walk || {};
    const hasPoint = p.meet_lat != null && p.meet_lng != null;
    const lat = hasPoint ? Number(p.meet_lat).toFixed(5) : "", lng = hasPoint ? Number(p.meet_lng).toFixed(5) : "";
    const desc = [
      w.label ? "Walk: " + w.label : "",
      (w.fells || []).length ? "Fells: " + w.fells.join(", ") : "",
      [w.miles != null ? w.miles + " mi" : "", w.ascent != null ? w.ascent + " m ascent" : ""].filter(Boolean).join(" · "),
      "Hosted by " + h.host_name,
      h.turnaround_time ? "Turn back at " + h.turnaround_time : "",
      hasPoint ? "Meeting point: https://www.google.com/maps/search/?api=1&query=" + lat + "," + lng : "",
      p.meet_note ? "Where exactly: " + p.meet_note : "",
      p.host_contact ? "Host contact: " + p.host_contact : "",
      p.whatsapp_url ? "WhatsApp chat: " + p.whatsapp_url : "",
      "Hike page: " + hikeLink(token),
      "The end time is an estimate. Check the forecast and the Mountain Weather Information Service before you go."
    ].filter(Boolean).join("\n");
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Wainwrights//Hikes//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + h.id + "@wainwrights",
      "DTSTAMP:" + stamp(new Date()), "DTSTART:" + stamp(start), "DTEND:" + stamp(end),
      "SUMMARY:" + icsEsc(h.title),
      "LOCATION:" + icsEsc([h.area, p.meet_note].filter(Boolean).join(" — ")),
      hasPoint ? "GEO:" + lat + ";" + lng : "",
      "DESCRIPTION:" + icsEsc(desc),
      "URL:" + hikeLink(token),
      "STATUS:CONFIRMED",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc("Hike tomorrow: " + h.title), "TRIGGER:-P1D", "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc("Hike today: " + h.title), "TRIGGER:-PT2H", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"
    ].filter(Boolean);
    return lines.map(icsFold).join("\r\n") + "\r\n";
  }
  function downloadHikeIcs(h){
    const day = new Date(h.start_at).toISOString().slice(0, 10);
    const slug = String(h.title || "hike").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "hike";
    const blob = new Blob([hikeIcs(h)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hike-" + slug + "-" + day + ".ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const hasStarted = () => hike && new Date(hike.start_at) <= new Date();
  function flash(msg, bad){
    const el = $("hike-msg"); if (!el) return;
    el.className = bad ? "lock-error" : "chart-note"; el.textContent = msg; el.style.display = "block";
    el.scrollIntoView({ block: "nearest" });
  }
  function parsePoint(text){
    const t = String(text || "").trim();
    if (!t) return null;
    const m = t.match(/@(-?\d{1,2}\.\d+),(-?\d{1,2}\.\d+)/) || t.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,2}\.\d+)/);
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : "bad";
  }
  const safetyHtml = (host) => `<div class="hike-safety"><h3>Before you go</h3><ul>${SAFETY_ALL.map(s => `<li>${s}</li>`).join("")}${host ? `<li>${esc(SAFETY_HOST)}</li>` : ""}</ul></div>`;

  async function guard(btn, fn){
    if (busy) return; busy = true;
    if (btn) btn.disabled = true;
    try { await fn(); } catch (e) { console.error(e); flash(errMsg(e), true); }
    finally { busy = false; if (btn) btn.disabled = false; }
  }

  // ---------- list view ----------
  async function showList(){
    root.innerHTML = '<p class="chart-note">Loading…</p>';
    const [mine, notes, blocks] = await Promise.all([
      rpc("my_hikes"),
      WW.sb.from("hike_notifications").select("id,hike_id,kind,body,read_at,created_at").order("created_at", { ascending: false }).limit(15),
      WW.sb.from("host_blocks").select("blocked_user_id,display_name").order("created_at")
    ]);
    const byId = {}; (mine || []).forEach(h => { byId[h.id] = h; });
    const roleLabel = h => h.role === "host" ? "Hosting" : h.role === "approved" ? "Going" : "Requested";
    const rows = (mine || []).map(h => `
      <a class="hike-row" href="hike.html?t=${encodeURIComponent(h.share_token)}">
        <span class="hike-row-title">${esc(h.title)}</span>
        <span class="hike-row-meta">${esc(fmtWhen(h.start_at))} · ${esc(roleLabel(h))}${h.status !== "open" ? " · " + esc(h.status) : ""}${h.role === "host" && h.pending_count ? ` · <strong>${h.pending_count} waiting</strong>` : ""}</span>
      </a>`).join("");
    const noteRows = ((notes && notes.data) || []).map(n => {
      const h = byId[n.hike_id];
      const inner = `<span class="${n.read_at ? "" : "hike-unread"}">${esc(n.body)}</span> <span class="hike-note-when">${esc(fmtWhen(n.created_at))}</span>`;
      return `<li>${h ? `<a href="hike.html?t=${encodeURIComponent(h.share_token)}">${inner}</a>` : inner}</li>`;
    }).join("");
    const blockRows = ((blocks && blocks.data) || []).map(b => `<li>${esc(b.display_name)} <button class="btn hike-small" data-action="unblock" data-uid="${esc(b.blocked_user_id)}">Unblock</button></li>`).join("");
    root.innerHTML = `
      <div class="section-heading"><h2>Hikes</h2><div class="rule"></div></div>
      <p class="chart-note" style="margin:-4px 0 14px;">Host a walk from the <a href="planner.html">Planner</a> (pick a walk, then "Host this walk"), build your own, or open a link someone has sent you.</p>
      <div class="share-row" style="justify-content:flex-start;margin:0 0 14px;"><a class="btn" href="hike.html?new=1&custom=1">Create a custom hike</a></div>
      <div id="hike-msg" style="display:none;"></div>
      ${rows ? `<div class="hike-list">${rows}</div>` : '<p class="chart-note">You\'re not hosting or joining any hikes yet.</p>'}
      ${noteRows ? `<div class="section-heading plan-subhead"><h2>Updates</h2><div class="rule"></div></div><ul class="hike-notes">${noteRows}</ul>` : ""}
      ${blockRows ? `<div class="section-heading plan-subhead"><h2>Blocked walkers</h2><div class="rule"></div></div><ul class="hike-notes">${blockRows}</ul>` : ""}`;
    if ((notes && notes.data || []).some(n => !n.read_at)) rpc("mark_hike_notifications_read").catch(() => {});
  }

  // ---------- host form ----------
  async function loadTeams(){
    // teams the host can tie the hike to
    try {
      const mem = await WW.sb.from("team_members").select("team_id,status").eq("user_id", user.id);
      const ids = ((mem.data) || []).filter(m => m.status === "approved").map(m => m.team_id);
      const t = await WW.sb.from("teams").select("id,name,admin_user_id");
      return ((t.data) || []).filter(x => ids.includes(x.id) || x.admin_user_id === user.id);
    } catch (e) { return []; }
  }
  const teamSelectHtml = teams => teams.length ? `<label>Tie to a team (members are approved automatically)<select class="lock-input" id="n-team"><option value="">No team</option>${teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select></label>` : "";

  // Custom hike: the host names it and ticks the Wainwrights it includes.
  async function showCustomForm(){
    const teams = await loadTeams();
    const min = new Date(Date.now() + 3600 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const books = FELLS_DATA.map((b, bi) => `
      <details class="fell-book" data-book="${bi}"><summary>${esc(b.name)} <span class="fell-book-count" data-count-for="${bi}"></span></summary>
        ${b.fells.map(f => `<label class="plan-check fell-opt" data-name="${esc(f.name.toLowerCase())}"><input type="checkbox" class="f-pick" data-book="${bi}" value="${esc(f.name)}"> ${esc(f.name)} <span class="fell-m">${f.m} m</span></label>`).join("")}
      </details>`).join("");
    root.innerHTML = `
      <div class="section-heading"><h2>Create a custom hike</h2><div class="rule"></div></div>
      <div id="hike-msg" style="display:none;"></div>
      <form id="hike-new" class="plan-card hike-form">
        <label>Title<input class="lock-input" id="n-title" maxlength="80" placeholder="e.g. Skiddaw via Ullock Pike"></label>
        <label>Area (shown to anyone with the link)<input class="lock-input" id="n-area" maxlength="60" placeholder="e.g. Keswick"></label>
        <div class="hike-form-fells">
          <h3 class="hike-sub">Which Wainwrights?</h3>
          <input class="lock-input" id="f-search" type="search" placeholder="Search fells…" autocomplete="off">
          <p class="chart-note" id="f-count">No fells picked yet. Up to 30.</p>
          <div id="f-list">${books}</div>
        </div>
        <label>Distance in miles (optional)<input class="lock-input" id="n-miles" type="number" min="1" max="200" step="0.5" inputmode="decimal"></label>
        <label>Total ascent in metres (optional)<input class="lock-input" id="n-ascent" type="number" min="1" max="20000" step="10" inputmode="numeric"></label>
        <label>Link to the route (optional — AllTrails, Komoot, OS Maps…)<input class="lock-input" id="n-url" type="url" placeholder="https://…"></label>
        <label>Start<input class="lock-input" id="n-when" type="datetime-local" min="${min}"></label>
        <label>Places (not counting you)<input class="lock-input" id="n-spaces" type="number" min="1" max="20" value="4"></label>
        <label>Meeting point — Google Maps link or "lat, lng" (required; in Google Maps press and hold the car park, then copy the coordinates). Only approved walkers see it.<input class="lock-input" id="n-point" placeholder="54.5436, -2.9490"></label>
        <label>Meeting point note<input class="lock-input" id="n-note" maxlength="300" placeholder="e.g. far end of the main car park"></label>
        <label>Your contact for approved walkers (phone or WhatsApp)<input class="lock-input" id="n-contact" maxlength="120" placeholder="optional, strongly recommended"></label>
        <label>WhatsApp group invite link for approved walkers (optional — in WhatsApp: group info → Invite via link → Copy link)<input class="lock-input" id="n-wa" type="url" maxlength="200" placeholder="https://chat.whatsapp.com/..."></label>
        <label>Turnaround time (turn back at this time wherever you are)<input class="lock-input" id="n-turn" type="time"></label>
        <label>Kit list (one per line)<textarea class="lock-input hike-text" id="n-kit" rows="6">${esc(DEFAULT_KIT.join("\n"))}</textarea></label>
        ${teamSelectHtml(teams)}
        ${safetyHtml(true)}
        <label class="plan-check"><input type="checkbox" id="n-ack"> I've read this and I'm happy to host on these terms.</label>
        <div class="share-row"><button class="btn" type="submit" id="n-submit">Create hike</button></div>
        <p class="chart-note">Your display name is shown to people who open the link. Anyone with the link can ask to join; you approve each person. You'll plan the route yourself, so check it on a map before you share it.</p>
      </form>`;
    const picks = () => Array.from(document.querySelectorAll(".f-pick:checked"));
    function refresh(){
      const n = picks().length;
      $("f-count").textContent = n ? `${n} fell${n === 1 ? "" : "s"} picked${n > 30 ? " — too many, the limit is 30" : ""}.` : "No fells picked yet. Up to 30.";
      FELLS_DATA.forEach((b, bi) => {
        const c = document.querySelectorAll(`.f-pick[data-book="${bi}"]:checked`).length;
        const el = document.querySelector(`[data-count-for="${bi}"]`); if (el) el.textContent = c ? `· ${c} picked` : "";
      });
    }
    $("f-list").addEventListener("change", refresh);
    $("f-search").addEventListener("input", () => {
      const q = $("f-search").value.trim().toLowerCase();
      document.querySelectorAll(".fell-opt").forEach(l => { l.style.display = !q || l.dataset.name.includes(q) || l.querySelector("input").checked ? "" : "none"; });
      document.querySelectorAll(".fell-book").forEach(d => { d.open = !!q; });
    });
    $("hike-new").addEventListener("submit", e => { e.preventDefault(); guard($("n-submit"), () => createHike(null)); });
  }

  async function showNewForm(){
    if (params.get("custom") === "1") return showCustomForm();
    let walk = null;
    try { walk = JSON.parse(sessionStorage.getItem(HOST_WALK) || "null"); } catch (e) {}
    if (!walk || !walk.fells || !walk.fells.length) {
      root.innerHTML = `<div class="section-heading"><h2>Host a walk</h2><div class="rule"></div></div>
        <p class="chart-note">Pick a walk in the <a href="planner.html">Planner</a> and press "Host this walk".</p>`;
      return;
    }
    const teams = await loadTeams();
    const area = (walk.start_name || "").split(",")[1] ? walk.start_name.split(",")[1].trim() : (walk.start_name || "").split(",")[0].trim();
    const min = new Date(Date.now() + 3600 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    root.innerHTML = `
      <div class="section-heading"><h2>Host this walk</h2><div class="rule"></div></div>
      <div id="hike-msg" style="display:none;"></div>
      <form id="hike-new" class="plan-card hike-form">
        <p class="plan-meta"><strong>${esc(walk.label)}</strong> · ${walk.miles} mi · ${walk.ascent} m · ${walk.fells.length} fell${walk.fells.length === 1 ? "" : "s"}</p>
        <label>Title<input class="lock-input" id="n-title" maxlength="80" value="${esc(walk.label)}"></label>
        <label>Area (shown to anyone with the link)<input class="lock-input" id="n-area" maxlength="60" value="${esc(area)}"></label>
        <label>Start<input class="lock-input" id="n-when" type="datetime-local" min="${min}" required></label>
        <label>Places (not counting you)<input class="lock-input" id="n-spaces" type="number" min="1" max="20" value="4"></label>
        <label>Meeting point note (only approved walkers see this)<input class="lock-input" id="n-note" maxlength="300" placeholder="e.g. far end of the main car park, by the toilets" value="${esc(walk.start_name || "")}"></label>
        <label>Different meeting point? Paste a Google Maps link or "lat, lng" (otherwise the walk's parking spot is used)<input class="lock-input" id="n-point" placeholder="optional"></label>
        <label>Your contact for approved walkers (phone or WhatsApp)<input class="lock-input" id="n-contact" maxlength="120" placeholder="optional, strongly recommended"></label>
        <label>WhatsApp group invite link for approved walkers (optional — in WhatsApp: group info → Invite via link → Copy link)<input class="lock-input" id="n-wa" type="url" maxlength="200" placeholder="https://chat.whatsapp.com/..."></label>
        <label>Turnaround time (turn back at this time wherever you are)<input class="lock-input" id="n-turn" type="time"></label>
        <label>Kit list (one per line)<textarea class="lock-input hike-text" id="n-kit" rows="6">${esc(DEFAULT_KIT.join("\n"))}</textarea></label>
        ${teamSelectHtml(teams)}
        ${safetyHtml(true)}
        <label class="plan-check"><input type="checkbox" id="n-ack"> I've read this and I'm happy to host on these terms.</label>
        <div class="share-row"><button class="btn" type="submit" id="n-submit">Create hike</button></div>
        <p class="chart-note">Your display name is shown to people who open the link. Anyone with the link can ask to join; you approve each person.</p>
      </form>`;
    $("hike-new").addEventListener("submit", e => { e.preventDefault(); guard($("n-submit"), () => createHike(walk)); });
  }

  async function createHike(walk){
    const custom = !walk;
    const whenVal = $("n-when").value;
    if (!whenVal) throw new Error("bad_start");
    let lat, lng, snapshot;
    const pt = parsePoint($("n-point").value);
    if (pt === "bad" || (custom && !pt)) { flash("Couldn't read the meeting point. Use a Google Maps link that contains coordinates, or \"lat, lng\".", true); return; }
    if (custom) {
      const names = Array.from(document.querySelectorAll(".f-pick:checked")).map(x => x.value);
      if (!names.length) { flash("Pick at least one fell.", true); return; }
      if (names.length > 30) { flash("A hike can include up to 30 fells.", true); return; }
      const byName = {}; FELLS_DATA.forEach(b => b.fells.forEach(f => { byName[f.name] = f; }));
      const top = names.map(n => byName[n]).reduce((a, f) => (!a || f.m > a.m ? f : a), null);
      const miles = Number($("n-miles").value), ascent = Number($("n-ascent").value), url = $("n-url").value.trim();
      lat = pt.lat; lng = pt.lng;
      snapshot = {
        label: $("n-title").value.trim(), miles: miles > 0 ? miles : null, ascent: ascent > 0 ? Math.round(ascent) : null, fells: names,
        top_name: top.name, top_m: top.m, top_lat: top.lat, top_lng: top.lng, start_name: $("n-note").value.trim() || null,
        url: /^https:\/\//.test(url) ? url : null
      };
    } else {
      lat = walk.start_lat; lng = walk.start_lng;
      if (pt) { lat = pt.lat; lng = pt.lng; }
      snapshot = {
        label: walk.label, miles: walk.miles, ascent: walk.ascent, fells: walk.fells, top_name: walk.top_name, top_m: walk.top_m,
        top_lat: walk.top_lat, top_lng: walk.top_lng, start_name: walk.start_name, url: walk.url || null
      };
    }
    const wa = $("n-wa").value.trim();
    if (!waOk(wa)) { flash(ERRORS.bad_whatsapp, true); return; }
    const kit = $("n-kit").value.split("\n").map(s => s.trim()).filter(Boolean);
    const team = $("n-team") ? $("n-team").value : "";
    const res = await rpc("create_hike", {
      p_title: $("n-title").value, p_walk_key: custom ? "custom" : String(walk.id), p_walk_snapshot: snapshot, p_area: $("n-area").value,
      p_start_at: new Date(whenVal).toISOString(), p_spaces: Number($("n-spaces").value), p_kit: kit,
      p_turnaround: $("n-turn").value || null, p_meet_lat: lat, p_meet_lng: lng, p_meet_note: $("n-note").value,
      p_contact: $("n-contact").value, p_team_id: team || null, p_ack: $("n-ack").checked
    });
    // Saved by its own call; if it fails the hike still exists and the host can add the link under "Edit details".
    if (wa) { try { await rpc("set_hike_whatsapp", { p_hike_id: res.id, p_url: wa }); } catch (e) {} }
    try { sessionStorage.removeItem(HOST_WALK); } catch (e) {}
    location.href = "hike.html?t=" + encodeURIComponent(res.share_token);
  }

  // ---------- weather ----------
  async function loadWeather(h){
    const w = h.walk || {};
    if (w.top_lat == null || w.top_lng == null) return null;
    const start = new Date(h.start_at);
    const days = Math.round((new Date(localISO(start) + "T12:00:00") - new Date(localISO(new Date()) + "T12:00:00")) / 86400000);
    if (days < 0) return null;
    if (days > 6) return { note: "The summit forecast will appear here within a week of the walk." };
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + w.top_lat + "&longitude=" + w.top_lng
      + (w.top_m ? "&elevation=" + w.top_m : "")
      + "&hourly=apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m&forecast_days=7&timezone=Europe%2FLondon&wind_speed_unit=mph";
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = await res.json();
    const day = localISO(start), t = body.hourly.time, idx = [];
    t.forEach((x, i) => { const hr = Number(x.slice(11, 13)); if (x.startsWith(day) && hr >= 9 && hr <= 16) idx.push(i); });
    if (!idx.length) return null;
    const pick = k => idx.map(i => body.hourly[k][i]).filter(v => v != null);
    const gust = Math.max(...pick("wind_gusts_10m")), rain = pick("precipitation").reduce((s, v) => s + v, 0), feels = Math.min(...pick("apparent_temperature"));
    let verdict = "Looks OK", cls = "is-good";
    if (gust >= 45 || rain >= 8 || feels <= -8) { verdict = "Poor"; cls = "is-bad"; }
    else if (gust >= 35 || rain >= 3 || feels <= -2) { verdict = "Take care"; cls = "is-fair"; }
    return { verdict, cls, bad: cls !== "is-good", text: `${w.top_name || "Summit"}${w.top_m ? " (" + w.top_m + " m)" : ""}, 09:00–16:00: gusts to ${Math.round(gust)} mph · rain ${rain < 0.1 ? "none" : rain.toFixed(1) + " mm"} · feels as low as ${Math.round(feels)}°C` };
  }
  function weatherHtml(){
    if (!weather) return "";
    if (weather.note) return `<p class="chart-note">${esc(weather.note)} <a href="${MWIS}" target="_blank" rel="noopener">Mountain forecast ↗</a></p>`;
    const soon = (new Date(hike.start_at) - new Date()) < 48 * 3600 * 1000;
    const nudge = hike.is_host && hike.status === "open" && weather.bad && soon
      ? `<p class="hike-nudge"><strong>The forecast is ${weather.verdict === "Poor" ? "poor" : "marginal"}.</strong> Think about cancelling or moving the walk, and tell your walkers early. <button class="btn hike-small" data-action="open-cancel">Cancel this hike</button></p>` : "";
    return `<div class="hike-weather ${weather.cls}"><span class="plan-verdict ${weather.cls}">${esc(weather.verdict)}</span> <span>${esc(weather.text)}</span>
      <p class="chart-note">A model forecast for the summit, not a guarantee. Check the <a href="${MWIS}" target="_blank" rel="noopener">Mountain Weather Information Service ↗</a> before you set off.</p></div>${nudge}`;
  }

  // ---------- hike view ----------
  async function showHike(){
    root.innerHTML = '<p class="chart-note">Loading…</p>';
    hike = await rpc("get_hike_by_token", { p_token: token });
    if (!hike) { root.innerHTML = `<div class="section-heading"><h2>Hike not found</h2><div class="rule"></div></div><p class="chart-note">That link isn't valid any more. Ask the host for a fresh one, or see <a href="hike.html?list=1">your hikes</a>.</p>`; return; }
    weather = null;
    if (!hike.is_host && !myIgLoaded) {
      myIgLoaded = true;
      try {
        const { data } = await WW.sb.from("leaderboard_opt_in").select("instagram_handle").eq("user_id", user.id).maybeSingle();
        myIg = (data && data.instagram_handle) || "";
      } catch (e) { /* no handle to pre-fill: fine */ }
    }
    renderHike();
    if (hike.status === "open") {
      loadWeather(hike).then(w => { weather = w; const el = $("hike-weather"); if (el) el.innerHTML = weatherHtml(); }).catch(() => {});
    }
  }

  function renderHike(){
    const h = hike, w = h.walk || {}, left = h.spaces - h.approved_count;
    const statusBadge = h.status === "cancelled" ? '<span class="plan-verdict is-bad">Cancelled</span>' : h.status === "completed" ? '<span class="plan-verdict is-good">Completed</span>' : "";
    const fells = (w.fells || []).map(f => `<span class="chal-chip">${esc(f)}</span>`).join("");
    const kit = (h.kit || []).length ? `<h3 class="hike-sub">Bring</h3><ul class="hike-kit">${h.kit.map(k => `<li>${esc(k)}</li>`).join("")}</ul>` : "";
    const priv = h.private;
    const detail = priv ? `
      <div class="hike-private">
        <h3 class="hike-sub">Meeting point</h3>
        <p><a class="plan-maps" href="${mapsUrl(priv.meet_lat, priv.meet_lng)}" target="_blank" rel="noopener">Directions to the meeting point in Google Maps ↗</a></p>
        ${priv.meet_note ? `<p>${esc(priv.meet_note)}</p>` : ""}
        ${priv.host_contact ? `<p><strong>Host contact:</strong> ${esc(priv.host_contact)}</p>` : ""}
        ${priv.whatsapp_url && waOk(priv.whatsapp_url) ? `<p><a class="btn" href="${esc(priv.whatsapp_url)}" target="_blank" rel="noopener noreferrer">Join the WhatsApp chat ↗</a></p>` : ""}
      </div>` : "";

    let body = "";
    if (h.status === "cancelled") {
      body = `<div class="hike-note-box is-bad"><strong>This hike has been cancelled.</strong>${h.status_note ? " " + esc(h.status_note) : ""}</div>`;
    }
    if (h.is_host) body += hostHtml(); else body += visitorHtml(left);

    root.innerHTML = `
      <div class="section-heading"><h2>${esc(h.title)}</h2><div class="rule"></div></div>
      <div id="hike-msg" style="display:none;"></div>
      <article class="chal-card hike-card">
        <p class="plan-meta">${statusBadge} <strong>${esc(fmtWhen(h.start_at))}</strong> · ${esc(h.area)} · hosted by ${esc(h.host_name)}${h.team_name ? " for " + esc(h.team_name) : h.is_team_hike ? " for a team" : ""}</p>
        <p class="plan-meta">${[esc(w.label || ""), w.miles != null ? w.miles + " mi" : "", w.ascent != null ? w.ascent + " m ascent" : "", h.turnaround_time ? "turn back at <strong>" + esc(h.turnaround_time) + "</strong>" : ""].filter(Boolean).join(" · ")}</p>
        <p class="plan-meta">${h.approved_count} of ${h.spaces} places taken${left > 0 && h.status === "open" ? ` · ${left} left` : ""}</p>
        <div class="chal-fell-list">${fells}</div>
        ${w.url ? `<a class="chal-link" href="${esc(w.url)}" target="_blank" rel="noopener">View the route ↗</a>` : ""}
        <div id="hike-weather">${weatherHtml()}</div>
        ${kit}
        ${detail}
      </article>
      ${body}
      ${storyCardHtml()}
      ${safetyHtml(false)}
      ${h.is_host ? "" : `<p class="chart-note"><button class="hike-link" data-action="open-report">Report this hike</button></p><div id="hike-report"></div>`}
      <p class="chart-note"><a href="hike.html?list=1">← All my hikes</a></p>`;
  }

  function storyCardHtml(){
    const h = hike;
    if (h.status === "cancelled") return "";
    const started = h.status === "completed" || hasStarted();
    const after = `<div class="hike-story-opt${started ? "" : " is-off"}">
        <h4>After the walk</h4>
        <p>${h.is_host ? "A “we walked” card: the fells, the distance and who came, with names and @handles." : "A “we walked” card: the fells, the distance and who came, with names and @handles."}</p>
        <button class="btn" data-action="story" ${started ? "" : "disabled"}>${started ? "Share the walk" : "Opens when the walk starts"}</button></div>`;
    if (!h.is_host) return h.my_status === "approved" ? `<div class="plan-card"><h3 class="hike-sub">Instagram Story</h3><div class="hike-story-grid">${after}</div></div>` : "";
    const invite = `<div class="hike-story-opt${started ? " is-off" : ""}">
        <h4>Invite people</h4>
        <p>An invitation with the details and places left. Copies the link — add it as a Link sticker so people can ask for a place.</p>
        <button class="btn" data-action="story-invite" ${started ? "disabled" : ""}>${started ? "Closed — walk has started" : "Share the invite"}</button></div>`;
    return `<div class="plan-card"><h3 class="hike-sub">Instagram Story</h3>
      <p class="chart-note">Two different stories — one to get people along, one to show who walked.</p>
      <div class="hike-story-grid">${invite}${after}</div></div>`;
  }

  function attendeeNames(){
    const list = hike.attendees || [];
    return list.length ? `<h3 class="hike-sub">Who's going</h3><ul class="hike-going">${list.map(a => `<li>${esc(a.display_name)}${a.instagram_handle ? " " + igLink(a.instagram_handle) : ""}</li>`).join("")}</ul>` : "";
  }

  function visitorHtml(left){
    const h = hike, s = h.my_status;
    let html = "";
    if (h.status === "completed") {
      if (h.my_tick_count > 0) {
        html += `<div class="hike-note-box"><strong>The host ticked ${h.my_tick_count} fell${h.my_tick_count === 1 ? "" : "s"} for you after this walk.</strong> Wasn't on it? <button class="btn hike-small" data-action="undo">I wasn't there — remove them</button></div>`;
      } else if (s === "approved") {
        html += `<div class="hike-note-box">This hike has been completed.</div>`;
      }
      return html + (s === "approved" ? attendeeNames() : "");
    }
    if (h.status !== "open") return html;
    if (hasStarted()) return html + '<p class="chart-note">This hike has already started.</p>';
    if (s === "approved") {
      html += `<div class="hike-note-box is-good"><strong>You're in.</strong> The meeting point, host contact and WhatsApp chat (if the host added one) are above. <button class="btn hike-small" data-action="ics">Add to calendar</button> <button class="btn hike-small" data-action="withdraw">Pull out</button></div>` + attendeeNames();
    } else if (s === "requested") {
      html += `<div class="hike-note-box"><strong>Request sent.</strong> The host will approve or decline it, and you'll get an email. <button class="btn hike-small" data-action="withdraw">Withdraw request</button></div>`;
    } else if (s === "declined" || s === "removed") {
      html += `<div class="hike-note-box">You can't join this hike.</div>`;
    } else if (left <= 0) {
      html += `<div class="hike-note-box">This hike is full.</div>`;
    } else {
      html += `<form id="hike-request" class="plan-card hike-form">
        <h3 class="hike-sub">Ask to join</h3>
        <p class="chart-note">The host approves each person. The exact meeting point, host contact and WhatsApp chat link are shown once you're approved. Your display name is shown to the host.</p>
        <label>Message to the host (optional) — your experience, anything they should know<textarea class="lock-input hike-text" id="r-msg" rows="3" maxlength="300"></textarea></label>
        <label>Your Instagram (optional) — so the host can see who you are before approving. Shown to the host, and to other walkers once you're approved.<input class="lock-input" id="r-ig" maxlength="80" placeholder="@yourname" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(myIg ? "@" + myIg : "")}"></label>
        <label class="plan-check"><input type="checkbox" id="r-ack"> I've read the safety notes below. I'm responsible for my own safety.</label>
        <div class="share-row"><button class="btn" type="submit" id="r-submit">Ask to join</button></div></form>`;
    }
    return html;
  }

  function hostHtml(){
    const h = hike, list = h.attendees || [];
    const pending = list.filter(a => a.status === "requested"), approved = list.filter(a => a.status === "approved");
    let html = "";
    // share
    html += `<div class="plan-card"><h3 class="hike-sub">Share this hike</h3>
      <p class="hike-link-box" id="hike-link">${esc(hikeLink(token))}</p>
      <div class="hike-actions"><button class="btn" data-action="copy">Copy link</button>${navigator.share ? '<button class="btn" data-action="share">Share…</button>' : ""}${h.status === "open" ? '<button class="btn" data-action="ics">Add to calendar</button>' : ""}</div>
      <p class="chart-note">Anyone with this link can ask to join. Only people you approve see the meeting point, your contact and the WhatsApp link.</p></div>`;
    if (h.status === "open") {
      html += `<div class="plan-card"><h3 class="hike-sub">Requests${pending.length ? " (" + pending.length + ")" : ""}</h3>${pending.length ? pending.map(a => `
        <div class="hike-person"><div><strong>${esc(a.display_name)}</strong>${igLink(a.instagram_handle) ? `<div class="hike-ig-line">${igLink(a.instagram_handle)}</div>` : '<div class="hike-ig-line hike-ig-none">No Instagram given</div>'}${a.message ? `<div class="hike-msg">${esc(a.message)}</div>` : ""}</div>
        <div class="hike-person-actions"><button class="btn hike-small" data-action="approve" data-uid="${esc(a.user_id)}">Approve</button>
        <button class="btn hike-small" data-action="decline" data-uid="${esc(a.user_id)}">Decline</button></div></div>`).join("") : '<p class="chart-note">No requests waiting.</p>'}</div>`;
    }
    const canTick = h.status === "open" && hasStarted();
    html += `<div class="plan-card"><h3 class="hike-sub">Going (${approved.length} of ${h.spaces})</h3>${approved.length ? approved.map(a => `
      <div class="hike-person"><div><strong>${esc(a.display_name)}</strong>${igLink(a.instagram_handle) ? `<div class="hike-ig-line">${igLink(a.instagram_handle)}</div>` : ""}</div>
      ${h.status === "open" && !hasStarted() ? `<div class="hike-person-actions"><button class="btn hike-small" data-action="remove" data-uid="${esc(a.user_id)}">Remove</button>
      <button class="btn hike-small" data-action="remove-block" data-uid="${esc(a.user_id)}">Remove &amp; block</button></div>` : ""}</div>`).join("") : '<p class="chart-note">Nobody approved yet.</p>'}</div>`;
    if (canTick) {
      html += `<div class="plan-card" id="hike-tick"><h3 class="hike-sub">Tick the fells for everyone</h3>
        <p class="chart-note">Untick anyone who didn't make it. Fells (${(h.walk.fells || []).map(esc).join(", ")}) are ticked for you and for each person ticked below. Each walker is told and can undo it.</p>
        <label class="plan-check"><input type="checkbox" checked disabled> You (host)</label>
        ${approved.map(a => `<label class="plan-check"><input type="checkbox" class="tick-who" value="${esc(a.user_id)}" checked> ${esc(a.display_name)}</label>`).join("")}
        <label class="plan-check"><input type="checkbox" id="tick-confirm"> I confirm everyone ticked above was on this walk.</label>
        <div class="share-row"><button class="btn" data-action="complete">Tick fells for everyone</button></div></div>`;
    }
    if (h.status === "completed") {
      html += `<div class="hike-note-box is-good"><strong>Done.</strong> Fells were ticked for the people who attended.${h.my_tick_count > 0 ? ` <button class="btn hike-small" data-action="undo">Remove my own ticks</button>` : ""}</div>`;
    }
    if (h.status === "open") {
      const d = new Date(h.start_at), local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const p = h.private || {};
      html += `<details class="plan-card" id="hike-edit"><summary class="hike-sub">Edit details</summary>
        <div class="hike-form">
        <label>Start<input class="lock-input" id="e-when" type="datetime-local" value="${local}"></label>
        <label>Places<input class="lock-input" id="e-spaces" type="number" min="1" max="20" value="${h.spaces}"></label>
        <label>Meeting point note<input class="lock-input" id="e-note" maxlength="300" value="${esc(p.meet_note || "")}"></label>
        <label>Meeting point (Google Maps link or "lat, lng")<input class="lock-input" id="e-point" value="${esc(p.meet_lat != null ? Number(p.meet_lat).toFixed(5) + ", " + Number(p.meet_lng).toFixed(5) : "")}"></label>
        <label>Your contact<input class="lock-input" id="e-contact" maxlength="120" value="${esc(p.host_contact || "")}"></label>
        <label>WhatsApp group invite link (only approved walkers see it; clear to remove)<input class="lock-input" id="e-wa" type="url" maxlength="200" placeholder="https://chat.whatsapp.com/..." value="${esc(p.whatsapp_url || "")}"></label>
        <label>Turnaround time<input class="lock-input" id="e-turn" type="time" value="${esc(h.turnaround_time || "")}"></label>
        <label>Kit list (one per line)<textarea class="lock-input hike-text" id="e-kit" rows="6">${esc((h.kit || []).join("\n"))}</textarea></label>
        <label>Message to everyone approved or waiting (optional — they get an email if you change the time, place or add a message)<input class="lock-input" id="e-msg" maxlength="250" placeholder="e.g. Moved to 08:30 to beat the rain"></label>
        <div class="share-row"><button class="btn" data-action="save-edit">Save changes</button></div></div></details>
        <details class="plan-card" id="hike-cancel"><summary class="hike-sub">Cancel this hike</summary>
        <div class="hike-form"><label>Reason (shown to everyone)<input class="lock-input" id="c-reason" maxlength="250" placeholder="e.g. Red weather warning for the tops"></label>
        <div class="share-row"><button class="btn" data-action="cancel">Cancel hike and tell everyone</button></div></div></details>`;
    }
    return html;
  }

  // ---------- events ----------
  async function reload(){ await showHike(); }

  async function onClick(e){
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const a = btn.dataset.action, uid = btn.dataset.uid;
    if (a === "open-cancel") { const d = $("hike-cancel"); if (d) { d.open = true; d.scrollIntoView({ block: "center" }); } return; }
    if (a === "open-report") { $("hike-report").innerHTML = `<div class="plan-card hike-form"><label>What's wrong with this hike?<textarea class="lock-input hike-text" id="rep-reason" rows="3" maxlength="500"></textarea></label><div class="share-row"><button class="btn" data-action="send-report">Send report</button></div></div>`; return; }
    if (a === "copy") { try { await navigator.clipboard.writeText(hikeLink(token)); flash("Link copied."); } catch (er) { flash("Couldn't copy — select the link and copy it by hand.", true); } return; }
    if (a === "story-invite") {
      try { await navigator.clipboard.writeText(hikeLink(token)); } catch (er) { /* link is also on the page */ }
      return WWStory.run(btn, async () => {
        const w = hike.walk || {}, d = new Date(hike.start_at);
        return WWStory.inviteCard({
          title: hike.title, host: hike.host_name, area: hike.area, spaces: hike.spaces, left: Math.max(0, hike.spaces - hike.approved_count),
          dateLabel: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).toUpperCase(),
          start: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          fells: w.fells || [], miles: w.miles || null, ascent: w.ascent || null
        });
      }, "wainwrights-hike-invite.jpg", hike.title);
    }
    if (a === "story") {
      return WWStory.run(btn, async () => {
        const people = await rpc("hike_story_people", { p_hike_id: hike.id });
        const w = hike.walk || {}, d = new Date(hike.start_at);
        return WWStory.hikeCard({
          title: hike.title, past: hike.status === "completed" || d < new Date(),
          dateLabel: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).toUpperCase(),
          fells: w.fells || [], miles: w.miles || null, ascent: w.ascent || null,
          people: (people || []).map(p => ({ name: p.display_name, handle: p.instagram_handle }))
        });
      }, "wainwrights-hike.jpg", hike.title);
    }
    if (a === "ics") { downloadHikeIcs(hike); flash("Calendar entry downloaded. Open it to add it to your calendar."); return; }
    if (a === "share") { try { await navigator.share({ title: hike.title, text: "Join me on a hike: " + hike.title + " — " + fmtWhen(hike.start_at) + " · " + hike.area, url: hikeLink(token) }); } catch (er) {} return; }
    if (a === "unblock") return guard(btn, async () => { await rpc("unblock_hiker", { p_user_id: uid }); await showList(); });
    if (a === "send-report") return guard(btn, async () => { await rpc("report_hike", { p_token: token, p_reason: $("rep-reason").value }); $("hike-report").innerHTML = ""; flash("Thanks — your report has been sent."); });

    if (a === "approve" || a === "decline") return guard(btn, async () => { await rpc("decide_hike_request", { p_hike_id: hike.id, p_user_id: uid, p_approve: a === "approve" }); await notify(hike.id); await reload(); });
    if (a === "remove" || a === "remove-block") {
      if (!confirm(a === "remove-block" ? "Remove this person and block them from your future hikes?" : "Remove this person from the hike?")) return;
      return guard(btn, async () => { await rpc("remove_hike_attendee", { p_hike_id: hike.id, p_user_id: uid, p_block: a === "remove-block" }); await notify(hike.id); await reload(); });
    }
    if (a === "withdraw") {
      if (!confirm("Pull out of this hike?")) return;
      return guard(btn, async () => { await rpc("withdraw_hike_place", { p_hike_id: hike.id }); await notify(hike.id); await reload(); });
    }
    if (a === "undo") {
      if (!confirm("Remove the fell ticks this hike added to your tracker?")) return;
      return guard(btn, async () => { await rpc("undo_hike_ticks", { p_hike_id: hike.id }); await notify(hike.id); await reload(); flash("Done — those ticks have been removed."); });
    }
    if (a === "cancel") {
      if (!confirm("Cancel this hike and email everyone?")) return;
      return guard(btn, async () => { await rpc("cancel_hike", { p_hike_id: hike.id, p_reason: $("c-reason").value }); await notify(hike.id); await reload(); });
    }
    if (a === "save-edit") return guard(btn, async () => {
      let lat = hike.private.meet_lat, lng = hike.private.meet_lng;
      const pt = parsePoint($("e-point").value);
      if (pt === "bad") { flash("Couldn't read that meeting point. Use a Google Maps link or \"lat, lng\".", true); return; }
      if (pt) { lat = pt.lat; lng = pt.lng; }
      const wa = $("e-wa").value.trim();
      if (!waOk(wa)) { flash(ERRORS.bad_whatsapp, true); return; }
      const kit = $("e-kit").value.split("\n").map(s => s.trim()).filter(Boolean);
      if (!$("e-when").value) throw new Error("bad_start");
      await rpc("edit_hike", {
        p_hike_id: hike.id, p_start_at: new Date($("e-when").value).toISOString(), p_spaces: Number($("e-spaces").value),
        p_meet_lat: lat, p_meet_lng: lng, p_meet_note: $("e-note").value, p_contact: $("e-contact").value,
        p_kit: kit, p_turnaround: $("e-turn").value || null, p_note: $("e-msg").value
      });
      if (wa !== (hike.private.whatsapp_url || "")) await rpc("set_hike_whatsapp", { p_hike_id: hike.id, p_url: wa });
      await notify(hike.id); await reload(); flash("Saved.");
    });
    if (a === "complete") return guard(btn, async () => {
      const ids = Array.from(document.querySelectorAll(".tick-who:checked")).map(x => x.value);
      if (!$("tick-confirm").checked) { flash(ERRORS.confirmation_required, true); return; }
      const r = await rpc("complete_hike", { p_hike_id: hike.id, p_attendee_ids: ids, p_confirmed: true });
      await notify(hike.id); await reload();
      flash(`Done — ${r.ticked} new tick${r.ticked === 1 ? "" : "s"} across ${r.people} ${r.people === 1 ? "person" : "people"}.`);
    });
  }

  function onSubmit(e){
    if (e.target.id === "hike-request") {
      e.preventDefault();
      guard($("r-submit"), async () => {
        const ig = igClean($("r-ig").value);
        if (ig && !IG_RE.test(ig)) { flash(ERRORS.bad_instagram, true); return; }
        await rpc("request_hike_place", { p_token: token, p_message: $("r-msg").value, p_ack: $("r-ack").checked, p_instagram: ig || null });
        await notify(hike.id); await reload();
      });
    }
  }

  // ---------- startup ----------
  WW.onAuthReady(async (u) => {
    user = u;
    root.addEventListener("click", onClick);
    root.addEventListener("submit", onSubmit);
    try {
      if (!token && !wantsNew && params.get("list") !== "1") {
        try {
          const p = JSON.parse(sessionStorage.getItem(PENDING) || "null");
          if (p && p.t && Date.now() - p.at < 15 * 60 * 1000) { token = p.t; history.replaceState(null, "", "hike.html?t=" + encodeURIComponent(token)); }
        } catch (er) {}
      }
      if (wantsNew) await showNewForm();
      else if (token) await showHike();
      else await showList();
    } catch (e) {
      console.error(e);
      root.innerHTML = `<p class="lock-error">${esc(errMsg(e))}</p>`;
    }
  });
})();
