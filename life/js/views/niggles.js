// Niggles (under Health): aches and tweaks while training, one row each, with a log of how
// they change and blunt advice on when to get them looked at (see niggle.js). Today nudges
// when one has lasted or worsened too far.
import * as store from '../store.js';
import { esc, pill, wire, formData, empty, options } from '../ui.js';
import { todayStr, formatDateShort, toast } from '../fit/utils.js';
import { niggleAdvice, AREAS, SEVERITY } from '../niggle.js';

const SEV = Object.fromEntries(SEVERITY);

export async function renderNiggles(body){
  const today = todayStr();
  let list = [];
  const refresh = async () => { list = await store.niggles.list((q) => q.order('started_on', { ascending: false })); draw(); };

  function draw(){
    const active = list.filter((n) => !n.resolved_on), done = list.filter((n) => n.resolved_on).slice(0, 8);
    const sevClass = (s) => (s >= 4 ? 'bad' : s === 3 ? 'warn' : '');
    const card = (n) => { const a = niggleAdvice(n, today), hist = Array.isArray(n.history) ? n.history : [];
      return `<section class="panel"><h2>${esc(n.area)} <small>day ${a.days + 1}, since ${formatDateShort(n.started_on)}</small></h2>
        <div class="rmeta" style="font-size:14px">${pill(`${n.severity} of 5: ${SEV[n.severity]}`, sevClass(n.severity))}${n.note ? `<span>${esc(n.note)}</span>` : ''}</div>
        ${a.level ? `<div class="nudge ${a.level === 'stop' ? '' : 'warn'}"><p>${esc(a.text)}</p></div>` : ''}
        <form class="add wrapf" data-act="nigglelog" data-id="${n.id}"><label class="lab">How is it now?<select class="field" name="severity">${options(SEVERITY, n.severity)}</select></label>
          <input class="field" name="note" placeholder="What changed? (optional)" aria-label="Note"><button class="btn">Log it</button><button type="button" class="btn ghost" data-act="niggleresolve" data-id="${n.id}">It's gone</button></form>
        ${hist.length ? `<details class="drop" data-k="nh-${n.id}"><summary>History (${hist.length})</summary>${hist.slice().reverse().map((h) => `<div class="row"><span class="rt"><span class="rtitle">${formatDateShort(h.date)}: ${h.severity === 0 ? 'resolved' : `${h.severity} of 5`}</span>${h.note ? `<span class="hint">${esc(h.note)}</span>` : ''}</span></div>`).join('')}</details>` : ''}</section>`; };
    body.innerHTML = `<section class="panel"><h2>Niggles <small>${active.length ? `${active.length} active` : 'None active'}</small></h2>
        <p class="hint">Log every ache the day you notice it, and how it changes. A week of Edale training is not worth a month on the sofa. This only says when it's time to get it looked at; it is not a diagnosis.</p>
        <form class="stack" data-act="niggleadd"><div class="wrapf"><label class="lab">Where?<select class="field" name="area">${options(AREAS.map((a) => [a, a]))}</select></label>
          <label class="lab">How bad?<select class="field" name="severity">${options(SEVERITY, 2)}</select></label>
          <label class="lab">Since<input class="field" type="date" name="started_on" max="${today}" value="${today}"></label></div>
          <input class="field" name="note" placeholder="What does it feel like, when? (optional)" aria-label="Note"><div class="btns"><button class="btn pri">Add</button></div></form></section>
      ${active.map(card).join('')}
      ${done.length ? `<section class="panel"><h2>Cleared <small>${done.length}</small></h2>${done.map((n) => `<div class="row"><span class="rt"><span class="rtitle">${esc(n.area)}</span><span class="rmeta"><span>${formatDateShort(n.started_on)} to ${formatDateShort(n.resolved_on)}</span></span></span><button class="btn sm ghost" data-act="niggleopen" data-id="${n.id}">Back again</button></div>`).join('')}</section>` : ''}`;
  }

  wire(body, {
    async niggleadd(f){
      const v = formData(f);
      await store.niggles.add({ area: v.area, severity: Number(v.severity), note: (v.note || '').trim(), started_on: v.started_on || today, history: [{ date: v.started_on || today, severity: Number(v.severity), note: (v.note || '').trim() }] });
      toast(`${v.area} logged. Watch it.`);
      await refresh();
    },
    async nigglelog(f){
      const n = list.find((x) => x.id === f.dataset.id), v = formData(f);
      const history = [...(n.history || []), { date: today, severity: Number(v.severity), note: (v.note || '').trim() }];
      await store.niggles.set(n.id, { severity: Number(v.severity), history });
      toast(Number(v.severity) > n.severity ? 'Worse. Do not ignore it.' : Number(v.severity) < n.severity ? 'Better. Stay careful.' : 'Logged.');
      await refresh();
    },
    async niggleresolve(n){
      const row = list.find((x) => x.id === n.dataset.id);
      await store.niggles.set(row.id, { resolved_on: today, history: [...(row.history || []), { date: today, severity: 0, note: 'Resolved' }] });
      toast(`${row.area} cleared after ${niggleAdvice(row, today).days} day${niggleAdvice(row, today).days === 1 ? '' : 's'}.`);
      await refresh();
    },
    async niggleopen(n){ await store.niggles.set(n.dataset.id, { resolved_on: null }); await refresh(); }
  });
  await refresh();
}
