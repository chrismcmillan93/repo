// Giving up: things you've stopped, with days since, your best run and a log of slips.
// A slip restarts the current count but never erases the run before it (see streaks.js).
// Private by design: nothing here is in notifications, a name can be shown on Today as
// something else (or not at all), and the offline copy is not kept (sw.js).
import { floorDate, LIFE_START } from '../start.js';
import * as store from '../store.js';
import { esc, bar, pill, wire, formData, empty, options } from '../ui.js';
import { todayStr, formatDateShort, toast } from '../fit/utils.js';
import { streakInfo, topTrigger, milestoneLabel, pushLine, slipPatterns, PARTS } from '../streaks.js';
import { supabase as fitSb } from '../fit/supabaseClient.js';
import { readingList, pickToday, seedOf, format as formatReason, cleanReason, MAX_LEN, MAX_SOURCE } from '../quitReasons.js';

const TRIGGERS = ['Stress', 'Boredom', 'Tired', 'Lonely', 'Social pressure', 'Celebrating', 'Craving', 'Other'];

// The craving timer: 20 minutes, kept in localStorage (just the item's id and the start time,
// never a name) so a reload or a locked phone doesn't lose it. Cleared when it ends.
const CRAVE_KEY = 'life-craving';
const CRAVE_MS = 20 * 60 * 1000;
const CRAVE_LINES = ['This is the moment that decides it. Wait it out.', 'A craving is not an instruction. Ignore it for 20 minutes.', 'You have done this before. Do not hand it back now.', 'It peaks, then it passes. Stay put until it does.'];
function readCraving(){
  try { const v = JSON.parse(localStorage.getItem(CRAVE_KEY) || 'null'); return v && v.id && Date.now() - v.at < 3600000 ? v : null; } catch (_) { return null; }
}
function saveCraving(v){
  try { if (v) localStorage.setItem(CRAVE_KEY, JSON.stringify(v)); else localStorage.removeItem(CRAVE_KEY); } catch (_) { /* the timer just won't survive a reload */ }
}
const clock = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const addDaysIso = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const PART_WORDS = { Morning: 'in the morning', Afternoon: 'in the afternoon', Evening: 'in the evening', 'Late night': 'late at night' };

// Stress the day before and resting heart rate on the slip day, against other days. Describes only.
function bodyLine(b){
  const bits = [];
  if (b.slipStress != null && b.otherStress != null) bits.push(`the day before a slip your stress averaged <b>${b.slipStress}</b> against ${b.otherStress} otherwise${b.slipStress >= b.otherStress + 5 ? ' (a high-stress day is a warning sign)' : ''}`);
  if (b.slipRhr != null && b.otherRhr != null) bits.push(`your resting heart rate on slip days was <b>${b.slipRhr}</b> against ${b.otherRhr}${b.slipRhr >= b.otherRhr + 3 ? ' (run down)' : ''}`);
  return bits.length ? `<p>Garmin shows ${bits.join(', and ')}.${b.small ? ' Small sample: treat it as a hint, not a fact.' : ''}</p>` : '';
}

export async function render(root, params){
  const today = todayStr();
  let quits = [], slipsBy = {}, cravBy = {}, reasonsBy = {}, sleepRows = [], dayRows = [], openSlip = params[0] || null, slipTrigger = '', editing = null, adding = false, confirmDelete = null, craving = readCraving(), timer = null;

  async function load(){
    quits = await store.quits.list((q) => q.order('created_at'));
    const slips = quits.length ? await store.quitSlips.list((q) => q.order('slip_date', { ascending: false })) : [];
    slipsBy = {};
    slips.forEach((s) => { (slipsBy[s.quit_id] = slipsBy[s.quit_id] || []).push(s); });
    const cravings = quits.length ? await store.quitCravings.list() : [];
    cravBy = {};
    cravings.forEach((c) => { (cravBy[c.quit_id] = cravBy[c.quit_id] || []).push(c); });
    const reasons = quits.length ? await store.quitReasons.list((q) => q.order('created_at')) : [];
    reasonsBy = {};
    reasons.forEach((x) => { (reasonsBy[x.quit_id] = reasonsBy[x.quit_id] || []).push(x); });
    // Last nights from Garmin, only to compare slip days with other days (never leaves the device).
    sleepRows = []; dayRows = [];
    const first = quits.filter((q) => !q.archived).map((q) => q.started_on).sort()[0];
    if (first) {
      try { const { data, error } = await fitSb.from('garmin_sleep').select('day,sleep_s,hrv_last_night').eq('user_id', store.userId()).gte('day', floorDate(first)).limit(2000); if (!error && data) sleepRows = data; } catch (_) { /* no Garmin, no sleep comparison */ }
      try { const { data, error } = await fitSb.from('garmin_days').select('day,avg_stress,resting_hr').eq('user_id', store.userId()).gte('day', addDaysIso(floorDate(first), -1)).limit(2000); if (!error && data) dayRows = data; } catch (_) { /* no Garmin, no body comparison */ }
    }
    if (!quits.length) adding = true;
  }

  const slipsOf = (q) => slipsBy[q.id] || [];

  // Reasons and quotes: the original "why" plus any you add. The card shows one a day, the craving timer shows them all.
  const readingOf = (q) => readingList(q.why, reasonsBy[q.id]);
  const whyHtml = (q) => { const p = pickToday(readingOf(q), today, seedOf(q.id)); return p ? `<p class="why">${esc(formatReason(p))}</p>` : ''; };
  const craveReasons = (q) => { const list = readingOf(q).slice(0, 6); return list.length ? `<ul class="whylist">${list.map((p) => `<li class="why">${esc(formatReason(p))}</li>`).join('')}</ul>` : ''; };
  const reasonsPanel = (q) => { const list = readingOf(q);
    return `<details class="drop" data-k="rs-${q.id}"><summary>Reasons and quotes (${list.length})</summary>
      ${list.length ? list.map((p) => `<div class="row"><span class="rt"><span class="rtitle why">${esc(formatReason(p))}</span>${p.id ? '' : '<span class="hint">Your main reason. Change it in Edit.</span>'}</span>${p.id ? `<button class="btn sm ghost" data-act="reasondel" data-id="${p.id}" aria-label="Delete this reason">×</button>` : ''}</div>`).join('') : '<p class="hint">Nothing yet. Add why you are doing this, or a line that hits you.</p>'}
      <form class="add wrapf" data-act="reasonadd" data-id="${q.id}">
        <select class="field" name="kind" aria-label="Type"><option value="reason">Reason</option><option value="quote">Quote</option></select>
        <input class="field" name="body" required maxlength="${MAX_LEN}" placeholder="Why you are doing this, or a line that hits you" aria-label="Reason or quote" style="flex:1 1 220px">
        <input class="field" name="source" maxlength="${MAX_SOURCE}" placeholder="Who said it (quotes, optional)" aria-label="Who said it">
        <button class="btn">Add</button></form>
      <p class="hint">One shows on the card each day, and all of them appear when you start the craving timer.</p></details>`; };

  function cardHtml(q){
    const info = streakInfo(q, slipsOf(q), today);
    const goal = q.target_days && q.target_days > 0 ? q.target_days : null;
    const toGo = goal ? Math.max(0, goal - info.current) : info.next ? info.next - info.current : null;
    const pct = goal ? 100 * Math.min(info.current, goal) / goal : info.next ? 100 * (info.current - info.prev) / (info.next - info.prev) : 100;
    const nextText = goal ? (info.current >= goal ? `Goal of ${goal} days reached` : `${toGo} day${toGo === 1 ? '' : 's'} to your ${goal}-day goal`)
      : info.next ? `${toGo} day${toGo === 1 ? '' : 's'} to ${milestoneLabel(info.next)}` : 'Past every milestone';
    const trig = topTrigger(slipsOf(q));
    const mine = slipsOf(q);
    const cr = cravBy[q.id] || [], beaten = cr.filter((c) => c.outcome === 'held').length;
    const plans = q.plans || {};
    const planRows = Object.entries(plans).filter(([, t]) => t);
    const live = craving && craving.id === q.id ? craving : null;
    const pat = mine.length >= 3 ? slipPatterns(mine, sleepRows, q.started_on, today, dayRows) : null;
    const patterns = pat ? (() => {
      const max = Math.max(...pat.byDow, 1), order = [1, 2, 3, 4, 5, 6, 0], letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      const sl = pat.sleep;
      return `<details class="drop" data-k="p-${q.id}"><summary>Patterns</summary>
        <div class="dowbars" role="img" aria-label="Slips by weekday">${order.map((d) => `<span class="dowcol"><i style="height:${Math.round(100 * pat.byDow[d] / max)}%"></i><em>${pat.byDow[d] || ''}</em><b>${letters[d]}</b></span>`).join('')}</div>
        <p>${pat.topDow ? `Most slips are on ${pat.topDow.name}s (${pat.topDow.n} of ${pat.n}).` : 'No single weekday stands out.'}${pat.topPart ? ` Mostly ${PART_WORDS[pat.topPart.name]}.` : ''}</p>
        ${sl ? `<p>You had slept <b>${sl.slipH}h</b> before slip days, against ${sl.otherH}h on other days${sl.slipHrv != null && sl.otherHrv != null ? `, and your HRV was ${sl.slipHrv} against ${sl.otherHrv}` : ''}. ${sl.slipH + 0.5 <= sl.otherH ? 'Bad sleep is a weak spot. Protect it.' : 'Sleep does not explain it.'}${sl.small ? ' Small sample: treat it as a hint, not a fact.' : ''}</p>` : '<p class="hint">Sleep comparison appears once Garmin has enough nights around your slips.</p>'}
        ${pat.body ? bodyLine(pat.body) : ''}
        <p class="hint">A pattern, not a cause. Use it to plan the risky hour, not to excuse it.</p></details>`;
    })() : '';
    const cravePanel = live ? `<div class="craving" id="cravepanel"><p class="push">${esc(CRAVE_LINES[Math.floor(live.at / 60000) % CRAVE_LINES.length])}</p>
        <div class="countdown"><b id="cd">${clock(Math.max(0, CRAVE_MS - (Date.now() - live.at)))}</b><span id="cdmsg">Wait it out. It peaks, then it passes.</span></div>
        <div class="bar good"><span id="cdbar" style="width:${Math.min(100, 100 * (Date.now() - live.at) / CRAVE_MS)}%"></span></div>
        ${craveReasons(q)}
        <p class="sub">What is it about?</p>
        <div class="seg">${TRIGGERS.map((t) => `<button type="button" class="${live.trigger === t ? 'on' : ''}" data-act="cravtrig" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        ${live.trigger ? (plans[live.trigger] ? `<p><b>Your plan:</b> ${esc(plans[live.trigger])}</p>` : '<p class="hint">No plan for this one yet. Make one after: Edit, then If-then plans.</p>')
          : planRows.length ? `<p class="hint">${planRows.map(([t, p]) => `<b>${esc(t)}:</b> ${esc(p)}`).join(' · ')}</p>` : ''}
        <div class="btns"><button class="btn pri" data-act="cravheld" data-id="${q.id}">I held</button><button class="btn" data-act="cravslip" data-id="${q.id}">I slipped</button><button class="btn ghost" data-act="cravcancel">Cancel</button></div></div>` : '';
    const form = openSlip === q.id ? `<form class="slipform stack" data-act="slipsave" data-id="${q.id}">
        <p class="hint">Log it straight. What set it off, and what will you do differently next time?</p>
        <div class="wrapf"><label class="lab">When<input class="field" type="date" name="slip_date" required min="${q.started_on}" max="${today}" value="${today}"></label>
          <label class="lab">Roughly what time? (optional)<select class="field" name="slip_part">${options(PARTS.map((t) => [t, t]), null, 'Not sure')}</select></label>
          <label class="lab">What set it off? (optional)<select class="field" name="trigger">${options(TRIGGERS.map((t) => [t, t]), slipTrigger || null, 'Rather not say')}</select></label></div>
        <label class="lab">Anything to remember? (optional)<textarea class="field" rows="2" name="note"></textarea></label>
        <div class="btns"><button class="btn pri">Log it</button><button type="button" class="btn" data-act="slipcancel">Cancel</button></div></form>` : '';
    const history = mine.length ? `<details class="drop" data-k="h-${q.id}"><summary>Slips (${mine.length})</summary>${mine.map((s) => `<div class="row"><span class="rt"><span class="rtitle">${formatDateShort(s.slip_date)}${s.slip_part ? ` · ${esc(s.slip_part.toLowerCase())}` : ''}${s.trigger ? ` · ${esc(s.trigger)}` : ''}</span>${s.note ? `<span class="hint">${esc(s.note)}</span>` : ''}</span>
        <button class="btn sm ghost" data-act="slipdel" data-id="${s.id}" aria-label="Delete this slip">×</button></div>`).join('')}
        ${trig ? `<p class="hint">Most common trigger so far: ${esc(trig.name)} (${trig.n} times). Knowing it makes it easier to plan for.</p>` : ''}</details>` : '';
    const pending = info.upcoming > 0;
    const when = pending ? (info.upcoming === 1 ? 'tomorrow' : `in ${info.upcoming} days`) : '';
    if (pending) return `<section class="panel quitcard" id="q-${q.id}">
      <h2>${esc(q.name)} <small>starts ${formatDateShort(q.started_on)}</small></h2>
      <div class="stats"><div><b class="big">${info.upcoming}</b><span>day${info.upcoming === 1 ? '' : 's'} until you start</span></div></div>
      <p class="push">Starts ${when}. Use the time: get it out of reach, tell someone, and write your if-then plans.</p>
      ${whyHtml(q)}
      <div class="btns"><button class="btn ghost" data-act="edit" data-id="${q.id}">Edit</button><button class="btn ghost" data-act="archive" data-id="${q.id}">Stop tracking</button></div>
      ${planRows.length ? `<details class="drop" data-k="pl-${q.id}"><summary>Your if-then plans (${planRows.length})</summary>${planRows.map(([t, p]) => `<div class="row"><span class="rt"><span class="rtitle">If ${esc(t.toLowerCase())}</span><span>then ${esc(p)}</span></span></div>`).join('')}</details>` : ''}
      ${reasonsPanel(q)}</section>`;
    return `<section class="panel quitcard" id="q-${q.id}">
      <h2>${esc(q.name)} <small>since ${formatDateShort(q.started_on)}${info.slipDays ? `, last slip ${formatDateShort(info.lastSlip)}` : ''}</small></h2>
      <div class="stats"><div><b class="big">${info.current}</b><span>${info.current === 1 ? 'day' : 'days'} since${info.current === 0 ? ' (day zero)' : ''}</span></div>
        <div><b class="big">${info.longest}</b><span>best run</span></div>
        <div><b class="big">${info.clean30}<small>/${info.span30}</small></b><span>clean days, last 30</span></div>
        <div><b class="big">${info.slips}</b><span>slip${info.slips === 1 ? '' : 's'} in total</span></div>
        ${cr.length ? `<div><b class="big">${beaten}<small>/${cr.length}</small></b><span>cravings beaten</span></div>` : ''}</div>
      ${bar(pct, null, 'good')}<p class="hint">${nextText}</p>
      <p class="push">${esc(pushLine(info.current, today))}</p>
      ${whyHtml(q)}
      ${cravePanel}${form}
      ${openSlip === q.id || live ? '' : `<div class="btns"><button class="btn pri" data-act="cravstart" data-id="${q.id}">I have a craving</button><button class="btn" data-act="slipopen" data-id="${q.id}">I slipped</button><button class="btn ghost" data-act="edit" data-id="${q.id}">Edit</button><button class="btn ghost" data-act="archive" data-id="${q.id}">Stop tracking</button></div>`}
      ${planRows.length ? `<details class="drop" data-k="pl-${q.id}"><summary>Your if-then plans (${planRows.length})</summary>${planRows.map(([t, p]) => `<div class="row"><span class="rt"><span class="rtitle">If ${esc(t.toLowerCase())}</span><span>then ${esc(p)}</span></span></div>`).join('')}</details>` : ''}
      ${reasonsPanel(q)}${patterns}${history}</section>`;
  }

  function formHtml(q){
    const v = q || { started_on: today, show_today: true, target_days: '', alias: '', why: '', name: '' };
    return `<section class="panel"><h2>${q ? `Edit ${esc(q.name)}` : 'Give something up'}</h2>
      <form class="stack" data-act="quitsave" data-id="${q ? q.id : ''}">
        <div class="wrapf"><label class="lab" style="flex:1 1 180px">What are you giving up?<input class="field" name="name" required value="${esc(v.name)}" placeholder="e.g. Alcohol"></label>
          <label class="lab">Start date<input class="field" type="date" name="started_on" required min="${LIFE_START}" value="${v.started_on < LIFE_START ? (today < LIFE_START ? LIFE_START : today) : v.started_on}"></label>
          <label class="lab">Goal in days (optional)<input class="field" style="width:9em" type="number" min="1" max="3650" name="target_days" value="${v.target_days || ''}"></label></div>
        <label class="lab">Why it matters to you (optional)<input class="field" name="why" value="${esc(v.why)}" placeholder="A line you'll want to read on a hard day"></label>
        <div class="wrapf"><label class="check"><input type="checkbox" name="show_today" ${v.show_today ? 'checked' : ''}> Show on Today</label>
          <label class="lab" style="flex:1 1 200px">Show on Today as (optional)<input class="field" name="alias" value="${esc(v.alias)}" placeholder="a different word, so it's discreet"></label></div>
        <details class="drop" data-k="plans"><summary>If-then plans (optional)</summary>
          <p class="hint">Decide now what you will do when it hits. Short and specific beats clever.</p>
          ${TRIGGERS.map((t, i) => `<label class="lab">If it is ${esc(t.toLowerCase())}, then I will…<input class="field" name="plan_${i}" maxlength="140" value="${esc((v.plans || {})[t] || '')}" placeholder="e.g. walk round the block, no shop, no phone"></label>`).join('')}</details>
        <p class="hint">Starting later? Pick a future date and it waits, then counts from that day. Already stopped? Use the past date you really stopped. Nothing here is ever sent in a notification.</p>
        <div class="btns"><button class="btn pri">${q ? 'Save' : 'Start tracking'}</button>${q || quits.length ? '<button type="button" class="btn" data-act="cancel">Cancel</button>' : ''}</div></form></section>`;
  }

  function draw(){
    const wasOpen = new Set(Array.from(root.querySelectorAll('details[open]')).map((d) => d.dataset.k)); // keep sections open across redraws
    const live = quits.filter((q) => !q.archived), stopped = quits.filter((q) => q.archived);
    const editQ = editing ? quits.find((q) => q.id === editing) : null;
    root.innerHTML = `<section class="panel"><h2>Giving up <small>Private to you</small></h2>
        <p class="hint">Days since, your best run, and an honest log of slips. A slip restarts the count; your best run stays as the number to beat. The name can be hidden on Today, and nothing here appears in notifications.</p>
        ${editQ || adding ? '' : '<div class="btns"><button class="btn pri" data-act="add">Give something up</button></div>'}</section>
      ${editQ ? formHtml(editQ) : adding ? formHtml(null) : ''}
      ${live.map(cardHtml).join('')}
      ${stopped.length ? `<section class="panel"><h2>Stopped tracking <small>${stopped.length}</small></h2>${stopped.map((q) => `<div class="row"><span class="rt"><span class="rtitle">${esc(q.name)}</span><span class="rmeta">since ${formatDateShort(q.started_on)} · ${slipsOf(q).length} slip${slipsOf(q).length === 1 ? '' : 's'}</span></span>
        <span class="step"><button class="btn sm" data-act="restore" data-id="${q.id}">Restore</button>${confirmDelete === q.id ? `<button class="btn sm" data-act="deleteyes" data-id="${q.id}">Delete everything, for good</button><button class="btn sm ghost" data-act="deleteno">Keep</button>` : `<button class="btn sm ghost" data-act="deleteask" data-id="${q.id}">Delete</button>`}</span></div>`).join('')}</section>` : ''}
      <section class="panel"><details class="drop" data-k="support"><summary>If it gets hard</summary>
        <p class="hint">Cravings peak and pass in 20 to 30 minutes. Do not negotiate with it. Leave the room, do something else, wait it out.</p></details></section>`;
    root.querySelectorAll('details').forEach((d) => { if (wasOpen.has(d.dataset.k)) d.open = true; });
    clearInterval(timer);
    if (craving) { timer = setInterval(tick, 1000); tick(); }
    if (openSlip) { const el = root.querySelector(`#q-${openSlip}`); if (el && params[0]) el.scrollIntoView({ block: 'start' }); }
  }

  function tick(){
    if (!root.isConnected) { clearInterval(timer); return; }
    if (!craving) return;
    const gone = Date.now() - craving.at, left = Math.max(0, CRAVE_MS - gone);
    const cd = root.querySelector('#cd'), b = root.querySelector('#cdbar'), msg = root.querySelector('#cdmsg');
    if (cd) cd.textContent = clock(left);
    if (b) b.style.width = `${Math.min(100, 100 * gone / CRAVE_MS)}%`;
    if (msg && left === 0) msg.textContent = 'Twenty minutes. It has passed. Log that you held.';
  }
  const refresh = async () => { await load(); draw(); };
  wire(root, {
    add(){ adding = true; editing = null; draw(); },
    edit(n){ editing = n.dataset.id; adding = false; draw(); },
    cancel(){ editing = null; adding = false; draw(); },
    async quitsave(f){
      const v = formData(f);
      const plans = {}; TRIGGERS.forEach((t, i) => { const x = (v['plan_' + i] || '').trim(); if (x) plans[t] = x; });
      const row = { plans, name: v.name.trim(), started_on: v.started_on, target_days: v.target_days ? Math.max(1, Math.min(3650, Number(v.target_days))) : null, why: v.why.trim(), show_today: !!v.show_today, alias: v.alias.trim() };
      if (f.dataset.id) await store.quits.set(f.dataset.id, row); else await store.quits.add(row);
      toast(f.dataset.id ? 'Saved' : row.started_on > today ? `Set. It starts ${formatDateShort(row.started_on)}.` : 'Started. One day at a time.');
      editing = null; adding = false;
      await refresh();
    },
    slipopen(n){ openSlip = n.dataset.id; slipTrigger = ''; draw(); },
    slipcancel(){ openSlip = null; slipTrigger = ''; draw(); },
    cravstart(n){ craving = { id: n.dataset.id, at: Date.now(), trigger: '' }; saveCraving(craving); draw(); },
    cravtrig(n){ craving = { ...craving, trigger: craving.trigger === n.dataset.t ? '' : n.dataset.t }; saveCraving(craving); draw(); },
    cravcancel(){ craving = null; saveCraving(null); draw(); },
    async cravheld(n){
      const c = craving; craving = null; saveCraving(null);
      await store.quitCravings.add({ quit_id: n.dataset.id, outcome: 'held', trigger: c.trigger || '', started_at: new Date(c.at).toISOString() });
      await load();
      const beaten = (cravBy[n.dataset.id] || []).filter((x) => x.outcome === 'held').length;
      toast(`Held. That is ${beaten} craving${beaten === 1 ? '' : 's'} beaten. Do it again next time.`);
      draw();
    },
    async cravslip(n){
      const c = craving; craving = null; saveCraving(null);
      await store.quitCravings.add({ quit_id: n.dataset.id, outcome: 'slipped', trigger: c.trigger || '', started_at: new Date(c.at).toISOString() });
      openSlip = n.dataset.id; slipTrigger = c.trigger || '';
      await refresh();
    },
    async slipsave(f){
      const q = quits.find((x) => x.id === f.dataset.id), v = formData(f);
      if (v.slip_date > today || v.slip_date < q.started_on) { toast('Pick a date between your quit date and today.'); return; }
      const before = streakInfo(q, slipsOf(q), today);
      await store.quitSlips.add({ quit_id: q.id, slip_date: v.slip_date, slip_part: v.slip_part || '', trigger: v.trigger || '', note: (v.note || '').trim() });
      const ran = before.runBefore(v.slip_date);
      toast(ran > 0 ? `Logged. ${ran} day${ran === 1 ? '' : 's'}, thrown away. Your best run stands, so beat it. Day zero starts now. Do not make it two.` : 'Logged. Day zero starts now. Do not make it two.');
      openSlip = null; slipTrigger = '';
      await refresh();
    },
    async reasonadd(f){
      const row = cleanReason(formData(f));
      if (!row) return;
      await store.quitReasons.add({ quit_id: f.dataset.id, ...row });
      toast('Added');
      await refresh();
    },
    async reasondel(n){ await store.quitReasons.del(n.dataset.id); toast('Removed'); await refresh(); },
    async slipdel(n){ await store.quitSlips.del(n.dataset.id); toast('Removed'); await refresh(); },
    async archive(n){ await store.quits.set(n.dataset.id, { archived: true }); toast('Stopped tracking. You can restore it any time.'); await refresh(); },
    async restore(n){ await store.quits.set(n.dataset.id, { archived: false }); await refresh(); },
    deleteask(n){ confirmDelete = n.dataset.id; draw(); },
    deleteno(){ confirmDelete = null; draw(); },
    async deleteyes(n){ await store.quits.del(n.dataset.id); confirmDelete = null; toast('Deleted'); await refresh(); }
  });
  await refresh();
}
