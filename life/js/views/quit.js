// Giving up: things you've stopped, with days since, your best run and a log of slips.
// A slip restarts the current count but never erases the run before it (see streaks.js).
// Private by design: nothing here is in notifications, a name can be shown on Today as
// something else (or not at all), and the offline copy is not kept (sw.js).
import * as store from '../store.js';
import { esc, bar, pill, wire, formData, empty, options } from '../ui.js';
import { todayStr, formatDateShort, toast } from '../fit/utils.js';
import { streakInfo, topTrigger, milestoneLabel } from '../streaks.js';

const TRIGGERS = ['Stress', 'Boredom', 'Tired', 'Lonely', 'Social pressure', 'Celebrating', 'Craving', 'Other'];

export async function render(root, params){
  const today = todayStr();
  let quits = [], slipsBy = {}, openSlip = params[0] || null, editing = null, adding = false, confirmDelete = null;

  async function load(){
    quits = await store.quits.list((q) => q.order('created_at'));
    const slips = quits.length ? await store.quitSlips.list((q) => q.order('slip_date', { ascending: false })) : [];
    slipsBy = {};
    slips.forEach((s) => { (slipsBy[s.quit_id] = slipsBy[s.quit_id] || []).push(s); });
    if (!quits.length) adding = true;
  }

  const slipsOf = (q) => slipsBy[q.id] || [];

  function cardHtml(q){
    const info = streakInfo(q, slipsOf(q), today);
    const goal = q.target_days && q.target_days > 0 ? q.target_days : null;
    const toGo = goal ? Math.max(0, goal - info.current) : info.next ? info.next - info.current : null;
    const pct = goal ? 100 * Math.min(info.current, goal) / goal : info.next ? 100 * (info.current - info.prev) / (info.next - info.prev) : 100;
    const nextText = goal ? (info.current >= goal ? `Goal of ${goal} days reached` : `${toGo} day${toGo === 1 ? '' : 's'} to your ${goal}-day goal`)
      : info.next ? `${toGo} day${toGo === 1 ? '' : 's'} to ${milestoneLabel(info.next)}` : 'Past every milestone';
    const trig = topTrigger(slipsOf(q));
    const mine = slipsOf(q);
    const form = openSlip === q.id ? `<form class="slipform stack" data-act="slipsave" data-id="${q.id}">
        <p class="hint">No judgement. Logging it keeps the picture honest, and the days before it still count.</p>
        <div class="wrapf"><label class="lab">When<input class="field" type="date" name="slip_date" required min="${q.started_on}" max="${today}" value="${today}"></label>
          <label class="lab">What set it off? (optional)<select class="field" name="trigger">${options(TRIGGERS.map((t) => [t, t]), null, 'Rather not say')}</select></label></div>
        <label class="lab">Anything to remember? (optional)<textarea class="field" rows="2" name="note"></textarea></label>
        <div class="btns"><button class="btn pri">Log it</button><button type="button" class="btn" data-act="slipcancel">Cancel</button></div></form>` : '';
    const history = mine.length ? `<details class="drop" data-k="h-${q.id}"><summary>Slips (${mine.length})</summary>${mine.map((s) => `<div class="row"><span class="rt"><span class="rtitle">${formatDateShort(s.slip_date)}${s.trigger ? ` · ${esc(s.trigger)}` : ''}</span>${s.note ? `<span class="hint">${esc(s.note)}</span>` : ''}</span>
        <button class="btn sm ghost" data-act="slipdel" data-id="${s.id}" aria-label="Delete this slip">×</button></div>`).join('')}
        ${trig ? `<p class="hint">Most common trigger so far: ${esc(trig.name)} (${trig.n} times). Knowing it makes it easier to plan for.</p>` : ''}</details>` : '';
    return `<section class="panel quitcard" id="q-${q.id}">
      <h2>${esc(q.name)} <small>since ${formatDateShort(q.started_on)}${info.slipDays ? `, last slip ${formatDateShort(info.lastSlip)}` : ''}</small></h2>
      <div class="stats"><div><b class="big">${info.current}</b><span>${info.current === 1 ? 'day' : 'days'} since${info.current === 0 ? ' (a fresh start today)' : ''}</span></div>
        <div><b class="big">${info.longest}</b><span>best run</span></div>
        <div><b class="big">${info.clean30}<small>/${info.span30}</small></b><span>clean days, last 30</span></div>
        <div><b class="big">${info.slips}</b><span>slip${info.slips === 1 ? '' : 's'} in total</span></div></div>
      ${bar(pct, null, 'good')}<p class="hint">${nextText}</p>
      ${q.why ? `<p class="why">“${esc(q.why)}”</p>` : ''}
      ${form}
      ${openSlip === q.id ? '' : `<div class="btns"><button class="btn" data-act="slipopen" data-id="${q.id}">I slipped</button><button class="btn ghost" data-act="edit" data-id="${q.id}">Edit</button><button class="btn ghost" data-act="archive" data-id="${q.id}">Stop tracking</button></div>`}
      ${history}</section>`;
  }

  function formHtml(q){
    const v = q || { started_on: today, show_today: true, target_days: '', alias: '', why: '', name: '' };
    return `<section class="panel"><h2>${q ? `Edit ${esc(q.name)}` : 'Give something up'}</h2>
      <form class="stack" data-act="quitsave" data-id="${q ? q.id : ''}">
        <div class="wrapf"><label class="lab" style="flex:1 1 180px">What are you giving up?<input class="field" name="name" required value="${esc(v.name)}" placeholder="e.g. Alcohol"></label>
          <label class="lab">Quit date<input class="field" type="date" name="started_on" required max="${today}" value="${v.started_on}"></label>
          <label class="lab">Goal in days (optional)<input class="field" style="width:9em" type="number" min="1" max="3650" name="target_days" value="${v.target_days || ''}"></label></div>
        <label class="lab">Why it matters to you (optional)<input class="field" name="why" value="${esc(v.why)}" placeholder="A line you'll want to read on a hard day"></label>
        <div class="wrapf"><label class="check"><input type="checkbox" name="show_today" ${v.show_today ? 'checked' : ''}> Show on Today</label>
          <label class="lab" style="flex:1 1 200px">Show on Today as (optional)<input class="field" name="alias" value="${esc(v.alias)}" placeholder="a different word, so it's discreet"></label></div>
        <p class="hint">If you started on a past date, use it: the count starts from the day you really stopped. Nothing here is ever sent in a notification.</p>
        <div class="btns"><button class="btn pri">${q ? 'Save' : 'Start tracking'}</button>${q || quits.length ? '<button type="button" class="btn" data-act="cancel">Cancel</button>' : ''}</div></form></section>`;
  }

  function draw(){
    const wasOpen = new Set(Array.from(root.querySelectorAll('details[open]')).map((d) => d.dataset.k)); // keep sections open across redraws
    const live = quits.filter((q) => !q.archived), stopped = quits.filter((q) => q.archived);
    const editQ = editing ? quits.find((q) => q.id === editing) : null;
    root.innerHTML = `<section class="panel"><h2>Giving up <small>Private to you</small></h2>
        <p class="hint">Days since, your best run, and a place to log slips honestly. A slip restarts the count but doesn't erase the run before it. The name can be hidden on Today, and nothing here appears in notifications.</p>
        ${editQ || adding ? '' : '<div class="btns"><button class="btn pri" data-act="add">Give something up</button></div>'}</section>
      ${editQ ? formHtml(editQ) : adding ? formHtml(null) : ''}
      ${live.map(cardHtml).join('')}
      ${stopped.length ? `<section class="panel"><h2>Stopped tracking <small>${stopped.length}</small></h2>${stopped.map((q) => `<div class="row"><span class="rt"><span class="rtitle">${esc(q.name)}</span><span class="rmeta">since ${formatDateShort(q.started_on)} · ${slipsOf(q).length} slip${slipsOf(q).length === 1 ? '' : 's'}</span></span>
        <span class="step"><button class="btn sm" data-act="restore" data-id="${q.id}">Restore</button>${confirmDelete === q.id ? `<button class="btn sm" data-act="deleteyes" data-id="${q.id}">Delete everything, for good</button><button class="btn sm ghost" data-act="deleteno">Keep</button>` : `<button class="btn sm ghost" data-act="deleteask" data-id="${q.id}">Delete</button>`}</span></div>`).join('')}</section>` : ''}
      <section class="panel"><details class="drop" data-k="support"><summary>If it gets hard</summary>
        <p class="hint">Cravings pass, usually within 20 to 30 minutes. Delay, drink some water, change room, message someone. If you're struggling, these are free and confidential in the UK:</p>
        <ul class="steps"><li><b>Drinkline</b> (alcohol): 0300 123 1110</li><li><b>FRANK</b> (drugs): 0300 123 6600</li><li><b>Samaritans</b> (any time, 24 hours): 116 123</li></ul>
        <p class="hint">Stopping alcohol or some drugs suddenly after heavy use can be medically risky. Talk to a GP or one of these services first.</p></details></section>`;
    root.querySelectorAll('details').forEach((d) => { if (wasOpen.has(d.dataset.k)) d.open = true; });
    if (openSlip) { const el = root.querySelector(`#q-${openSlip}`); if (el && params[0]) el.scrollIntoView({ block: 'start' }); }
  }

  const refresh = async () => { await load(); draw(); };
  wire(root, {
    add(){ adding = true; editing = null; draw(); },
    edit(n){ editing = n.dataset.id; adding = false; draw(); },
    cancel(){ editing = null; adding = false; draw(); },
    async quitsave(f){
      const v = formData(f);
      const row = { name: v.name.trim(), started_on: v.started_on, target_days: v.target_days ? Math.max(1, Math.min(3650, Number(v.target_days))) : null, why: v.why.trim(), show_today: !!v.show_today, alias: v.alias.trim() };
      if (row.started_on > today) { toast('The quit date can\'t be in the future.'); return; }
      if (f.dataset.id) await store.quits.set(f.dataset.id, row); else await store.quits.add(row);
      toast(f.dataset.id ? 'Saved' : 'Started. One day at a time.');
      editing = null; adding = false;
      await refresh();
    },
    slipopen(n){ openSlip = n.dataset.id; draw(); },
    slipcancel(){ openSlip = null; draw(); },
    async slipsave(f){
      const q = quits.find((x) => x.id === f.dataset.id), v = formData(f);
      if (v.slip_date > today || v.slip_date < q.started_on) { toast('Pick a date between your quit date and today.'); return; }
      const before = streakInfo(q, slipsOf(q), today);
      await store.quitSlips.add({ quit_id: q.id, slip_date: v.slip_date, trigger: v.trigger || '', note: (v.note || '').trim() });
      const ran = before.runBefore(v.slip_date);
      toast(ran > 0 ? `Logged. The ${ran} day${ran === 1 ? '' : 's'} before it still count. Today is a fresh start.` : 'Logged. Today is a fresh start.');
      openSlip = null;
      await refresh();
    },
    async slipdel(n){ await store.quitSlips.del(n.dataset.id); toast('Removed'); await refresh(); },
    async archive(n){ await store.quits.set(n.dataset.id, { archived: true }); toast('Stopped tracking. You can restore it any time.'); await refresh(); },
    async restore(n){ await store.quits.set(n.dataset.id, { archived: false }); await refresh(); },
    deleteask(n){ confirmDelete = n.dataset.id; draw(); },
    deleteno(){ confirmDelete = null; draw(); },
    async deleteyes(n){ await store.quits.del(n.dataset.id); confirmDelete = null; toast('Deleted'); await refresh(); }
  });
  await refresh();
}
