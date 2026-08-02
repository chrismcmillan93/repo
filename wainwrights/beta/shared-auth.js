(function(){
  "use strict";

  const SUPABASE_URL = "https://jyxtduvkmztexwurrjsf.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_KY9uqIN4zqY0WYmDJoCe3A_dr-YwArX";
  // Redirect back to whichever page the person signed in from, not always the home page.
  const REDIRECT_URL = window.location.origin + window.location.pathname;

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
      fireReady(user);
    }
  }

  function handleSession(session){
    if(session && session.user){
      WW.currentUser = session.user;
      showApp(session.user);
    } else {
      WW.currentUser = null;
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
        errorEl.textContent = err.message || "Something went wrong sending that link.";
        errorEl.style.display = "block";
      }finally{
        submitBtn.disabled = false;
        submitBtn.textContent = "Send magic link";
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
        errorEl.textContent = err.message || "That code wasn't accepted.";
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
