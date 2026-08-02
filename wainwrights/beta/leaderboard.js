(function(){
  "use strict";

  const TOTAL = 214; // fixed total of Wainwright fells

  const escapeHtml = WW.escapeHtml;
  let lbMode = "count"; // "count" | "pct" | "elev"

  // Instagram handles: letters, numbers, periods, underscores, 1-30 chars.
  // Strips a leading @ since people will naturally type it that way.
  // Forces an input to lowercase as the user types, without the cursor
  // jumping to the end (a naive value re-assignment does that).
  function wireLowercaseInput(el){
    el.addEventListener("input", ()=>{
      const pos = el.selectionStart;
      el.value = el.value.toLowerCase();
      el.setSelectionRange(pos, pos);
    });
  }

  function normalizeInstaHandle(raw){
    const trimmed = raw.trim().replace(/^@/, "").toLowerCase();
    if(!trimmed) return { value: null, error: null };
    if(!/^[a-z0-9._]{1,30}$/.test(trimmed)){
      return { value: null, error: "Instagram handle can only contain letters, numbers, periods and underscores." };
    }
    return { value: trimmed, error: null };
  }

  async function loadProfile(userId){
    if(!WW.sb) return null;
    try{
      const { data, error } = await WW.sb
        .from("profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();
      if(error) throw error;
      return data;
    }catch(e){
      console.error("Profile lookup failed", e);
      return null;
    }
  }

  async function setupLeaderboard(user, profile){
    const optinCard = document.getElementById("leaderboard-optin");
    const panelCard = document.getElementById("leaderboard-panel");
    const form = document.getElementById("lb-optin-form");
    const nameInput = document.getElementById("lb-name");
    const instaInput = document.getElementById("lb-insta");
    wireLowercaseInput(instaInput);
    const errorEl = document.getElementById("lb-optin-error");
    const joinBtn = document.getElementById("lb-join-btn");
    const leaveBtn = document.getElementById("lb-leave");
    const countBtn = document.getElementById("lb-mode-count");
    const pctBtn = document.getElementById("lb-mode-pct");
    const elevBtn = document.getElementById("lb-mode-elev");
    const modeBtns = [countBtn, pctBtn, elevBtn];
    const termsCheck = document.getElementById("lb-terms-check");
    const termsOpen = document.getElementById("terms-open");
    const termsClose = document.getElementById("terms-close");
    const termsModal = document.getElementById("terms-modal");
    const editToggle = document.getElementById("lb-edit-toggle");
    const editForm = document.getElementById("lb-edit-form");
    const editName = document.getElementById("lb-edit-name");
    const editInsta = document.getElementById("lb-edit-insta");
    wireLowercaseInput(editInsta);
    const editError = document.getElementById("lb-edit-error");

    if(!WW.sb) return;

    termsOpen.onclick = ()=>{ termsModal.style.display = "flex"; };
    termsClose.onclick = ()=>{ termsModal.style.display = "none"; };
    termsModal.onclick = (e)=>{ if(e.target === termsModal) termsModal.style.display = "none"; };
    termsCheck.onchange = ()=>{ joinBtn.disabled = !termsCheck.checked; };

    if(profile && profile.display_name && !nameInput.value){
      nameInput.value = profile.display_name;
    }

    let mine = null;
    try{
      const { data, error } = await WW.sb
        .from("leaderboard_opt_in")
        .select("display_name, instagram_handle")
        .eq("user_id", user.id)
        .maybeSingle();
      if(error) throw error;
      mine = data;
    }catch(e){
      console.error("Leaderboard opt-in lookup failed", e);
    }

    if(mine){
      optinCard.style.display = "none";
      panelCard.style.display = "block";
      await refreshLeaderboard(user.id);
    } else {
      optinCard.style.display = "block";
      panelCard.style.display = "none";
    }

    form.onsubmit = async (e)=>{
      e.preventDefault();
      errorEl.style.display = "none";
      const name = nameInput.value.trim();
      if(!name){ return; }
      if(!termsCheck.checked){
        errorEl.textContent = "Please accept the Terms & Conditions to join.";
        errorEl.style.display = "block";
        return;
      }
      const insta = normalizeInstaHandle(instaInput.value);
      if(insta.error){
        errorEl.textContent = insta.error;
        errorEl.style.display = "block";
        return;
      }
      joinBtn.disabled = true;
      joinBtn.textContent = "Joining…";
      try{
        const { error } = await WW.sb
          .from("leaderboard_opt_in")
          .upsert({ user_id: user.id, display_name: name, instagram_handle: insta.value }, { onConflict: "user_id" });
        if(error) throw error;
        // keep the reusable profile name in sync with whatever they just joined under
        await WW.sb.from("profiles").upsert({ user_id: user.id, display_name: name }, { onConflict: "user_id" });
        optinCard.style.display = "none";
        panelCard.style.display = "block";
        await refreshLeaderboard(user.id);
      }catch(err){
        errorEl.textContent = err.message || "Couldn't join the leaderboard.";
        errorEl.style.display = "block";
      }finally{
        joinBtn.disabled = !termsCheck.checked;
        joinBtn.textContent = "Join leaderboard";
      }
    };

    leaveBtn.onclick = async ()=>{
      try{
        await WW.sb.from("leaderboard_opt_in").delete().eq("user_id", user.id);
      }catch(e){ console.error("Leave leaderboard failed", e); }
      panelCard.style.display = "none";
      optinCard.style.display = "block";
      nameInput.value = "";
      instaInput.value = "";
      termsCheck.checked = false;
      joinBtn.disabled = true;
      editForm.style.display = "none";
    };

    editToggle.onclick = async ()=>{
      const showing = editForm.style.display !== "none";
      if(showing){
        editForm.style.display = "none";
        return;
      }
      editError.style.display = "none";
      // re-fetch current values so the edit form always starts accurate
      try{
        const { data } = await WW.sb
          .from("leaderboard_opt_in")
          .select("display_name, instagram_handle")
          .eq("user_id", user.id)
          .maybeSingle();
        editName.value = data ? (data.display_name || "") : "";
        editInsta.value = data && data.instagram_handle ? data.instagram_handle : "";
      }catch(e){ console.error("Could not load current details", e); }
      editForm.style.display = "flex";
    };

    editForm.onsubmit = async (e)=>{
      e.preventDefault();
      editError.style.display = "none";
      const name = editName.value.trim();
      if(!name){
        editError.textContent = "Display name can't be empty.";
        editError.style.display = "block";
        return;
      }
      const insta = normalizeInstaHandle(editInsta.value);
      if(insta.error){
        editError.textContent = insta.error;
        editError.style.display = "block";
        return;
      }
      try{
        await WW.sb.from("leaderboard_opt_in")
          .update({ display_name: name, instagram_handle: insta.value })
          .eq("user_id", user.id);
        await WW.sb.from("profiles")
          .upsert({ user_id: user.id, display_name: name }, { onConflict: "user_id" });
        editForm.style.display = "none";
        await refreshLeaderboard(user.id);
      }catch(err){
        editError.textContent = err.message || "Couldn't save those changes.";
        editError.style.display = "block";
      }
    };

    function setMode(mode, btn){
      lbMode = mode;
      modeBtns.forEach(b=> b.classList.toggle("is-active", b === btn));
      refreshLeaderboard(user.id);
    }
    countBtn.onclick = ()=> setMode("count", countBtn);
    pctBtn.onclick = ()=> setMode("pct", pctBtn);
    elevBtn.onclick = ()=> setMode("elev", elevBtn);
  }

  async function refreshLeaderboard(myUserId){
    const list = document.getElementById("lb-list");
    if(!WW.sb || !list) return;
    try{
      const { data, error } = await WW.sb.rpc("wainwright_leaderboard");
      if(error) throw error;
      const sortKey = lbMode === "elev" ? "elevation_m" : "climbed_count";
      const rows = (data || []).slice().sort((a,b)=> b[sortKey] - a[sortKey]);
      if(rows.length === 0){
        list.innerHTML = '<p class="lb-empty">No one\'s joined yet — you\'re the first.</p>';
        return;
      }
      let html = "";
      rows.forEach((r, i)=>{
        const isMe = r.user_id === myUserId;
        let value;
        if(lbMode === "pct") value = Math.round((r.climbed_count / TOTAL) * 100) + "%";
        else if(lbMode === "elev") value = Number(r.elevation_m || 0).toLocaleString() + "m";
        else value = r.climbed_count + " / " + TOTAL;
        const instaLink = r.instagram_handle
          ? '<a class="lb-insta" href="https://instagram.com/' + encodeURIComponent(r.instagram_handle) + '" target="_blank" rel="noopener noreferrer">@' + escapeHtml(r.instagram_handle) + '</a>'
          : '';
        html += '<div class="lb-row' + (isMe ? ' is-me' : '') + '">';
        html += '  <span class="rank">' + (i+1) + '</span>';
        html += '  <span><span class="lb-name">' + escapeHtml(r.display_name) + '</span>' + instaLink + '</span>';
        html += '  <span class="lb-value">' + value + '</span>';
        html += '</div>';
      });
      list.innerHTML = html;
    }catch(e){
      console.error("Leaderboard fetch failed", e);
      list.innerHTML = '<p class="lb-empty">Couldn\'t load the leaderboard right now.</p>';
    }
  }

  WW.onAuthReady(async function(user){
    const profile = await loadProfile(user.id);
    await setupLeaderboard(user, profile);
  });
})();
