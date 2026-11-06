(function(){
  "use strict";

  // Emergency card: a page for when something has gone wrong on the hill.
  //
  //  - Works with no signal: no sign-in, no server calls. The grid reference, bearings and nearest
  //    summits are all worked out in the page (osmap.js + fells-data.js), and the page itself is
  //    precached by sw.js. GPS does not need a mobile signal.
  //  - Builds the message to read to the 999 operator (or text to a contact): grid reference, how
  //    accurate it is, nearest summit, how many people, and any details the person saved.
  //  - Details (name, phone, medical notes, emergency contact) live in this device's localStorage
  //    only. They are never uploaded anywhere.
  //  - Remembers the last GPS fix (also on-device only) so there is still something to read out if the
  //    GPS drops, clearly labelled as old.
  //
  // It is a help, not a safety system: the page says so, and says to carry a map and compass.

  const FIX_KEY = "ww_last_fix", DETAILS_KEY = "ww_emergency_details";
  const D2R = Math.PI / 180;
  const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const store = {
    get(k){ try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
    set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  let fix = null;                       // { lat, lng, acc, alt, t } from this visit
  const last = store.get(FIX_KEY);      // { lat, lng, acc, t } from earlier, may be null
  const details = Object.assign({ name: "", phone: "", people: "1", medical: "", contactName: "", contactPhone: "" }, store.get(DETAILS_KEY) || {});
  let what = "";                        // "what's happened", deliberately not saved
  let geoError = "";
  let watchId = null, lastSaved = 0;

  // ---------------------------------------------------------------- maths helpers

  const compass = deg => POINTS[Math.round(deg / 22.5) % 16];
  const fmtDist = m => m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(m < 10000 ? 1 : 0) + " km";
  function bearing(a, b){
    const φ1 = a.lat * D2R, φ2 = b.lat * D2R, dλ = (b.lng - a.lng) * D2R;
    return (Math.atan2(Math.sin(dλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)) / D2R + 360) % 360;
  }
  function ago(t){
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 5) return "just now";
    if (s < 90) return s + " seconds ago";
    if (s < 5400) return Math.round(s / 60) + " minutes ago";
    return Math.round(s / 3600) + " hours ago";
  }
  const clock = t => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  // The position we'd read out: this visit's fix if there is one, else the remembered one.
  function current(){
    if (fix) return { p: fix, old: false };
    if (last && last.lat != null) return { p: last, old: true };
    return null;
  }

  function describe(c){
    const p = c.p, en = OSMap.eastingNorthing(p.lat, p.lng), g10 = OSMap.gridRef(p.lat, p.lng, 10);
    const near = OSMap.nearestFells(p.lat, p.lng, 3);
    return { p, en, g10, g6: OSMap.gridRef(p.lat, p.lng, 6), near, old: c.old };
  }

  function buildMessage(){
    const c = current();
    const lines = ["EMERGENCY. I need Mountain Rescue."];
    if (what.trim()) lines.push("What has happened: " + what.trim() + ".");
    if (c) {
      const d = describe(c), first = d.near[0];
      if (d.g10) lines.push("My grid reference is " + d.g10 + " (E " + d.en.e + " N " + d.en.n + ")" + (d.old ? ", but that was my position at " + clock(d.p.t) + " and I may have moved" : ", accurate to about " + Math.round(d.p.acc || 0) + " metres") + ".");
      lines.push("Latitude and longitude: " + d.p.lat.toFixed(5) + ", " + d.p.lng.toFixed(5) + ".");
      if (first) lines.push(first.m < 30 ? "I am at the summit of " + first.fell.name + "." : "Nearest summit: " + first.fell.name + ", " + fmtDist(first.m) + " " + compass(first.bearing) + " of me.");
    } else lines.push("I don't have a GPS position yet.");
    const n = String(details.people || "").trim();
    if (n) lines.push("People with me: " + n + ".");
    if (details.medical.trim()) lines.push("Medical information: " + details.medical.trim() + ".");
    if (details.name.trim() || details.phone.trim()) lines.push("My name: " + (details.name.trim() || "not given") + (details.phone.trim() ? ". My phone: " + details.phone.trim() : "") + ".");
    return lines.join("\n");
  }

  // ---------------------------------------------------------------- build the page once

  function section(title){ const s = el("section", "chart-card em-card"); if (title) s.appendChild(el("h3", "em-h", title)); return s; }

  function field(label, id, key, opts){
    opts = opts || {};
    const wrap = el("label", "em-field");
    wrap.appendChild(el("span", "em-label", label));
    const input = opts.area ? el("textarea", "lock-input em-input") : el("input", "lock-input em-input");
    input.id = id; input.value = details[key]; input.autocomplete = opts.auto || "off";
    if (opts.area) input.rows = 3; else { input.type = opts.type || "text"; if (opts.mode) input.inputMode = opts.mode; }
    input.maxLength = opts.max || 120;
    input.addEventListener("input", () => { details[key] = input.value; store.set(DETAILS_KEY, details); paintMessage(); });
    wrap.appendChild(input);
    return wrap;
  }

  function build(){
    const root = $("em-root"); root.textContent = "";

    // 1. position
    const pos = section("Where I am");
    pos.classList.add("em-pos");
    const ref = el("div", "em-ref", "Finding you…"); ref.id = "em-ref"; ref.setAttribute("aria-live", "polite");
    const sub = el("p", "em-sub"); sub.id = "em-sub";
    const warn = el("p", "em-warn"); warn.id = "em-warn"; warn.hidden = true;
    const near = el("ul", "em-near"); near.id = "em-near";
    pos.append(ref, sub, warn, near);
    root.appendChild(pos);

    // 2. what to do
    const how = section("What to do");
    const ol = el("ol", "em-steps");
    [
      ["Stay safe and stay put. ", "Don't move an injured person unless you're in danger. Put on every layer you have and get out of the wind."],
      ["Call 999 ", "(112 also works) and ask for Police, then Mountain Rescue. Don't hang up until they say so. Call from the spot, or the nearest place with signal if you must move, and say you've moved."],
      ["Read out the message below. ", "Say the grid reference slowly, digit by digit."],
      ["No voice signal? ", "Try a text to your emergency contact (button below). Texts can get through where calls can't. If you registered with the emergencySMS service beforehand, you can text 999 instead (to register, text REGISTER to 999 while you have signal, before you go)."],
      ["Save your phone battery. ", "Flight mode between calls, screen dim, keep the phone warm. Keep this page open, or screenshot it now."]
    ].forEach(([b, t]) => { const li = el("li"); li.appendChild(el("strong", null, b)); li.appendChild(document.createTextNode(t)); ol.appendChild(li); });
    how.appendChild(ol);
    root.appendChild(how);

    // 3. message
    const msg = section("Message to read out or send");
    const whatWrap = el("label", "em-field");
    whatWrap.appendChild(el("span", "em-label", "What's happened (optional, never saved)"));
    const whatBox = el("textarea", "lock-input em-input"); whatBox.id = "em-what"; whatBox.rows = 3; whatBox.maxLength = 240; whatBox.autocomplete = "off";
    whatBox.addEventListener("input", () => { what = whatBox.value; paintMessage(); });   // memory only: not written to localStorage
    whatWrap.appendChild(whatBox);
    msg.appendChild(whatWrap);
    const box = el("textarea", "lock-input em-message"); box.id = "em-message"; box.readOnly = true; box.rows = 11; box.setAttribute("aria-label", "Emergency message");
    msg.appendChild(box);
    const actions = el("div", "em-actions");
    const copy = el("button", "btn em-btn", "Copy message"); copy.type = "button"; copy.id = "em-copy";
    const sms = el("a", "btn em-btn", "Text my emergency contact"); sms.id = "em-sms"; sms.hidden = true;
    const share = el("button", "btn em-btn", "Share…"); share.type = "button"; share.id = "em-share"; share.hidden = !navigator.share;
    actions.append(copy, sms, share);
    msg.appendChild(actions);
    root.appendChild(msg);
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(box.value); copy.textContent = "Copied"; }
      catch (e) { box.removeAttribute("readonly"); box.focus(); box.select(); try { document.execCommand("copy"); copy.textContent = "Copied"; } catch (e2) { copy.textContent = "Select and copy by hand"; } box.readOnly = true; }
      setTimeout(() => { copy.textContent = "Copy message"; }, 1800);
    });
    share.addEventListener("click", () => { navigator.share({ text: box.value }).catch(() => {}); });

    // 4. signals
    const sig = section("Distress signals");
    const sp = el("p", "em-text");
    sp.textContent = "Six long blasts on a whistle (or six flashes of a torch) in a minute, then a minute's pause, and repeat. Anyone who hears it answers with three blasts or flashes a minute. Keep going until help arrives.";
    sig.appendChild(sp);
    root.appendChild(sig);

    // 5. details
    const me = section("My details (saved on this phone only)");
    me.appendChild(el("p", "em-text", "Filled in once, they go into the message above. They never leave this device: there's no account and nothing is uploaded."));
    const grid = el("div", "em-grid");
    grid.append(
      field("My name", "em-name", "name", { auto: "name" }),
      field("My phone number", "em-phone", "phone", { type: "tel", mode: "tel", auto: "tel" }),
      field("People with me", "em-people", "people", { max: 40 }),
      field("Emergency contact's name", "em-cname", "contactName"),
      field("Emergency contact's phone", "em-cphone", "contactPhone", { type: "tel", mode: "tel" })
    );
    me.appendChild(grid);
    me.appendChild(field("Medical information (conditions, allergies, medication)", "em-medical", "medical", { area: true, max: 300 }));
    root.appendChild(me);

    root.appendChild(el("p", "em-fine", "This card is a help, not a safety system. Phones fail, batteries die and GPS drifts in valleys and cloud. Carry a paper map and compass, tell someone your route, and check the forecast. The grid reference is the British National Grid, as used on OS maps."));

  }

  // ---------------------------------------------------------------- paint the changing parts

  function paintPosition(){
    const ref = $("em-ref"), sub = $("em-sub"), warn = $("em-warn"), near = $("em-near");
    if (!ref) return;
    const c = current();
    if (!c) {
      ref.textContent = geoError ? "No position" : "Finding you…";
      sub.textContent = geoError || "Stand in the open if you can. GPS works without any phone signal.";
      warn.hidden = true; near.textContent = ""; return;
    }
    const d = describe(c);
    ref.textContent = d.g10 || (d.p.lat.toFixed(5) + ", " + d.p.lng.toFixed(5));
    const bits = [];
    if (d.g10) bits.push(d.g6 + " (6-figure)", "E " + d.en.e + " N " + d.en.n);
    bits.push(d.p.lat.toFixed(5) + ", " + d.p.lng.toFixed(5));
    if (!d.old) bits.push("±" + Math.round(d.p.acc || 0) + " m");
    if (!d.old && d.p.alt != null && isFinite(d.p.alt)) bits.push(Math.round(d.p.alt) + " m up");
    bits.push((d.old ? "from " + clock(d.p.t) + ", " : "GPS fix ") + ago(d.p.t));
    sub.textContent = bits.join(" · ");
    warn.hidden = !(d.old || (d.p.acc || 0) > 100);
    warn.textContent = d.old
      ? "This is where you were " + ago(d.p.t) + ", not a live position. Read it out only as 'last known' and say you may have moved."
      : "GPS accuracy is poor (±" + Math.round(d.p.acc) + " m). Move into the open if it's safe to and it will tighten up.";
    near.textContent = "";
    d.near.forEach(x => {
      const li = el("li"); li.appendChild(el("strong", null, x.fell.name));
      li.appendChild(document.createTextNode(" " + x.fell.m + " m — " + (x.m < 30 ? "you're on it" : fmtDist(x.m) + " " + compass(x.bearing))));
      near.appendChild(li);
    });
  }

  function paintMessage(){
    const box = $("em-message"); if (!box) return;
    box.value = buildMessage();
    const sms = $("em-sms"), n = (details.contactPhone || "").replace(/[^\d+]/g, "");
    if (n.length >= 5) {
      sms.hidden = false;
      const sep = /iPhone|iPad|iPod/.test(navigator.userAgent) ? "&" : "?";
      sms.href = "sms:" + n + sep + "body=" + encodeURIComponent(box.value);
      sms.textContent = "Text " + (details.contactName.trim() || "my emergency contact");
    } else sms.hidden = true;
  }

  function paintConn(){
    const c = $("em-conn");
    const on = navigator.onLine !== false;
    c.textContent = on ? "You're online. This page also works with no signal at all." : "You're offline, and that's fine: everything on this page still works.";
    c.className = "em-conn" + (on ? "" : " is-offline");
  }

  // ---------------------------------------------------------------- location

  function onFix(pos){
    const c = pos.coords;
    fix = { lat: c.latitude, lng: c.longitude, acc: c.accuracy, alt: c.altitude, t: Date.now() };
    geoError = "";
    if (Date.now() - lastSaved > 10000) { lastSaved = Date.now(); store.set(FIX_KEY, { lat: fix.lat, lng: fix.lng, acc: fix.acc, t: fix.t }); }
    paintPosition(); paintMessage();
  }
  function onErr(err){
    geoError = err && err.code === 1 ? "Location is blocked for this site. Allow it in your browser settings (or tap the lock or settings icon by the address bar) and reload."
      : err && err.code === 3 ? "Still waiting for a GPS fix. Move into the open." : "Can't get a position right now.";
    paintPosition(); paintMessage();
  }
  function start(){
    if (!navigator.geolocation) { geoError = "This browser can't give a GPS position."; return; }
    if (window.isSecureContext === false) { geoError = "Location only works on a secure (https) page."; return; }
    watchId = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
  }

  // ---------------------------------------------------------------- go

  function init(){
    build(); paintConn(); paintPosition(); paintMessage(); start();
    window.addEventListener("online", paintConn); window.addEventListener("offline", paintConn);
    setInterval(paintPosition, 1000);   // keeps "GPS fix 12 seconds ago" honest
    // make sure the page is saved for offline even if it was opened directly (needs https or localhost)
    try { if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (e) {}
  }
  if (typeof OSMap === "undefined" || typeof FELLS_DATA === "undefined") {
    const r = document.getElementById("em-root");
    if (r) r.textContent = "This page didn't load properly. Reload it, and call 999 if you need help now.";
  } else init();
})();
