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
      url: "https://www.10in10.org.uk/",
      host: { start: { name: "Little Town, Newlands", lat: 54.5650, lng: -3.1830 }, miles: null, ascent: null }
    },
    challenge5: {
      label: "Challenge 5",
      blurb: "A shorter, family-friendly version of 10in10 — 5 peaks in the Newlands Valley, also in aid of the MS Society.",
      url: "https://www.10in10.org.uk/events/challenge-5/",
      host: { start: { name: "Little Town, Newlands", lat: 54.5650, lng: -3.1830 }, miles: null, ascent: null }
    },
    "24_peaks": {
      label: "Lake District 24 Peaks",
      blurb: "A two-day, 31-mile guided challenge: 24 peaks in 24 hours. Day 1 (10 peaks, target 12 hours) runs from Gatesgarth in Buttermere over the Buttermere ridge, the Gables, Scafell Pike and Bowfell to Great Langdale; day 2 (14 peaks, target 10 hours) starts at Kirkstone Pass and runs over Fairfield, Seat Sandal and the Helvellyn range to the Dodds. Run by Activus Outdoors. Helvellyn Lower Man isn't a separate Wainwright, so 23 of the 24 peaks are counted here.",
      url: "https://www.lakedistrictpeaks.co.uk/24-peaks.html",
      order: ["Red Pike (Buttermere)", "High Stile", "High Crag", "Green Gable", "Great Gable", "Lingmell", "Scafell Pike", "Great End", "Esk Pike", "Bowfell", "Red Screes", "Dove Crag", "Hart Crag", "Fairfield", "Seat Sandal", "Dollywaggon Pike", "Nethermost Pike", "Helvellyn", "White Side", "Raise", "Stybarrow Dodd", "Watson's Dodd", "Great Dodd"],   // route order: day 1 (10 peaks) then day 2 (14 peaks, minus Helvellyn Lower Man which isn't a Wainwright)
      host: {
        start: { name: "Buttermere village (day 1 starts further up the valley at Gatesgarth: move the pin), Buttermere", lat: 54.5410, lng: -3.2770 },
        miles: 31, ascent: null,
        note: "This challenge runs over two days (day 1: Gatesgarth, Buttermere; day 2: Kirkstone Pass). A hike has one start time, so use the start time for day 1 and say in the meeting point note when day 2 starts. Fells are ticked for everyone after the hike, so tick once both days are done."
      }
    }
  };

  const MAX_HOST_FELLS = 30;   // a hosted hike can include up to 30 fells (create_hike)
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
      if(c.order){ fells.sort((a, b)=> c.order.indexOf(a.name) - c.order.indexOf(b.name)); }
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
      if(fells.length > MAX_HOST_FELLS){
        html += '  <p class="chart-note">Too many fells to host as one hike (a hike can include up to ' + MAX_HOST_FELLS + ').</p>';
      } else if(c.host){
        html += '  <div class="chal-host-row"><button type="button" class="btn chal-host" data-host="' + key + '">Host this challenge</button></div>';
      }
      html += '</div>';
    });
    el.innerHTML = html;
    el.querySelectorAll(".chal-host").forEach(b=>{ b.onclick = ()=> hostChallenge(b.dataset.host); });

    el.querySelectorAll(".chal-chip").forEach(chip=>{
      chip.onclick = ()=> showChallengeModal(chip.dataset.fell, [chip.dataset.key]);
    });
  }

  // "Host this challenge": the same hand-off the planner uses (sessionStorage "ww_host_walk" -> hike.html?new=1), with the
  // challenge's fells in route order. hike.js works out the highest fell for the forecast from the fell names.
  function hostChallenge(key){
    const c = CHALLENGES[key];
    if(!c || !c.host) return;
    let names = CHALLENGE_FELLS.filter(f=> f.challenges.indexOf(key) !== -1).map(f=> f.name);
    if(c.order){ names.sort((a, b)=> c.order.indexOf(a) - c.order.indexOf(b)); }
    if(!names.length || names.length > MAX_HOST_FELLS) return;
    try{
      sessionStorage.setItem("ww_host_walk", JSON.stringify({
        id: "challenge-" + key, label: c.label, miles: c.host.miles, ascent: c.host.ascent, fells: names,
        start_name: c.host.start.name, start_lat: c.host.start.lat, start_lng: c.host.start.lng,
        url: c.url, note: c.host.note || null, from_carpark: false
      }));
    }catch(e){ return; }
    window.location.href = "hike.html?new=1";
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
