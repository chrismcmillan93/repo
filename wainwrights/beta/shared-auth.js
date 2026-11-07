(function(){
  "use strict";

  const SUPABASE_URL = "https://jyxtduvkmztexwurrjsf.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_KY9uqIN4zqY0WYmDJoCe3A_dr-YwArX";
  // Redirect back to whichever page the person signed in from, not always the home page.
  const REDIRECT_URL = window.location.origin + window.location.pathname;

  // Beta gate. The beta copy of the app (anything served from a /beta/ path) is only for admins and for people an
  // admin has let in (public.am_i_beta, switched per person in the Admin page). It is decided by the path, so this
  // file can be copied up to production unchanged and do nothing there.
  // This controls what the beta PAGES show. It is not data security: beta shares the production database (sign-in and
  // row-level security protect that), and the beta files themselves are still public static files.
  const IS_BETA = /\/beta(\/|$)/.test(window.location.pathname);
  const BETA_OK_PREFIX = "ww_beta_ok_", BETA_OK_MS = 24 * 3600 * 1000;

  window.WW = window.WW || {};
  const WW = window.WW;

  WW.sb = (typeof window.supabase !== "undefined" && window.supabase.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  WW.currentUser = null;
  let hasInitialized = false;

  // Ready-queue: the page-specific script calls WW.onAuthReady(fn) to register
  // its startup function. We can't assume script load order relative to the
  // async session check below — the browser flushes microtasks after each
  // <script> finishes running, so the session check can resolve before the
  // next script tag has even loaded — so whichever side (auth or page script)
  // finishes second is the one that fires the callback.
  let authedUser = null;
  let readyFn = null;

  WW.onAuthReady = function(fn){
    readyFn = fn;
    if(authedUser){ fn(authedUser); }
  };

  function fireReady(user){
    authedUser = user;
    if(readyFn){ readyFn(user); }
  }

  WW.escapeHtml = function(str){
    return String(str).replace(/[&<>"']/g, function(ch){
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch];
    });
  };

  function showAuthScreen(){
    document.getElementById("app-content").style.display = "none";
    document.getElementById("auth-screen").style.display = "flex";
  }

  function showApp(user){
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app-content").style.display = "";
    const emailEl = document.getElementById("auth-user-email");
    if(emailEl) emailEl.textContent = user.email || "";
    if(!hasInitialized){
      hasInitialized = true;
      // Ask the database whether this person is an admin, so the Admin link appears (or goes) on its own.
      // The answer only controls a link; every admin function checks for itself.
      try {
        Promise.resolve(WW.sb.rpc("am_i_admin")).then(function(r){
          try {
            if(r && r.error) return;
            if(r && r.data === true) localStorage.setItem("ww_admin", "1");
            else { localStorage.removeItem("ww_admin"); localStorage.removeItem("ww_admin_mode_until"); }
          } catch(e) {}
          if(window.wwAdminLink) window.wwAdminLink();
        }).catch(function(){});
      } catch(e) {}
      fireReady(user);
    }
  }

  // ---- beta gate ----
  const gate = { uid: null, state: null };   // state: "checking" | "ok" | "closed"

  function showGate(html){
    let el = document.getElementById("beta-gate");
    if(!el){
      el = document.createElement("div");
      el.id = "beta-gate";
      el.className = "lock-screen";
      el.style.cssText = "position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;background:#e8e2d0;";
      document.body.appendChild(el);
    }
    el.innerHTML = '<div class="lock-card"><div class="beta-badge">BETA</div>' + html + "</div>";
    return el;
  }

  // Make it obvious this is the test copy: a BETA badge and note on the sign-in card, and "(beta)" in the tab title.
  function markBetaAuthScreen(){
    if(!/beta/i.test(document.title)) document.title += " (beta)";
    const card = document.querySelector("#auth-screen .lock-card");
    if(!card || card.querySelector(".beta-badge")) return;
    const icon = card.querySelector(".lock-icon");
    const badge = '<div class="beta-badge">BETA</div>';
    if(icon) icon.insertAdjacentHTML("afterend", badge); else card.insertAdjacentHTML("afterbegin", badge);
    const title = card.querySelector(".lock-title");
    if(title) title.insertAdjacentHTML("afterend", '<p class="beta-note">Test version for invited testers. Things may change or break. <a href="../">Open the main app</a></p>');
  }
  function hideGate(){ const el = document.getElementById("beta-gate"); if(el) el.remove(); }

  function showClosed(user, why){
    document.getElementById("app-content").style.display = "none";
    document.getElementById("auth-screen").style.display = "none";
    const email = WW.escapeHtml(user.email || "");
    let el;
    if(why === "unreachable"){
      el = showGate('<h1 class="lock-title">The Wainwrights beta</h1><p class="lock-sub">Couldn\'t check your beta access. Check your connection and try again.</p>' +
        '<button type="button" class="btn lock-btn" id="beta-retry">Try again</button> <a class="lock-retry" href="../">Open the main app</a>');
    } else {
      el = showGate('<h1 class="lock-title">The beta is invited-only</h1><p class="lock-sub">This is the test version of The Wainwrights, and it\'s only open to people Chris has let in. You\'re signed in as ' + email + '.</p>' +
        '<a class="btn lock-btn" href="../">Open the main app</a> <button type="button" class="lock-retry" id="beta-signout">Sign out</button>');
    }
    const retry = el.querySelector("#beta-retry"), out = el.querySelector("#beta-signout");
    if(retry) retry.addEventListener("click", function(){ window.location.reload(); });
    if(out) out.addEventListener("click", function(){ Promise.resolve(WW.sb.auth.signOut()).then(function(){ window.location.reload(); }, function(){ window.location.reload(); }); });
  }

  // true / false from the database. If it can't be asked (offline, outage), a yes from the last 24 hours on this device
  // still counts so the installed beta keeps working in the hills; otherwise it stays closed.
  async function betaAllowed(user){
    const key = BETA_OK_PREFIX + user.id;
    try {
      const r = await WW.sb.rpc("am_i_beta");
      if(r.error) throw r.error;
      if(r.data === true){ try { localStorage.setItem(key, String(Date.now())); } catch(e) {} return { ok: true }; }
      try { localStorage.removeItem(key); } catch(e) {}
      return { ok: false, why: "closed" };
    } catch(e) {
      let t = 0;
      try { t = Number(localStorage.getItem(key)) || 0; } catch(er) {}
      return t && Date.now() - t < BETA_OK_MS ? { ok: true } : { ok: false, why: "unreachable" };
    }
  }

  async function gateBeta(user){
    if(gate.uid === user.id && gate.state === "checking") return;     // already being checked
    if(gate.uid !== user.id){ gate.uid = user.id; gate.state = "checking"; showGate('<h1 class="lock-title">The Wainwrights beta</h1><p class="lock-sub">Checking beta access…</p>'); }
    const res = await betaAllowed(user);
    if(!WW.currentUser || WW.currentUser.id !== user.id) return;       // signed out or switched while we asked
    if(res.ok){ gate.state = "ok"; hideGate(); showApp(user); }
    else { gate.state = "closed"; showClosed(user, res.why); }
  }

  function handleSession(session){
    if(session && session.user){
      WW.currentUser = session.user;
      if(IS_BETA) gateBeta(session.user); else showApp(session.user);
    } else {
      WW.currentUser = null;
      gate.uid = null; gate.state = null;
      hideGate();
      showAuthScreen();
    }
  }

  function setupAuthForm(){
    const form = document.getElementById("auth-form");
    const emailInput = document.getElementById("auth-email");
    const errorEl = document.getElementById("auth-error");
    const sentWrap = document.getElementById("auth-sent");
    const submitBtn = document.getElementById("auth-submit");
    const retryBtn = document.getElementById("auth-retry");
    const codeForm = document.getElementById("code-form");
    const codeInput = document.getElementById("auth-code");
    const codeBtn = document.getElementById("code-submit");
    // "Paste code" button: reads the clipboard and fills in the digits (only where the browser allows it)
    if(navigator.clipboard && navigator.clipboard.readText && codeInput && !document.getElementById("code-paste")){
      const pasteBtn = document.createElement("button");
      pasteBtn.type = "button"; pasteBtn.id = "code-paste"; pasteBtn.className = "lock-retry"; pasteBtn.textContent = "Paste code";
      codeInput.insertAdjacentElement("afterend", pasteBtn);
      pasteBtn.addEventListener("click", async function(){
        try{
          const m = String(await navigator.clipboard.readText()).match(/\d{6,10}/);
          if(m){ codeInput.value = m[0]; codeInput.focus(); }
          else { pasteBtn.textContent = "No code found"; setTimeout(function(){ pasteBtn.textContent = "Paste code"; }, 2000); }
        }catch(e){ pasteBtn.textContent = "Paste not allowed"; setTimeout(function(){ pasteBtn.textContent = "Paste code"; }, 2000); }
      });
    }

    // Plain-English sign-in errors (the raw ones are "Load failed", "429: For security purposes..." and so on)
    function friendlyAuthError(err, fallback){
      const msg = String((err && err.message) || "");
      const wait = msg.match(/after (\d+) seconds?/i);
      if((err && (err.status === 429 || err.code === "over_email_send_rate_limit")) || wait){
        return { rateLimited: true, text: "A code was already sent a moment ago, so another can't be sent yet" + (wait ? " (try again in about " + Math.ceil(Number(wait[1]) / 60) + " min)" : "") + ". Check your email, including Junk, and enter the code you already have." };
      }
      if(/load failed|failed to fetch|networkerror|network request failed/i.test(msg)){
        return { text: "Couldn't reach the sign-in service. Check your connection and try again. If you just asked for a code, it may already be in your email." };
      }
      return { text: msg || fallback };
    }

    let pendingEmail = "";

    form.addEventListener("submit", async function(e){
      e.preventDefault();
      errorEl.style.display = "none";
      if(!WW.sb){
        errorEl.textContent = "Couldn't reach Supabase — try again shortly.";
        errorEl.style.display = "block";
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
      try{
        const email = emailInput.value.trim();
        const { error } = await WW.sb.auth.signInWithOtp({
          email: email,
          options: { emailRedirectTo: REDIRECT_URL }
        });
        if(error) throw error;
        pendingEmail = email;
        form.style.display = "none";
        sentWrap.style.display = "block";
        codeInput.focus();
      }catch(err){
        const f = friendlyAuthError(err, "Something went wrong sending that code.");
        errorEl.textContent = f.text;
        errorEl.style.display = "block";
        if(f.rateLimited){
          // an earlier code is still valid: let them type it in
          pendingEmail = emailInput.value.trim();
          form.style.display = "none";
          sentWrap.style.display = "block";
          codeInput.focus();
        }
      }finally{
        submitBtn.disabled = false;
        submitBtn.textContent = "Email me a sign-in code";
      }
    });

    // Typing the emailed code signs you in directly — immune to link scanners
    // that consume single-use magic links before the user gets to them.
    codeForm.addEventListener("submit", async function(e){
      e.preventDefault();
      errorEl.style.display = "none";
      const token = codeInput.value.trim();
      if(!token || !pendingEmail) return;
      codeBtn.disabled = true;
      codeBtn.textContent = "Verifying…";
      try{
        const { error } = await WW.sb.auth.verifyOtp({
          email: pendingEmail,
          token: token,
          type: "email"
        });
        if(error) throw error;
        // success fires onAuthStateChange, which swaps in the app
      }catch(err){
        errorEl.textContent = friendlyAuthError(err, "That code wasn't accepted.").text;
        errorEl.style.display = "block";
        codeInput.value = "";
        codeInput.focus();
      }finally{
        codeBtn.disabled = false;
        codeBtn.textContent = "Verify code";
      }
    });

    retryBtn.addEventListener("click", function(){
      sentWrap.style.display = "none";
      form.style.display = "flex";
      errorEl.style.display = "none";
      emailInput.value = "";
      codeInput.value = "";
      pendingEmail = "";
      emailInput.focus();
    });
  }

  function setupLogout(){
    const btn = document.getElementById("logout-btn");
    if(!btn) return;
    btn.onclick = async ()=>{
      if(WW.sb) await WW.sb.auth.signOut();
      window.location.reload();
    };
  }

  // Supabase returns failures as params in the URL — in the hash fragment for the
  // implicit flow, or the query string for PKCE. Surface them instead of silently
  // dropping the user back on the login form with no explanation.
  function readAuthErrorFromUrl(){
    const out = {};
    ["hash", "search"].forEach(part=>{
      const raw = window.location[part];
      if(!raw || raw.length < 2) return;
      const params = new URLSearchParams(raw.substring(1));
      ["error", "error_code", "error_description"].forEach(k=>{
        if(params.get(k) && !out[k]) out[k] = params.get(k);
      });
    });
    return (out.error || out.error_code) ? out : null;
  }

  function showAuthError(info){
    const el = document.getElementById("auth-error");
    if(!el) return;
    const desc = (info.error_description || "").replace(/\+/g, " ");
    const code = info.error_code || info.error || "";
    el.textContent = desc ? (desc + " (" + code + ")") : ("Sign-in failed: " + code);
    el.style.display = "block";
  }

  async function bootstrap(){
    setupAuthForm();
    setupLogout();
    if(IS_BETA) markBetaAuthScreen();

    if(!WW.sb){
      document.getElementById("auth-sub").textContent = "Supabase isn't available right now — try reloading.";
      showAuthScreen();
      return;
    }

    const urlError = readAuthErrorFromUrl();

    WW.sb.auth.onAuthStateChange((_event, session)=> handleSession(session));

    const { data } = await WW.sb.auth.getSession();
    const session = data ? data.session : null;
    handleSession(session);

    if(!session && urlError){
      showAuthError(urlError);
    }
  }

  bootstrap();
})();
