// Admin page. Everything here is a request to the database's admin_* functions, each of which
// checks that the signed-in person is an admin and records what it did in the audit log. This page
// only shows the controls; it cannot do anything the database would refuse.
(function(){
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = WW.escapeHtml;
  const root = $("admin-root");
  const TABS = [["hikes", "Hikes"], ["people", "People"], ["teams", "Teams"], ["reports", "Reports"], ["words", "Word filter"], ["log", "Log"]];
  let tab = "hikes", showDismissed = false, peopleFilter = "", overview = null, cache = {};

  const IG_RE = /^[a-z0-9._]{1,30}$/;
  const igLink = h => (h && IG_RE.test(h))
    ? `<a class="hike-ig" href="https://www.instagram.com/${encodeURIComponent(h)}/" target="_blank" rel="noopener noreferrer">@${esc(h)} ↗</a>` : "";
  const fmt = iso => iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const hikeHref = t => "hike.html?t=" + encodeURIComponent(t);
  const ERR = {
    not_admin: "You're not an admin.", not_found: "That no longer exists.", already_cancelled: "That hike is already cancelled.",
    cannot_suspend_admin: "You can't suspend an admin.", bad_word: "Use letters only, 2 to 40 long.", bad_mode: "Pick how the word should match."
  };
  // Admin mode: changes only work after switching it on here, and it switches itself off after 15 minutes
  // without a change. This is a guard against slips, not security: the database checks admin rights itself.
  const MODE_KEY = "ww_admin_mode_until", MODE_MS = 15 * 60 * 1000;
  const modeOn = () => { try { return Number(localStorage.getItem(MODE_KEY)) > Date.now(); } catch (e) { return false; } };
  function setMode(on){
    try { if (on) localStorage.setItem(MODE_KEY, String(Date.now() + MODE_MS)); else localStorage.removeItem(MODE_KEY); } catch (e) {}
    clearTimeout(setMode.t);
    if (on) setMode.t = setTimeout(() => { if (!modeOn()) paintMode(); }, MODE_MS + 500);
    if (window.wwAdminLink) window.wwAdminLink();
  }
  const NEED_MODE = "Admin mode is off. Switch it on at the top of the page to make changes.";
  function paintMode(){
    const on = modeOn(), box = $("admin-mode");
    root.classList.toggle("admin-locked", !on);
    if (!box) return;
    box.className = "hike-note-box " + (on ? "is-bad" : "is-good");
    box.innerHTML = on
      ? `<strong>Admin mode is ON.</strong> Changes are live. It switches itself off after 15 minutes without a change. <button type="button" class="btn" data-act="mode" data-on="0">Switch off</button>`
      : `<strong>Admin mode is off.</strong> You can look around but not change anything. <button type="button" class="btn" data-act="mode" data-on="1">Switch on</button>`;
  }
  const msg = e => ERR[(e && e.message) || ""] || (e && e.message) || "Something went wrong.";

  async function rpc(name, args){
    const { data, error } = await WW.sb.rpc(name, args || {});
    if (error) throw error;
    if (modeOn() && /^admin_(remove|clear|delete|set|dismiss)/.test(name)) setMode(true);
    return data;
  }
  function flash(text, bad){
    const el = $("admin-msg");
    if (!el) return;
    el.className = "hike-note-box " + (bad ? "is-bad" : "is-good");
    el.textContent = text;
    el.style.display = "block";
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { el.style.display = "none"; }, bad ? 9000 : 4500);
    el.scrollIntoView({ block: "nearest" });
  }
  async function guard(btn, fn){
    if (btn) btn.disabled = true;
    try { await fn(); } catch (e) { console.error(e); flash(msg(e), true); }
    finally { if (btn) btn.disabled = false; }
  }

  // ---------- views ----------
  function shell(inner){
    const o = overview;
    const counts = o ? `<p class="chart-note">${o.users} people · ${o.leaderboard_entries} on the leaderboard · ${o.teams} teams · ${o.hikes_total} hikes (${o.hikes_open} open) · <strong>${o.open_reports} open report${o.open_reports === 1 ? "" : "s"}</strong> · ${o.suspended} suspended</p>` : "";
    return `<div id="admin-mode"></div><div id="admin-msg" style="display:none;"></div>${counts}
      <div class="admin-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" class="btn admin-tab${k === tab ? " is-active" : ""}" data-act="tab" data-tab="${k}">${l}${k === "reports" && o && o.open_reports ? " (" + o.open_reports + ")" : ""}</button>`).join("")}</div>
      <div id="admin-body">${inner}</div>`;
  }
  const badge = (text, cls) => `<span class="plan-verdict ${cls}">${esc(text)}</span>`;

  function hikesHtml(list){
    if (!list.length) return '<p class="chart-note">No hikes yet.</p>';
    return list.map(h => `<div class="plan-card admin-item">
      <div class="admin-head"><strong>${esc(h.title)}</strong> ${badge(h.status, h.status === "open" ? "is-good" : "is-bad")}${h.open_reports ? " " + badge(h.open_reports + " report" + (h.open_reports === 1 ? "" : "s"), "is-fair") : ""}</div>
      <p class="plan-meta">${esc(fmt(h.start_at))} · ${esc(h.area)} · host <strong>${esc(h.host_name)}</strong> (${esc(h.host_email || "no email")}) · ${h.approved} going, ${h.requested} waiting${h.team ? " · team " + esc(h.team) : ""}</p>
      ${h.status_note ? `<p class="chart-note">Note: ${esc(h.status_note)}</p>` : ""}
      <div class="hike-actions">
        <a class="btn hike-small" href="${hikeHref(h.share_token)}">Open</a>
        <button type="button" class="btn hike-small" data-act="hike-people" data-id="${esc(h.id)}">People</button>
        ${h.status !== "cancelled" ? `<button type="button" class="btn hike-small" data-act="cancel-hike" data-id="${esc(h.id)}" data-title="${esc(h.title)}">Cancel…</button>` : ""}
        <button type="button" class="btn hike-small" data-act="delete-hike" data-id="${esc(h.id)}" data-title="${esc(h.title)}">Delete…</button>
        <button type="button" class="btn hike-small" data-act="suspend" data-id="${esc(h.host_id)}" data-name="${esc(h.host_name)}">Suspend host…</button>
      </div>
      <div class="admin-people" id="people-${esc(h.id)}"></div></div>`).join("");
  }
  function peopleOfHikeHtml(hikeId, list){
    if (!list.length) return '<p class="chart-note">Nobody has asked to join.</p>';
    return list.map(p => `<div class="hike-person"><div><strong>${esc(p.name)}</strong> ${badge(p.status, p.status === "approved" ? "is-good" : p.status === "requested" ? "is-fair" : "is-bad")}${p.suspended ? " " + badge("suspended", "is-bad") : ""}
        <div class="hike-ig-line">${esc(p.email || "")} ${igLink(p.instagram_handle)}</div>${p.message ? `<div class="hike-msg">${esc(p.message)}</div>` : ""}</div>
        <div class="hike-person-actions">${p.status !== "removed" ? `<button type="button" class="btn hike-small" data-act="remove-person" data-hike="${esc(hikeId)}" data-id="${esc(p.user_id)}" data-name="${esc(p.name)}">Remove</button>` : ""}
        <button type="button" class="btn hike-small" data-act="suspend" data-id="${esc(p.user_id)}" data-name="${esc(p.name)}">Suspend…</button></div></div>`).join("");
  }
  function peopleHtml(list){
    const f = peopleFilter.trim().toLowerCase();
    const rows = f ? list.filter(p => [p.name, p.email, p.instagram_handle].some(v => String(v || "").toLowerCase().includes(f))) : list;
    return `<input class="lock-input" id="people-filter" type="search" placeholder="Search name, email or Instagram" value="${esc(peopleFilter)}">
      <p class="chart-note">${rows.length} of ${list.length} people</p>` + (rows.length ? rows.map(p => `<div class="plan-card admin-item">
      <div class="admin-head"><strong>${esc(p.name || "(no name)")}</strong> ${p.on_leaderboard ? badge("leaderboard", "is-good") : ""}${p.suspended ? " " + badge("suspended", "is-bad") : ""}${p.is_admin ? " " + badge("admin", "is-fair") : ""}</div>
      <p class="plan-meta">${esc(p.email || "no email")} ${igLink(p.instagram_handle)}</p>
      <p class="chart-note">Joined ${esc(fmt(p.created_at))} · last sign-in ${esc(fmt(p.last_sign_in_at))} · ${p.fells} fells · ${p.hikes_hosted} hike${p.hikes_hosted === 1 ? "" : "s"} hosted${p.suspended && p.suspended_reason ? " · suspended: " + esc(p.suspended_reason) : ""}</p>
      <div class="hike-actions">
        <button type="button" class="btn hike-small" data-act="clear-name" data-id="${esc(p.user_id)}" data-name="${esc(p.name || "")}">Clear name</button>
        <button type="button" class="btn hike-small" data-act="clear-handle" data-id="${esc(p.user_id)}" data-name="${esc(p.name || "")}">Clear Instagram</button>
        ${p.on_leaderboard ? `<button type="button" class="btn hike-small" data-act="remove-board" data-id="${esc(p.user_id)}" data-name="${esc(p.name || "")}">Remove from leaderboard…</button>` : ""}
        ${p.is_admin ? "" : p.suspended ? `<button type="button" class="btn hike-small" data-act="unsuspend" data-id="${esc(p.user_id)}" data-name="${esc(p.name || "")}">Unsuspend</button>` : `<button type="button" class="btn hike-small" data-act="suspend" data-id="${esc(p.user_id)}" data-name="${esc(p.name || "")}">Suspend…</button>`}
      </div></div>`).join("") : '<p class="chart-note">Nobody matches.</p>');
  }
  function teamsHtml(list){
    if (!list.length) return '<p class="chart-note">No teams.</p>';
    return list.map(t => `<div class="plan-card admin-item">
      <div class="admin-head"><strong>${esc(t.name)}</strong> ${badge(t.is_public ? "public" : "private", t.is_public ? "is-good" : "is-fair")}</div>
      <p class="plan-meta">Created by ${esc(t.admin_name)} · ${t.members} member${t.members === 1 ? "" : "s"} · ${esc(fmt(t.created_at))}</p>
      <div class="hike-actions"><button type="button" class="btn hike-small" data-act="delete-team" data-id="${esc(t.id)}" data-name="${esc(t.name)}">Delete team…</button>
      <button type="button" class="btn hike-small" data-act="suspend" data-id="${esc(t.admin_id)}" data-name="${esc(t.admin_name)}">Suspend creator…</button></div></div>`).join("");
  }
  function reportsHtml(list){
    const toggle = `<p><label class="plan-check"><input type="checkbox" id="show-dismissed"${showDismissed ? " checked" : ""}> Show dismissed reports</label></p>`;
    if (!list.length) return toggle + '<p class="chart-note">No reports.</p>';
    return toggle + list.map(r => `<div class="plan-card admin-item">
      <div class="admin-head"><strong>${esc(r.hike_title)}</strong> ${badge(r.hike_status, r.hike_status === "open" ? "is-good" : "is-bad")}${r.dismissed_at ? " " + badge("dismissed", "is-fair") : ""}</div>
      <p class="hike-msg">${esc(r.reason)}</p>
      <p class="chart-note">Reported ${esc(fmt(r.created_at))} by ${esc(r.reporter_name)} (${esc(r.reporter_email || "no email")}) · host ${esc(r.host_name)}</p>
      <div class="hike-actions"><a class="btn hike-small" href="${hikeHref(r.share_token)}">Open hike</a>
        ${r.hike_status !== "cancelled" ? `<button type="button" class="btn hike-small" data-act="cancel-hike" data-id="${esc(r.hike_id)}" data-title="${esc(r.hike_title)}">Cancel hike…</button>` : ""}
        <button type="button" class="btn hike-small" data-act="suspend" data-id="${esc(r.host_id)}" data-name="${esc(r.host_name)}">Suspend host…</button>
        ${r.dismissed_at ? "" : `<button type="button" class="btn hike-small" data-act="dismiss-report" data-id="${esc(r.id)}">Dismiss</button>`}</div></div>`).join("");
  }
  function wordsHtml(w){
    const chip = (word, mode, kind) => `<span class="chal-chip admin-chip" title="${kind === "blocked" ? (mode === "substring" ? "blocked anywhere inside a word" : "blocked as a whole word") : "always allowed"}">${esc(word)}${kind === "blocked" && mode === "substring" ? " *" : ""} <button type="button" class="admin-chip-x" data-act="remove-${kind}" data-word="${esc(word)}" aria-label="Remove ${esc(word)}">×</button></span>`;
    return `<p class="chart-note">Applies to display names, Instagram handles, team names, and hike titles, areas, notes and messages. Spellings like "f.u.c.k", "fuuuck" and "sh1t" are caught. <strong>Whole word</strong> blocks only that exact word (so "Arsenal" is fine); <strong>anywhere</strong> (marked *) also blocks it inside longer words and across separators, for the strongest words only. The allowed list is for real names and places that contain a blocked word.</p>
      <div class="plan-card"><h3 class="hike-sub">Blocked (${w.blocked.length})</h3>
        <div class="chal-fell-list">${w.blocked.map(b => chip(b.word, b.mode, "blocked")).join("")}</div>
        <form id="add-blocked" class="admin-form"><input class="lock-input" id="bw-word" placeholder="word" maxlength="40" autocapitalize="none" autocomplete="off" required>
          <select class="lock-input" id="bw-mode"><option value="word">whole word</option><option value="substring">anywhere</option></select>
          <button class="btn hike-small" type="submit">Block</button></form></div>
      <div class="plan-card"><h3 class="hike-sub">Allowed (${w.allowed.length})</h3>
        <div class="chal-fell-list">${w.allowed.map(a => chip(a, "", "allowed")).join("")}</div>
        <form id="add-allowed" class="admin-form"><input class="lock-input" id="aw-word" placeholder="word, e.g. a place name" maxlength="40" autocapitalize="none" autocomplete="off" required>
          <button class="btn hike-small" type="submit">Allow</button></form></div>`;
  }
  function logHtml(list){
    if (!list.length) return '<p class="chart-note">Nothing has been done yet.</p>';
    return list.map(g => `<div class="plan-card admin-item"><div class="admin-head"><strong>${esc(g.action.replace(/_/g, " "))}</strong> <span class="chart-note">${esc(fmt(g.at))} · ${esc(g.admin || "?")}</span></div>
      <p class="chart-note">${esc(g.target_type || "")} ${esc(g.target_id || "")}</p>
      ${g.details ? `<p class="admin-log-details">${esc(JSON.stringify(g.details).slice(0, 400))}</p>` : ""}</div>`).join("");
  }

  async function loadTab(){
    const body = $("admin-body");
    if (body) body.innerHTML = '<p class="chart-note">Loading…</p>';
    try {
      let inner = "";
      if (tab === "hikes") { cache.hikes = await rpc("admin_list_hikes"); inner = hikesHtml(cache.hikes); }
      else if (tab === "people") { cache.people = await rpc("admin_list_people"); inner = peopleHtml(cache.people); }
      else if (tab === "teams") { inner = teamsHtml(await rpc("admin_list_teams")); }
      else if (tab === "reports") { inner = reportsHtml(await rpc("admin_list_reports", { p_include_dismissed: showDismissed })); }
      else if (tab === "words") { inner = wordsHtml(await rpc("admin_word_lists")); }
      else if (tab === "log") { inner = logHtml(await rpc("admin_log_list", { p_limit: 150 })); }
      if ($("admin-body")) $("admin-body").innerHTML = inner;
    } catch (e) { console.error(e); if ($("admin-body")) $("admin-body").innerHTML = `<p class="lock-error">${esc(msg(e))}</p>`; }
  }
  async function refresh(){
    try { overview = await rpc("admin_overview"); } catch (e) { /* keep old counts */ }
    const keep = $("admin-msg") ? { text: $("admin-msg").textContent, cls: $("admin-msg").className, show: $("admin-msg").style.display } : null;
    root.innerHTML = shell("");
    if (keep && keep.show !== "none") { const m = $("admin-msg"); m.textContent = keep.text; m.className = keep.cls; m.style.display = "block"; }
    paintMode();
    await loadTab();
  }

  // ---------- actions ----------
  const ask = (text, def) => { const r = window.prompt(text, def || ""); return r === null ? null : r.trim(); };
  async function onClick(e){
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const a = btn.dataset.act, id = btn.dataset.id, name = btn.dataset.name || "this person";
    if (a === "tab") { tab = btn.dataset.tab; await refresh(); return; }
    if (a === "mode") { setMode(btn.dataset.on === "1"); paintMode(); return; }
    if (a === "hike-people") {
      const box = $("people-" + id);
      if (!box) return;
      if (box.dataset.open === "1") { box.innerHTML = ""; box.dataset.open = ""; return; }
      return guard(btn, async () => { box.innerHTML = peopleOfHikeHtml(id, await rpc("admin_hike_people", { p_hike_id: id })); box.dataset.open = "1"; });
    }
    // everything below changes something
    if (!modeOn()) { flash(NEED_MODE, true); return; }
    if (a === "cancel-hike") {
      const reason = ask(`Cancel "${btn.dataset.title}"? Everyone going is told. The reason is shown on the hike:`, "Removed by an admin.");
      if (reason === null) return;
      return guard(btn, async () => { await rpc("admin_remove_hike", { p_hike_id: id, p_reason: reason, p_delete: false }); flash("Hike cancelled."); await refresh(); });
    }
    if (a === "delete-hike") {
      if (!window.confirm(`PERMANENTLY delete "${btn.dataset.title}" and everyone's requests for it? This can't be undone. (The admin log keeps a record.)`)) return;
      const reason = ask("Reason (kept in the log):", "");
      if (reason === null) return;
      return guard(btn, async () => { await rpc("admin_remove_hike", { p_hike_id: id, p_reason: reason, p_delete: true }); flash("Hike deleted."); await refresh(); });
    }
    if (a === "remove-person") {
      if (!window.confirm(`Remove ${name} from this hike? They'll be told and can't ask again.`)) return;
      return guard(btn, async () => { await rpc("admin_remove_attendee", { p_hike_id: btn.dataset.hike, p_user_id: id, p_reason: null }); flash(name + " removed."); await refresh(); });
    }
    if (a === "clear-name" || a === "clear-handle") {
      const what = a === "clear-name" ? "name (set to \"Walker\")" : "Instagram handle";
      if (!window.confirm(`Clear ${name || "this person"}'s ${what} everywhere it appears?`)) return;
      return guard(btn, async () => { await rpc("admin_clear_person", { p_user_id: id, p_clear_name: a === "clear-name", p_clear_handle: a === "clear-handle", p_remove_from_leaderboard: false }); flash("Cleared."); await refresh(); });
    }
    if (a === "remove-board") {
      if (!window.confirm(`Remove ${name || "this person"} from the leaderboard?`)) return;
      return guard(btn, async () => { await rpc("admin_clear_person", { p_user_id: id, p_clear_name: false, p_clear_handle: false, p_remove_from_leaderboard: true }); flash("Removed from the leaderboard."); await refresh(); });
    }
    if (a === "suspend") {
      const reason = ask(`Suspend ${name}? They'll be hidden from the leaderboard and can't create hikes, ask to join hikes or create teams. Reason (kept in the log):`, "");
      if (reason === null) return;
      return guard(btn, async () => { await rpc("admin_set_suspended", { p_user_id: id, p_suspended: true, p_reason: reason }); flash(name + " suspended."); await refresh(); });
    }
    if (a === "unsuspend") {
      return guard(btn, async () => { await rpc("admin_set_suspended", { p_user_id: id, p_suspended: false, p_reason: null }); flash(name + " unsuspended."); await refresh(); });
    }
    if (a === "delete-team") {
      if (!window.confirm(`Delete the team "${name}" and its memberships? This can't be undone.`)) return;
      return guard(btn, async () => { await rpc("admin_delete_team", { p_team_id: id }); flash("Team deleted."); await refresh(); });
    }
    if (a === "dismiss-report") {
      return guard(btn, async () => { await rpc("admin_dismiss_report", { p_report_id: id }); flash("Report dismissed."); await refresh(); });
    }
    if (a === "remove-blocked") {
      if (!window.confirm(`Stop blocking "${btn.dataset.word}"?`)) return;
      return guard(btn, async () => { await rpc("admin_set_blocked_word", { p_word: btn.dataset.word, p_mode: null, p_remove: true }); flash("Removed from the blocked list."); await loadTab(); });
    }
    if (a === "remove-allowed") {
      return guard(btn, async () => { await rpc("admin_set_allowed_word", { p_word: btn.dataset.word, p_remove: true }); flash("Removed from the allowed list."); await loadTab(); });
    }
  }
  async function onSubmit(e){
    if ((e.target.id === "add-blocked" || e.target.id === "add-allowed") && !modeOn()) { e.preventDefault(); flash(NEED_MODE, true); return; }
    if (e.target.id === "add-blocked") {
      e.preventDefault();
      return guard(e.target.querySelector("button"), async () => { await rpc("admin_set_blocked_word", { p_word: $("bw-word").value, p_mode: $("bw-mode").value, p_remove: false }); flash("Word blocked."); await loadTab(); });
    }
    if (e.target.id === "add-allowed") {
      e.preventDefault();
      return guard(e.target.querySelector("button"), async () => { await rpc("admin_set_allowed_word", { p_word: $("aw-word").value, p_remove: false }); flash("Word allowed."); await loadTab(); });
    }
  }
  function onInput(e){
    if (e.target.id === "people-filter") { peopleFilter = e.target.value; const cur = e.target.selectionStart; $("admin-body").innerHTML = peopleHtml(cache.people || []); const i = $("people-filter"); i.focus(); try { i.setSelectionRange(cur, cur); } catch (er) {} }
  }
  function onChange(e){
    if (e.target.id === "show-dismissed") { showDismissed = e.target.checked; loadTab(); }
  }

  WW.onAuthReady(async () => {
    try {
      const yes = await rpc("am_i_admin");
      if (!yes) {
        try { localStorage.removeItem("ww_admin"); } catch (er) {}
        root.innerHTML = '<p class="chart-note">This page is for admins.</p>';
        return;
      }
      try { localStorage.setItem("ww_admin", "1"); } catch (er) {}
      if (window.wwAdminLink) window.wwAdminLink();
      root.addEventListener("click", onClick);
      root.addEventListener("submit", onSubmit);
      root.addEventListener("input", onInput);
      root.addEventListener("change", onChange);
      await refresh();
    } catch (e) {
      console.error(e);
      root.innerHTML = `<p class="lock-error">${esc(msg(e))}</p>`;
    }
  });
})();
