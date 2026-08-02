(function(){
  "use strict";

  const DASHBOARD_ID = "wainwrights";
  const TABLE = "checkbox_states";
  const FLAG_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1 L3 13" stroke="currentColor" stroke-width="1.3" fill="none"></path><path d="M3 2 L11 4.3 L3 6.6 Z"></path></svg>';

  const CHALLENGES = {
    three_peaks: {
      label: "National Three Peaks Challenge",
      blurb: "Climb the highest peaks of England, Scotland and Wales — Ben Nevis, Scafell Pike and Snowdon — within 24 hours. Scafell Pike is the England leg; the other two aren't in the Lake District.",
      url: "https://en.wikipedia.org/wiki/National_Three_Peaks_Challenge"
    },
    bob_graham: {
      label: "Bob Graham Round",
      blurb: "A gruelling 24-hour fell-running challenge tracing 42 Lakeland summits — 66 miles and around 8,200m of ascent — starting and finishing at Keswick's Moot Hall. First completed by Bob Graham in 1932.",
      url: "https://www.bobgrahamclub.org.uk/"
    },
    "10in10": {
      label: "10in10 Challenge",
      blurb: "An annual charity walk for the MS Society: 10 peaks in the Newlands Valley near Keswick, climbed in 10 hours. Running since 2011.",
      url: "https://www.10in10.org.uk/"
    },
    challenge5: {
      label: "Challenge 5",
      blurb: "A shorter, family-friendly version of 10in10 — 5 peaks in the Newlands Valley, also in aid of the MS Society.",
      url: "https://www.10in10.org.uk/events/challenge-5/"
    }
  };

  const escapeHtml = WW.escapeHtml;

  // state: { "<fell name>": true|false } — only for the fells that belong to a challenge
  let state = {};

  // load: only the rows for the challenge fells, not all 214 — this page
  // doesn't need the rest.
  async function loadChallengeState(userId){
    const fallback = {};
    CHALLENGE_FELLS.forEach(f=>{ fallback[f.name] = false; });

    if(!WW.sb) return fallback;
    try{
      const names = CHALLENGE_FELLS.map(f=>f.name);
      const { data, error } = await WW.sb
        .from(TABLE)
        .select("item_id,is_checked")
        .eq("dashboard_id", DASHBOARD_ID)
        .eq("user_id", userId)
        .in("item_id", names);
      if(error) throw error;
      const merged = Object.assign({}, fallback);
      (data || []).forEach(row=>{ merged[row.item_id] = !!row.is_checked; });
      return merged;
    }catch(e){
      console.error("Supabase load failed", e);
      return fallback;
    }
  }

  function renderChallengesSection(){
    const el = document.getElementById("challenges-section");
    if(!el) return;

    let html = "";
    Object.keys(CHALLENGES).forEach(key=>{
      const c = CHALLENGES[key];
      const fells = CHALLENGE_FELLS.filter(f=> f.challenges.indexOf(key) !== -1);
      if(fells.length === 0) return;
      html += '<div class="chal-card">';
      html += '  <h3>' + FLAG_ICON + escapeHtml(c.label) + '</h3>';
      html += '  <p>' + escapeHtml(c.blurb) + '</p>';
      html += '  <a class="chal-link" href="' + c.url + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(linkHost(c.url)) + ' →</a>';
      html += '  <div class="chal-fell-list">';
      fells.forEach(f=>{
        const climbed = !!state[f.name];
        html += '<span class="chal-chip' + (climbed ? ' is-climbed' : '') + '" data-fell="' + escapeHtml(f.name) + '" data-key="' + key + '">' + escapeHtml(f.name) + '</span>';
      });
      html += '  </div>';
      html += '</div>';
    });
    el.innerHTML = html;

    el.querySelectorAll(".chal-chip").forEach(chip=>{
      chip.onclick = ()=> showChallengeModal(chip.dataset.fell, [chip.dataset.key]);
    });
  }

  function linkHost(url){
    try{ return new URL(url).hostname; }
    catch(e){ return url.replace(/^https?:\/\//, "").split("/")[0]; }
  }

  function showChallengeModal(fellName, keys){
    const modal = document.getElementById("challenge-modal");
    const title = document.getElementById("challenge-modal-title");
    const body = document.getElementById("challenge-modal-body");
    title.textContent = fellName;

    const fell = CHALLENGE_FELLS.find(f=> f.name === fellName);
    const labels = keys.map(k=> CHALLENGES[k] ? CHALLENGES[k].label : null).filter(Boolean);

    let html = "";
    if(labels.length){
      html += '<p class="chal-modal-tag">Part of ' + escapeHtml(labels.join(", ")) + '</p>';
    }
    html += '<p>' + escapeHtml(fell && fell.desc ? fell.desc : "No description available.") + '</p>';
    body.innerHTML = html;
    modal.style.display = "flex";
  }

  function setupChallengeModal(){
    const modal = document.getElementById("challenge-modal");
    const closeBtn = document.getElementById("challenge-modal-close");
    closeBtn.onclick = ()=>{ modal.style.display = "none"; };
    modal.onclick = (e)=>{ if(e.target === modal) modal.style.display = "none"; };
  }

  WW.onAuthReady(async function(user){
    state = await loadChallengeState(user.id);
    renderChallengesSection();
    setupChallengeModal();
  });
})();
