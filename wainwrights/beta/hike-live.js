(function(){
  "use strict";

  // Live hike map: on the day of a hosted hike, the host and approved walkers
  // can each opt in to share where they are and see everyone else who has.
  //
  // Backend: supabase/migrations/20261106100000_wainwrights_hike_live_positions.sql
  // (share_hike_position / stop_sharing_hike_position / get_hike_positions).
  // The database decides who may read: only the host and approved walkers of
  // this hike, only people who opted in, only their latest point, nothing
  // after the hike is cancelled or completed.
  //
  // A web page can only read GPS while it is open and the screen is on, so this
  // is not background tracking, and the card says so. Sharing resumes on
  // reopening the page (the opt-in is remembered per hike for 24 h) and stops
  // on "Stop sharing", on leaving the hike, or when the hike ends.

  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const HOUR = 3600 * 1000;
  const OPENS_BEFORE_MS = 3 * HOUR, CLOSES_AFTER_MS = 18 * HOUR;
  const POLL_MS = 20 * 1000, SEND_EVERY_MS = 15 * 1000, SEND_MIN_MOVE_M = 25;
  const STALE_MS = 10 * 60 * 1000, REMEMBER_MS = 24 * HOUR;

  const S = {
    hike: null, el: null,
    sharing: false, watchId: null, last: null,   // last = { t, lat, lng } of the last send
    poll: null, map: null, layer: null, fitted: false, positions: [], stateMsg: "", stateBad: false
  };
  const $q = sel => S.el && S.el.querySelector(sel);
  const rememberKey = () => "ww_live_" + S.hike.id;

  function setState(msg, bad){
    S.stateMsg = msg || ""; S.stateBad = !!bad;
    const el = $q("#live-state");
    if (el) { el.textContent = S.stateMsg; el.className = "live-state" + (S.sharing && !bad ? " is-on" : "") + (bad ? " is-bad" : ""); }
  }
  function errCode(e){ const m = String((e && (e.message || e.code)) || ""); const hit = m.match(/not_signed_in|not_attendee|not_live|not_found|bad_position/); return hit ? hit[0] : ""; }
  const ago = iso => {
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return s < 90 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : Math.round(s / 3600) + " h ago";
  };

  // ---------------------------------------------------------------- window / eligibility

  function windowState(h){
    const start = new Date(h.start_at).getTime(), now = Date.now();
    if (now < start - OPENS_BEFORE_MS) return "early";
    if (now > start + CLOSES_AFTER_MS) return "over";
    return "live";
  }

  // ---------------------------------------------------------------- sharing

  function distM(a, b){ return window.OSMap ? OSMap.distanceM(a.lat, a.lng, b.lat, b.lng) : 999; }

  async function send(pos){
    const c = pos.coords, now = Date.now();
    const here = { lat: c.latitude, lng: c.longitude };
    if (S.last && now - S.last.t < SEND_EVERY_MS && distM(S.last, here) < SEND_MIN_MOVE_M) return;
    S.last = { t: now, lat: here.lat, lng: here.lng };
    const { error } = await WW.sb.rpc("share_hike_position", {
      p_hike_id: S.hike.id, p_lat: here.lat, p_lng: here.lng, p_accuracy: Math.round(c.accuracy || 0)
    });
    if (error) {
      const code = errCode(error);
      if (code === "not_live" || code === "not_attendee") { await stopSharing(true); setState(code === "not_live" ? "Sharing has stopped: this hike isn't live any more." : "Sharing has stopped: you're not on this hike.", true); }
      else { S.last = null; setState("Couldn't send your position, will keep trying.", true); }
      return;
    }
    setState("Sharing your location · last sent " + new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    refresh();
  }

  function geoError(err){
    if (err && err.code === 1) { stopSharing(true); setState("Location permission was denied. Allow it for this site in your browser settings to share.", true); }
    else setState("Waiting for a GPS fix…", false);
  }

  function startSharing(){
    if (!navigator.geolocation) { setState("This browser can't share its location.", true); return; }
    if (window.isSecureContext === false) { setState("Location only works on a secure (https) page.", true); return; }
    if (S.watchId != null) return;
    S.sharing = true; S.last = null;
    try { localStorage.setItem(rememberKey(), String(Date.now())); } catch (e) {}
    S.watchId = navigator.geolocation.watchPosition(send, geoError, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    setState("Sharing your location · waiting for a GPS fix…");
    paintButtons();
  }

  async function stopSharing(quiet){
    if (S.watchId != null) navigator.geolocation.clearWatch(S.watchId);
    S.watchId = null; S.sharing = false; S.last = null;
    try { localStorage.removeItem(rememberKey()); } catch (e) {}
    if (!quiet) setState("");
    paintButtons();
    try { await WW.sb.rpc("stop_sharing_hike_position", { p_hike_id: S.hike.id }); } catch (e) { /* positions expire on their own */ }
    if (!quiet) refresh();
  }

  function paintButtons(){
    const b = $q('[data-live="share"]');
    if (b) b.textContent = S.sharing ? "Stop sharing" : "Share my location";
  }

  // ---------------------------------------------------------------- reading everyone's positions

  async function refresh(){
    if (!S.hike) return;
    const { data, error } = await WW.sb.rpc("get_hike_positions", { p_hike_id: S.hike.id });
    if (error || !Array.isArray(data)) return;
    S.positions = data;
    paintList();
    paintMap();
  }

  function paintList(){
    const ul = $q("#live-list");
    if (!ul) return;
    if (!S.positions.length) { ul.innerHTML = '<li><span>Nobody is sharing yet.</span></li>'; return; }
    ul.innerHTML = S.positions.map(p => {
      const stale = Date.now() - new Date(p.updated_at).getTime() > STALE_MS;
      const gr = window.OSMap ? OSMap.gridRef(Number(p.lat), Number(p.lng), 8) : "";
      return '<li class="' + (stale ? "is-stale" : "") + '"><span><strong>' + esc(p.name) + (p.is_me ? " (you)" : "") + "</strong>" +
        (p.is_host ? " · host" : "") + (gr ? " · " + esc(gr) : "") + '</span><span class="live-when">' + esc(ago(p.updated_at)) + (stale ? " · old" : "") + "</span></li>";
    }).join("");
  }

  async function showMap(){
    const holder = $q("#live-map");
    if (!holder) return;
    if (S.map) { holder.style.display = ""; S.map.invalidateSize(); return; }
    holder.style.display = "";
    const map = window.OSMap ? await OSMap.createMap(holder) : null;
    if (!map) {
      holder.style.display = "none";
      setState("The map isn't available right now. The list below still works.", true);
      return;
    }
    S.map = map; S.layer = L.layerGroup().addTo(map); S.fitted = false;
    map.setView([54.45, -3.05], 10);
    paintMap();
  }

  function pin(colour, label, ring){
    const dot = L.divIcon({ className: "", html: '<div class="live-dot" style="background:' + colour + (ring ? ";border-radius:3px" : "") + '"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
    const m = L.marker(label.at, { icon: dot, keyboard: false });
    const t = document.createElement("span"); t.className = "live-pin"; t.textContent = label.text;   // text node: names are never parsed as HTML
    m.bindTooltip(t, { permanent: true, direction: "top", offset: [0, -8] });
    return m;
  }

  function paintMap(){
    if (!S.map || !S.layer) return;
    S.layer.clearLayers();
    const pts = [];
    const priv = S.hike.private;
    if (priv && priv.meet_lat != null && priv.meet_lng != null) {
      const at = [Number(priv.meet_lat), Number(priv.meet_lng)];
      pin("#8a5a2b", { at, text: "Meeting point" }, true).addTo(S.layer); pts.push(at);
    }
    S.positions.forEach(p => {
      const at = [Number(p.lat), Number(p.lng)];
      const stale = Date.now() - new Date(p.updated_at).getTime() > STALE_MS;
      const colour = p.is_me ? "#d8a31a" : p.is_host ? "#24392a" : "#2f6f8f";
      const m = pin(colour, { at, text: p.name + (p.is_me ? " (you)" : "") + " · " + ago(p.updated_at) });
      if (stale) m.setOpacity(0.5);
      m.addTo(S.layer); pts.push(at);
    });
    if (pts.length && !S.fitted) {
      S.fitted = true;
      if (pts.length === 1) S.map.setView(pts[0], 14); else S.map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    }
  }

  // ---------------------------------------------------------------- mount / unmount

  function onClick(e){
    const b = e.target.closest("[data-live]");
    if (!b) return;
    const a = b.dataset.live;
    if (a === "share") { if (S.sharing) stopSharing(false); else startSharing(); }
    else if (a === "map") { b.style.display = "none"; showMap(); }
    else if (a === "where") { if (window.OSMap) OSMap.whereAmI(); }
  }

  function stopPolling(){ if (S.poll) clearInterval(S.poll); S.poll = null; }
  function startPolling(){
    stopPolling();
    S.poll = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, POLL_MS);
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.hike && S.poll) refresh(); });

  function unmount(){
    stopPolling();
    if (S.map) { try { S.map.remove(); } catch (e) {} }
    S.map = null; S.layer = null;
    if (S.el) S.el.removeEventListener("click", onClick);
    S.el = null;
  }

  // Called every time the hike page re-renders (the page replaces its whole DOM).
  function mount(hike, el){
    const sameHike = S.hike && S.hike.id === hike.id;
    unmount();
    if (!el) return;
    S.hike = hike; S.el = el; S.positions = sameHike ? S.positions : [];
    if (!sameHike && S.watchId != null) { navigator.geolocation.clearWatch(S.watchId); S.watchId = null; S.sharing = false; }

    el.innerHTML = "";
    const eligible = hike.status === "open" && (hike.is_host || hike.private);
    if (!eligible) { if (S.sharing) stopSharing(true); return; }
    const w = windowState(hike);
    if (w === "over") { if (S.sharing) stopSharing(true); return; }
    if (w === "early") {
      el.innerHTML = '<article class="chal-card live-card"><h3 class="hike-sub">Live hike map</h3><p class="live-lede">Opens three hours before the start. Everyone on the hike can then choose to share where they are.</p></article>';
      return;
    }

    el.innerHTML =
      '<article class="chal-card live-card">' +
        '<div class="live-head"><h3 class="hike-sub">Live hike map</h3><span class="live-links"><button class="btn" data-live="where" type="button">&#128205; Where am I?</button> <a class="btn" href="emergency.html">Emergency card</a></span></div>' +
        '<p class="live-lede">Optional. Share where you are with the host and the people going, and see who else is sharing. ' +
          'Only this hike\'s host and approved walkers can see it, only your latest position is kept, and it\'s deleted when you stop, leave, or the hike ends. ' +
          'Your phone can only share while this page is open and the screen is on, so it\'s not a safety tracker: don\'t rely on it, and keep your own map, compass and a charged phone.</p>' +
        '<div class="live-actions"><button class="btn" data-live="share" type="button">Share my location</button><button class="btn" data-live="map" type="button">Show map</button></div>' +
        '<p class="live-state" id="live-state" role="status"></p>' +
        '<div id="live-map" class="live-map" style="display:none;"></div>' +
        '<ul class="live-list" id="live-list"></ul>' +
      '</article>';
    el.addEventListener("click", onClick);
    paintButtons();
    setState(S.stateMsg, S.stateBad);
    paintList();
    startPolling();
    refresh();

    // Resume if this person opted in earlier for this hike (within 24 h).
    if (!S.sharing) {
      let when = 0;
      try { when = Number(localStorage.getItem(rememberKey())) || 0; } catch (e) {}
      if (when && Date.now() - when < REMEMBER_MS) startSharing();
    }
  }

  window.HikeLive = { mount, unmount };
})();
