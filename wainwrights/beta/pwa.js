// Registers the service worker. Relative path, so it resolves next to the page
// (beta/sw.js) and the worker's scope is this folder only.
(function(){
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function(){
    navigator.serviceWorker.register("sw.js").catch(function(e){
      console.warn("service worker not registered", e);
    });
  });
})();
