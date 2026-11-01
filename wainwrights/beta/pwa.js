// Registers the service worker and adds a small "Install app" chip to the top bar
// that opens a popup with install instructions for the device. Relative paths
// throughout, so the worker's scope is this folder only.
(function(){
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function(){
      navigator.serviceWorker.register("sw.js").catch(function(e){
        console.warn("service worker not registered", e);
      });
    });
  }

  var ua = navigator.userAgent || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);
  var isFirefox = /Firefox|FxiOS/.test(ua);
  var isSafariDesktop = !isIOS && /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var deferred = null;
  var chip = null, modal = null, closeBtn = null, installBtn = null, lead = null, steps = null;

  function content(){
    if (deferred) return { lead: "Add the Wainwrights to your device like a normal app.", steps: [] };
    if (isIOS) return { lead: "On iPhone and iPad, install it from the Share menu:", steps: ["Tap the Share button (the square with an arrow) in Safari's toolbar.", "Scroll down and tap Add to Home Screen.", "Tap Add."] };
    if (isAndroid && isFirefox) return { lead: "In Firefox on Android:", steps: ["Open the browser menu (three dots).", "Tap Install, or Add to Home screen.", "Confirm."] };
    if (isAndroid) return { lead: "In Chrome on Android:", steps: ["Open the browser menu (three dots).", "Tap Install app, or Add to Home screen.", "Confirm."] };
    if (isSafariDesktop) return { lead: "In Safari on Mac:", steps: ["Choose File, then Add to Dock.", "Click Add."] };
    if (isFirefox) return { lead: "Firefox on desktop can't install web apps. Chrome, Edge or Safari can. Or just bookmark this page.", steps: [] };
    return { lead: "In Chrome or Edge, look for the install icon at the right of the address bar, or open the menu and choose Install.", steps: [] };
  }

  function el(tag, cls, text){
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function buildModal(){
    modal = el("div", "terms-modal install-modal");
    modal.style.display = "none";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "install-modal-title");
    var card = el("div", "terms-card");
    var h = el("h3", null, "Install the app");
    h.id = "install-modal-title";
    var body = el("div", "terms-body");
    lead = el("p");
    steps = el("ol");
    var note = el("p", null, "Installing puts an icon on your home screen and opens the tracker full-screen. You still need a connection to sign in and save your fells.");
    note.style.marginTop = "14px";
    body.appendChild(lead); body.appendChild(steps); body.appendChild(note);
    var actions = el("div", "install-actions");
    installBtn = el("button", "btn lock-btn", "Install app");
    installBtn.type = "button";
    closeBtn = el("button", "btn", "Close");
    closeBtn.type = "button";
    actions.appendChild(installBtn); actions.appendChild(closeBtn);
    card.appendChild(h); card.appendChild(body); card.appendChild(actions);
    modal.appendChild(card);
    document.body.appendChild(modal);

    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", function(e){ if (e.target === modal) close(); });
    modal.addEventListener("keydown", function(e){
      if (e.key === "Escape") { close(); return; }
      if (e.key === "Tab") {
        var items = installBtn.hidden ? [closeBtn] : [installBtn, closeBtn];
        var i = items.indexOf(document.activeElement);
        e.preventDefault();
        items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
      }
    });
    installBtn.addEventListener("click", function(){
      if (!deferred) return;
      var p = deferred;
      deferred = null;
      p.prompt();
      var done = function(){ close(); };
      p.userChoice.then(done, done);
    });
  }

  function open(){
    if (!modal) buildModal();
    var c = content();
    lead.textContent = c.lead;
    steps.textContent = "";
    c.steps.forEach(function(t){ steps.appendChild(el("li", null, t)); });
    steps.style.display = c.steps.length ? "" : "none";
    installBtn.hidden = !deferred;
    modal.style.display = "flex";
    (installBtn.hidden ? closeBtn : installBtn).focus();
  }

  function close(){
    if (!modal) return;
    modal.style.display = "none";
    if (chip && !chip.hidden) chip.focus();
  }

  // Pages now come from the cache first (fast launches), so with no connection the
  // app shell would load and look empty, as if progress were lost. Cover it instead.
  var cover = null;
  function showOffline(){
    if (cover || !document.body) return;
    cover = el("div", "offline-cover");
    cover.setAttribute("role", "alert");
    var screen = el("div", "lock-screen");
    var card = el("div", "lock-card");
    var h = el("h1", "lock-title", "You're offline");
    var p = el("p", "lock-sub", "The Wainwrights needs a connection to sign you in and save your fells. Your progress is safe \u2014 it's stored online and will be here when you're back.");
    var b = el("button", "btn lock-btn", "Try again");
    b.type = "button";
    b.addEventListener("click", function(){ location.reload(); });
    card.appendChild(h); card.appendChild(p); card.appendChild(b);
    screen.appendChild(card); cover.appendChild(screen);
    document.body.appendChild(cover);
  }
  window.addEventListener("online", function(){ if (cover) location.reload(); });

  // "New version ready" bar. The service worker checks the app's files in the background
  // after each launch and posts "update-ready" when something changed; one tap reloads
  // into the new version. Shown at most once per page load unless dismissed and changed again.
  var updateBar = null;
  function showUpdate(){
    if (updateBar || !document.body) return;
    updateBar = el("div", "update-bar");
    updateBar.setAttribute("role", "status");
    var t = el("span", "update-bar-text", "New version ready");
    var go = el("button", "btn update-bar-go", "Reload");
    go.type = "button";
    go.addEventListener("click", function(){ location.reload(); });
    var x = el("button", "update-bar-x", "\u00d7");
    x.type = "button";
    x.setAttribute("aria-label", "Dismiss");
    x.addEventListener("click", function(){ updateBar.remove(); updateBar = null; });
    updateBar.appendChild(t); updateBar.appendChild(go); updateBar.appendChild(x);
    document.body.appendChild(updateBar);
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function(e){
      if (e.data && e.data.type === "update-ready") showUpdate();
    });
  }

  // ---- Timing readout (diagnostics) --------------------------------------------------
  // Tap "THE WAINWRIGHTS" (or the sign-in title) 5 times in a row to open it. It shows how
  // long this page load took, step by step, plus the last few launches, with a Copy button.
  // Times are from the start of the page load; the phone/tablet's own launch screen before
  // that can't be seen from inside the page.
  var perfMarks = {};
  function mark(name){ if (!(name in perfMarks)) perfMarks[name] = Math.round(performance.now()); }
  mark("pwa.js ran");
  function watchApp(){
    var app = document.getElementById("app-content"), list = document.getElementById("areas");
    if (app && typeof MutationObserver !== "undefined") {
      var check = function(){ if (app.style.display !== "none") mark("app shown"); };
      new MutationObserver(check).observe(app, { attributes: true, attributeFilter: ["style"] });
      check();
    }
    if (list && typeof MutationObserver !== "undefined") {
      var seen = function(){ if (list.children.length) mark("fell list rendered"); };
      new MutationObserver(seen).observe(list, { childList: true });
      seen();
    }
  }
  var PERF_LOG = "ww_perf_log";
  function paintTimes(){
    var p = {};
    try { performance.getEntriesByType("paint").forEach(function(e){ p[e.name] = e.startTime; }); } catch (e) {}
    return p;
  }
  function navEntry(){ try { return performance.getEntriesByType("navigation")[0] || {}; } catch (e) { return {}; } }
  function saveLaunch(){
    try {
      var n = navEntry(), p = paintTimes();
      var log = JSON.parse(localStorage.getItem(PERF_LOG) || "[]");
      log.push({ at: new Date().toISOString().slice(0, 16).replace("T", " "),
        sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller), inst: !!standalone,
        fp: Math.round(p["first-paint"] || 0), fcp: Math.round(p["first-contentful-paint"] || 0),
        shown: perfMarks["app shown"] || 0, list: perfMarks["fell list rendered"] || 0, load: Math.round(n.loadEventEnd || 0) });
      localStorage.setItem(PERF_LOG, JSON.stringify(log.slice(-6)));
    } catch (e) {}
  }
  function ms(v){ return (v === undefined || v === null || isNaN(v) || v <= 0) ? "-" : Math.round(v) + " ms"; }
  function pad(s, n){ s = String(s); while (s.length < n) s += " "; return s; }
  function perfReport(){
    var n = navEntry(), p = paintTimes(), out = [];
    var ctl = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    out.push("Wainwrights timing  " + new Date().toISOString().slice(0, 19).replace("T", " "));
    out.push("Installed app: " + (standalone ? "yes" : "no") + "   Online: " + navigator.onLine +
      (navigator.connection && navigator.connection.effectiveType ? "   Network: " + navigator.connection.effectiveType : ""));
    out.push("Service worker controlling this page: " + (ctl ? "yes" : "NO") + "   Page load type: " + (n.type || "?"));
    out.push("");
    out.push("Time from the start of this page load:");
    [["Service worker started", ctl ? n.workerStart : 0], ["Page received", n.responseEnd], ["First paint", p["first-paint"]],
     ["First contentful paint", p["first-contentful-paint"]], ["pwa.js ran", perfMarks["pwa.js ran"]],
     ["Page ready (DOM)", n.domContentLoadedEventEnd], ["App shown (signed in)", perfMarks["app shown"]],
     ["Fell list rendered", perfMarks["fell list rendered"]], ["Everything loaded", n.loadEventEnd]
    ].forEach(function(r){ out.push("  " + pad(r[0], 26) + ms(r[1])); });
    try {
      var res = performance.getEntriesByType("resource").slice().sort(function(a, b){ return b.duration - a.duration; }).slice(0, 5);
      if (res.length) {
        out.push(""); out.push("Slowest files:");
        res.forEach(function(r){
          var name = r.name.replace(location.origin + location.pathname.replace(/[^/]*$/, ""), "").replace(/^https?:\/\//, "").slice(0, 44);
          out.push("  " + pad(name, 46) + pad(ms(r.duration), 9) + (r.transferSize === 0 ? "cache" : Math.round(r.transferSize / 1024) + " KB"));
        });
      }
    } catch (e) {}
    try {
      var log = JSON.parse(localStorage.getItem(PERF_LOG) || "[]");
      if (log.length) {
        out.push(""); out.push("Recent launches (first paint / app shown / fell list / loaded):");
        log.forEach(function(l){ out.push("  " + l.at + (l.inst ? " app" : " web") + (l.sw ? " sw" : " NO-sw") + "  " + ms(l.fp) + " / " + ms(l.shown) + " / " + ms(l.list) + " / " + ms(l.load)); });
      }
    } catch (e) {}
    out.push(""); out.push(navigator.userAgent);
    return out.join("\n");
  }
  var perfModal = null, perfText = null;
  function openPerf(){
    if (!perfModal) {
      perfModal = el("div", "terms-modal");
      perfModal.setAttribute("role", "dialog");
      perfModal.setAttribute("aria-modal", "true");
      var card = el("div", "terms-card");
      card.style.maxWidth = "560px"; card.style.width = "100%";
      card.appendChild(el("h3", null, "Timing"));
      perfText = el("textarea", "lock-input perf-text");
      perfText.readOnly = true; perfText.rows = 24; perfText.spellcheck = false;
      card.appendChild(perfText);
      var actions = el("div", "install-actions");
      var copy = el("button", "btn lock-btn", "Copy");
      copy.type = "button";
      copy.addEventListener("click", function(){
        perfText.focus(); perfText.select();
        var done = function(){ copy.textContent = "Copied"; setTimeout(function(){ copy.textContent = "Copy"; }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(perfText.value).then(done, function(){ try { document.execCommand("copy"); done(); } catch (e) {} });
        else { try { document.execCommand("copy"); done(); } catch (e) {} }
      });
      var close = el("button", "btn", "Close");
      close.type = "button";
      close.addEventListener("click", function(){ perfModal.style.display = "none"; });
      actions.appendChild(copy); actions.appendChild(close);
      card.appendChild(actions);
      perfModal.appendChild(card);
      perfModal.addEventListener("click", function(e){ if (e.target === perfModal) perfModal.style.display = "none"; });
      document.body.appendChild(perfModal);
    }
    perfText.value = perfReport();
    perfModal.style.display = "flex";
  }
  var taps = [];
  document.addEventListener("click", function(e){
    var t = e.target;
    if (!t || !t.closest || t.closest(".install-chip") || !t.closest(".topnav-word, .lock-title")) { taps = []; return; }
    var now = Date.now();
    taps = taps.filter(function(x){ return now - x < 4000; });
    taps.push(now);
    if (taps.length >= 5) { taps = []; openPerf(); }
  });
  window.addEventListener("load", function(){ mark("load"); setTimeout(saveLaunch, 4000); });

  // The Admin link is only a convenience for people the admin page has already confirmed as admins in this
  // browser; admin.html asks the database every time, so showing the link to anyone else would do nothing.
  function adminLink(){
    try {
      var links = document.querySelector(".topnav-links");
      if (!links) return;
      var box = document.querySelector(".admin-bar");
      if (localStorage.getItem("ww_admin") !== "1") { if (box) box.remove(); return; }
      var on = Number(localStorage.getItem("ww_admin_mode_until")) > Date.now();
      var here = /admin\.html$/.test(location.pathname);
      if (!box) {
        box = el("a", "admin-bar");
        box.href = "admin.html";
        links.parentNode.insertBefore(box, links);
      }
      box.className = "admin-bar" + (on ? " is-on" : "") + (here ? " is-here" : "");
      box.textContent = "Admin · mode " + (on ? "ON" : "off") + (here ? "" : " →");
    } catch (e) {}
  }
  window.wwAdminLink = adminLink;

  function init(){
    adminLink();
    watchApp();
    if (navigator.onLine === false) showOffline();
    if (standalone) return;
    var word = document.querySelector(".topnav-word");
    if (!word) return;
    chip = el("button", "install-chip", "Install app");
    chip.type = "button";
    chip.setAttribute("aria-haspopup", "dialog");
    chip.addEventListener("click", open);
    word.appendChild(chip);
  }

  window.addEventListener("beforeinstallprompt", function(e){
    e.preventDefault();
    deferred = e;
  });
  window.addEventListener("appinstalled", function(){
    standalone = true; deferred = null;
    if (modal) modal.style.display = "none";
    if (chip) chip.hidden = true;
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
