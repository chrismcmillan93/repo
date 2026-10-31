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

  function init(){
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
