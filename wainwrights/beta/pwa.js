// Registers the service worker and fills in the "Install the app" card on the
// tracker. Relative paths throughout, so the worker's scope is this folder only.
(function(){
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function(){
      navigator.serviceWorker.register("sw.js").catch(function(e){
        console.warn("service worker not registered", e);
      });
    });
  }

  var card = document.getElementById("install-card");
  if (!card) return;

  var ua = navigator.userAgent || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);
  var isFirefox = /Firefox|FxiOS/.test(ua);
  var isSafariDesktop = !isIOS && /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var deferred = null;

  var lead = document.getElementById("install-lead");
  var steps = document.getElementById("install-steps");
  var btn = document.getElementById("install-btn");

  function setSteps(list){
    steps.textContent = "";
    list.forEach(function(t){ var li = document.createElement("li"); li.textContent = t; steps.appendChild(li); });
  }

  function render(){
    if (standalone) { card.hidden = true; return; }
    btn.hidden = true;
    if (deferred) {
      lead.textContent = "Add the Wainwrights to your device like a normal app.";
      setSteps([]);
      btn.hidden = false;
    } else if (isIOS) {
      lead.textContent = "On iPhone and iPad, install it from the Share menu:";
      setSteps(["Tap the Share button (the square with an arrow) in Safari's toolbar.", "Scroll down and tap Add to Home Screen.", "Tap Add."]);
    } else if (isAndroid && isFirefox) {
      lead.textContent = "In Firefox on Android:";
      setSteps(["Open the browser menu (three dots).", "Tap Install, or Add to Home screen.", "Confirm."]);
    } else if (isAndroid) {
      lead.textContent = "In Chrome on Android:";
      setSteps(["Open the browser menu (three dots).", "Tap Install app, or Add to Home screen.", "Confirm."]);
    } else if (isSafariDesktop) {
      lead.textContent = "In Safari on Mac:";
      setSteps(["Choose File, then Add to Dock.", "Click Add."]);
    } else if (isFirefox) {
      lead.textContent = "Firefox on desktop can't install web apps. Chrome, Edge or Safari can. Or just bookmark this page.";
      setSteps([]);
    } else {
      lead.textContent = "In Chrome or Edge, look for the install icon at the right of the address bar, or open the menu and choose Install.";
      setSteps([]);
    }
    card.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", function(e){
    e.preventDefault();
    deferred = e;
    render();
  });
  window.addEventListener("appinstalled", function(){ standalone = true; deferred = null; render(); });

  btn.addEventListener("click", function(){
    if (!deferred) return;
    var p = deferred;
    deferred = null;
    p.prompt();
    p.userChoice.then(function(){ render(); }, function(){ render(); });
  });

  render();
})();
