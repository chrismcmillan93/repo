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

  // ---------- Teams ----------

  let teamMode = "count"; // "count" | "pct" | "elev"
  let currentTeam = null; // { team_id, status, name, is_admin } or null

  function wireUppercaseInput(el){
    el.addEventListener("input", ()=>{
      const pos = el.selectionStart;
      el.value = el.value.toUpperCase();
      el.setSelectionRange(pos, pos);
    });
  }

  function showTeamState(which){
    ["team-none","team-create","team-join","team-pending","team-active"].forEach(id=>{
      document.getElementById(id).style.display = (id === which) ? "block" : "none";
    });
  }

  async function refreshTeamState(user){
    if(!WW.sb) return;
    try{
      const { data, error } = await WW.sb.rpc("my_team_status");
      if(error) throw error;
      const row = (data && data[0]) || null;

      if(!row){
        currentTeam = null;
        showTeamState("team-none");
      } else if(row.status === "pending"){
        currentTeam = { team_id: row.team_id, status: "pending", name: row.name };
        document.getElementById("team-pending-name").textContent = row.name;
        showTeamState("team-pending");
      } else {
        currentTeam = { team_id: row.team_id, status: "approved", name: row.name };
        showTeamState("team-active");
        await loadActiveTeam(user);
      }
    }catch(e){
      console.error("Could not load team status", e);
    }
  }

  function setupTeamEntryButtons(){
    document.getElementById("team-show-create").onclick = ()=>{
      document.getElementById("team-create-error").style.display = "none";
      showTeamState("team-create");
    };
    document.getElementById("team-show-join").onclick = async ()=>{
      document.getElementById("team-join-error").style.display = "none";
      showTeamState("team-join");
      await loadBrowseTeams();
    };
    document.getElementById("team-create-back").onclick = ()=> showTeamState("team-none");
    document.getElementById("team-join-back").onclick = ()=> showTeamState("team-none");
  }

  function setupTeamCreateForm(user){
    const form = document.getElementById("team-create-form");
    const nameInput = document.getElementById("team-create-name");
    const publicCheck = document.getElementById("team-create-public");
    const errorEl = document.getElementById("team-create-error");
    const submitBtn = document.getElementById("team-create-submit");

    form.onsubmit = async (e)=>{
      e.preventDefault();
      errorEl.style.display = "none";
      const name = nameInput.value.trim();
      if(!name){ return; }
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating…";
      try{
        const { error } = await WW.sb.rpc("create_team", {
          p_name: name,
          p_is_public: publicCheck.checked
        });
        if(error) throw error;
        nameInput.value = "";
        publicCheck.checked = false;
        await refreshTeamState(user);
      }catch(err){
        errorEl.textContent = err.message || "Couldn't create that team.";
        errorEl.style.display = "block";
      }finally{
        submitBtn.disabled = false;
        submitBtn.textContent = "Create team";
      }
    };
  }

  function setupTeamJoinForm(user){
    const form = document.getElementById("team-code-form");
    const codeInput = document.getElementById("team-code-input");
    wireUppercaseInput(codeInput);
    const errorEl = document.getElementById("team-join-error");
    const submitBtn = document.getElementById("team-code-submit");

    form.onsubmit = async (e)=>{
      e.preventDefault();
      errorEl.style.display = "none";
      const code = codeInput.value.trim();
      if(!code){ return; }
      submitBtn.disabled = true;
      submitBtn.textContent = "Joining…";
      try{
        const { error } = await WW.sb.rpc("join_team_by_code", { p_code: code });
        if(error) throw error;
        codeInput.value = "";
        await refreshTeamState(user);
      }catch(err){
        errorEl.textContent = err.message || "That code wasn't recognised.";
        errorEl.style.display = "block";
      }finally{
        submitBtn.disabled = false;
        submitBtn.textContent = "Join with code";
      }
    };
  }

  async function loadBrowseTeams(){
    const list = document.getElementById("team-browse-list");
    if(!WW.sb) return;
    try{
      const { data, error } = await WW.sb.rpc("browse_public_teams");
      if(error) throw error;
      if(!data || data.length === 0){
        list.innerHTML = '<p class="lb-empty">No public teams to join right now.</p>';
        return;
      }
      let html = "";
      data.forEach(t=>{
        html += '<div class="team-browse-row">';
        html += '  <span><span class="lb-name">' + escapeHtml(t.name) + '</span> <span class="lb-value">(' + t.member_count + ' member' + (t.member_count === 1 ? '' : 's') + ')</span></span>';
        html += '  <button type="button" class="btn" data-team="' + t.team_id + '">Request to join</button>';
        html += '</div>';
      });
      list.innerHTML = html;
      list.querySelectorAll("button[data-team]").forEach(btn=>{
        btn.onclick = async ()=>{
          btn.disabled = true;
          btn.textContent = "Requesting…";
          try{
            const { error } = await WW.sb.rpc("request_to_join_team", { p_team_id: btn.dataset.team });
            if(error) throw error;
            await refreshTeamState(WW.currentUser);
          }catch(err){
            document.getElementById("team-join-error").textContent = err.message || "Couldn't send that request.";
            document.getElementById("team-join-error").style.display = "block";
            btn.disabled = false;
            btn.textContent = "Request to join";
          }
        };
      });
    }catch(e){
      console.error("Could not load public teams", e);
      list.innerHTML = '<p class="lb-empty">Couldn\'t load public teams right now.</p>';
    }
  }

  function setupTeamPendingCancel(user){
    document.getElementById("team-pending-cancel").onclick = async ()=>{
      try{
        const { error } = await WW.sb.rpc("leave_team");
        if(error) throw error;
        await refreshTeamState(user);
      }catch(e){
        console.error("Could not cancel request", e);
      }
    };
  }

  async function loadActiveTeam(user){
    if(!currentTeam) return;
    try{
      const { data, error } = await WW.sb.rpc("team_summary", { p_team_id: currentTeam.team_id });
      if(error) throw error;
      const s = data && data[0];
      if(!s) return;
      currentTeam.is_admin = s.is_admin;

      document.getElementById("team-active-name").textContent = s.name;
      document.getElementById("team-invite-code").textContent = s.invite_code;
      const pct = Math.round((s.union_climbed_count / TOTAL) * 100);
      document.getElementById("team-stat-percent").textContent = pct + "%";
      document.getElementById("team-stat-elev").textContent = Number(s.total_elevation_m || 0).toLocaleString() + "m";
      document.getElementById("team-stat-members").textContent = s.member_count;

      const requestsCard = document.getElementById("team-requests-card");
      if(s.is_admin && s.pending_count > 0){
        requestsCard.style.display = "block";
        await loadPendingRequests(user);
      } else {
        requestsCard.style.display = "none";
      }

      await refreshTeamMembers(user);
    }catch(e){
      console.error("Could not load team summary", e);
    }
  }

  async function loadPendingRequests(user){
    const list = document.getElementById("team-requests-list");
    try{
      const { data, error } = await WW.sb.rpc("team_pending_requests", { p_team_id: currentTeam.team_id });
      if(error) throw error;
      if(!data || data.length === 0){
        document.getElementById("team-requests-card").style.display = "none";
        return;
      }
      let html = "";
      data.forEach(r=>{
        html += '<div class="team-request-row">';
        html += '  <span class="req-name">' + escapeHtml(r.display_name) + '</span>';
        html += '  <span class="team-request-actions">';
        html += '    <button type="button" class="team-req-approve" data-id="' + r.member_id + '">Approve</button>';
        html += '    <button type="button" class="team-req-deny" data-id="' + r.member_id + '">Deny</button>';
        html += '  </span>';
        html += '</div>';
      });
      list.innerHTML = html;
      list.querySelectorAll(".team-req-approve").forEach(btn=>{
        btn.onclick = async ()=>{
          try{
            await WW.sb.rpc("approve_join_request", { p_member_id: btn.dataset.id });
            await loadActiveTeam(user);
          }catch(e){ console.error("Approve failed", e); }
        };
      });
      list.querySelectorAll(".team-req-deny").forEach(btn=>{
        btn.onclick = async ()=>{
          try{
            await WW.sb.rpc("deny_join_request", { p_member_id: btn.dataset.id });
            await loadActiveTeam(user);
          }catch(e){ console.error("Deny failed", e); }
        };
      });
    }catch(e){
      console.error("Could not load pending requests", e);
    }
  }

  async function refreshTeamMembers(user){
    const list = document.getElementById("team-member-list");
    try{
      const { data, error } = await WW.sb.rpc("team_leaderboard", { p_team_id: currentTeam.team_id });
      if(error) throw error;
      const sortKey = teamMode === "elev" ? "elevation_m" : "climbed_count";
      const rows = (data || []).slice().sort((a,b)=> b[sortKey] - a[sortKey]);
      if(rows.length === 0){
        list.innerHTML = '<p class="lb-empty">No members yet.</p>';
        return;
      }
      let html = "";
      rows.forEach((r,i)=>{
        const isMe = r.user_id === user.id;
        let value;
        if(teamMode === "pct") value = Math.round((r.climbed_count / TOTAL) * 100) + "%";
        else if(teamMode === "elev") value = Number(r.elevation_m || 0).toLocaleString() + "m";
        else value = r.climbed_count + " / " + TOTAL;
        html += '<div class="lb-row' + (isMe ? ' is-me' : '') + '">';
        html += '  <span class="rank">' + (i+1) + '</span>';
        html += '  <span><span class="lb-name">' + escapeHtml(r.display_name) + (r.is_admin ? ' \u2605' : '') + '</span></span>';
        html += '  <span class="lb-value">' + value + '</span>';
        html += '</div>';
      });
      list.innerHTML = html;
    }catch(e){
      console.error("Could not load team members", e);
      list.innerHTML = '<p class="lb-empty">Couldn\'t load team members right now.</p>';
    }
  }

  function setupTeamModeToggle(user){
    const btns = {
      count: document.getElementById("team-mode-count"),
      pct: document.getElementById("team-mode-pct"),
      elev: document.getElementById("team-mode-elev")
    };
    Object.keys(btns).forEach(mode=>{
      btns[mode].onclick = ()=>{
        teamMode = mode;
        Object.keys(btns).forEach(m=> btns[m].classList.toggle("is-active", m === mode));
        refreshTeamMembers(user);
      };
    });
  }

  function setupTeamInviteCopy(){
    document.getElementById("team-invite-copy").onclick = async (e)=>{
      const btn = e.currentTarget;
      const code = document.getElementById("team-invite-code").textContent;
      try{
        await navigator.clipboard.writeText(code);
        btn.classList.add("copied");
        setTimeout(()=> btn.classList.remove("copied"), 1200);
      }catch(err){
        console.error("Clipboard copy failed", err);
      }
    };
  }

  function setupTeamLeave(user){
    document.getElementById("team-leave-btn").onclick = async ()=>{
      const isAdmin = currentTeam && currentTeam.is_admin;
      const msg = isAdmin
        ? "You're the admin — leaving will disband the team for everyone. Continue?"
        : "Leave this team?";
      if(!window.confirm(msg)) return;
      try{
        const { error } = await WW.sb.rpc("leave_team");
        if(error) throw error;
        await refreshTeamState(user);
      }catch(e){
        console.error("Could not leave team", e);
      }
    };
  }

  let teamsLbMode = "count"; // "count" | "pct" | "elev"

  async function loadTeamsLeaderboard(myTeamId){
    const list = document.getElementById("teams-lb-list");
    if(!WW.sb) return;
    try{
      const { data, error } = await WW.sb.rpc("teams_leaderboard");
      if(error) throw error;
      if(!data || data.length === 0){
        list.innerHTML = '<p class="lb-empty">No public teams yet — create one and let others find it.</p>';
        return;
      }
      const sortKey = teamsLbMode === "elev" ? "total_elevation_m" : "union_climbed_count";
      const rows = data.slice().sort((a,b)=> b[sortKey] - a[sortKey]);
      let html = "";
      rows.forEach((t,i)=>{
        let value;
        if(teamsLbMode === "pct") value = Math.round((t.union_climbed_count / TOTAL) * 100) + "%";
        else if(teamsLbMode === "elev") value = Number(t.total_elevation_m || 0).toLocaleString() + "m";
        else value = t.union_climbed_count + " / " + TOTAL;
        html += '<div class="team-lb-row' + (t.is_mine ? ' is-mine' : '') + '">';
        html += '  <span class="rank">' + (i+1) + '</span>';
        html += '  <span><span class="lb-name">' + escapeHtml(t.name) + '</span><span class="lb-sub">' + t.member_count + ' member' + (t.member_count === 1 ? '' : 's') + '</span></span>';
        html += '  <span class="lb-value">' + value + '</span>';
        html += '</div>';
      });
      list.innerHTML = html;
    }catch(e){
      console.error("Teams leaderboard fetch failed", e);
      list.innerHTML = '<p class="lb-empty">Couldn\'t load the teams leaderboard right now.</p>';
    }
  }

  function setupTeamsLbModeToggle(){
    const btns = {
      count: document.getElementById("teams-mode-count"),
      pct: document.getElementById("teams-mode-pct"),
      elev: document.getElementById("teams-mode-elev")
    };
    Object.keys(btns).forEach(mode=>{
      btns[mode].onclick = ()=>{
        teamsLbMode = mode;
        Object.keys(btns).forEach(m=> btns[m].classList.toggle("is-active", m === mode));
        loadTeamsLeaderboard();
      };
    });
  }

  function setupScopeToggle(user){
    const globalBtn = document.getElementById("scope-global-btn");
    const teamsBtn = document.getElementById("scope-teams-btn");
    const teamBtn = document.getElementById("scope-team-btn");
    const globalPane = document.getElementById("scope-global");
    const teamsPane = document.getElementById("scope-teams");
    const teamPane = document.getElementById("scope-team");

    function setScope(scope){
      globalBtn.classList.toggle("is-active", scope === "global");
      teamsBtn.classList.toggle("is-active", scope === "teams");
      teamBtn.classList.toggle("is-active", scope === "team");
      globalPane.style.display = (scope === "global") ? "block" : "none";
      teamsPane.style.display = (scope === "teams") ? "block" : "none";
      teamPane.style.display = (scope === "team") ? "block" : "none";
      if(scope === "teams") loadTeamsLeaderboard();
      if(scope === "team") refreshTeamState(user);
    }
    globalBtn.onclick = ()=> setScope("global");
    teamsBtn.onclick = ()=> setScope("teams");
    teamBtn.onclick = ()=> setScope("team");
  }

  function setupTeams(user){
    setupScopeToggle(user);
    setupTeamsLbModeToggle();
    setupTeamEntryButtons();
    setupTeamCreateForm(user);
    setupTeamJoinForm(user);
    setupTeamPendingCancel(user);
    setupTeamModeToggle(user);
    setupTeamInviteCopy();
    setupTeamLeave(user);
  }

  WW.onAuthReady(async function(user){
    const profile = await loadProfile(user.id);
    await setupLeaderboard(user, profile);
    setupTeams(user);
  });
})();
