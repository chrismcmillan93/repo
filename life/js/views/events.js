// Trips, events, renewals and birthdays with countdowns. Races come straight from
// the Fitness app's plan (read-only here), so a race never has to be typed twice.
import * as store from '../store.js';
import { esc, pill, wire, formData, empty, options } from '../ui.js';
import { todayStr, daysUntil, formatDateShort, parseLocalDate, toDateInputValue } from '../fit/utils.js';
import { db } from '../fit/db.js';

const KIND = { trip: 'Trip', event: 'Event', renewal: 'Renewal', birthday: 'Birthday', race: 'Race' };

function nextYearly(date, today){
  const d = parseLocalDate(date), t = parseLocalDate(today);
  let next = new Date(t.getFullYear(), d.getMonth(), d.getDate());
  if (toDateInputValue(next) < today) next = new Date(t.getFullYear() + 1, d.getMonth(), d.getDate());
  return toDateInputValue(next);
}

// Everything still ahead (or happening now), soonest first.
export async function loadCountdowns(){
  const today = todayStr();
  const [own, races] = await Promise.all([store.events.list(), db.races.list('v2').catch(() => [])]);
  const rows = own.map((e) => {
    const date = e.repeats_yearly ? nextYearly(e.start_date, today) : e.start_date;
    return { id: e.id, own: true, title: e.title, kind: e.kind, date, end: e.repeats_yearly ? null : e.end_date, note: e.note, yearly: e.repeats_yearly };
  }).concat(races.map((r) => ({ id: r.id, own: false, title: r.name, kind: 'race', date: r.race_date, end: null, note: r.distance_label || '' })));
  return rows.filter((e) => (e.end || e.date) >= today).map((e) => ({ ...e, days: daysUntil(e.date) })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function countdownRow(e, tools = ''){
  const now = e.days <= 0;
  const range = e.end && e.end !== e.date ? `${formatDateShort(e.date)} to ${formatDateShort(e.end)}` : formatDateShort(e.date);
  return `<div class="row"><span class="rt"><span class="rtitle">${esc(e.title)}</span><span class="rmeta">${pill(KIND[e.kind] || e.kind, e.kind === 'trip' ? 'goal' : '')}<span>${range}</span>${e.yearly ? '<span>every year</span>' : ''}${e.note ? `<span>${esc(e.note)}</span>` : ''}</span></span>
    <span class="right count ${e.days <= 14 && !now ? 'soon' : ''}">${now ? (e.end && e.end > todayStr() ? '<b>On now</b>' : '<b>Today</b>') : `<b>${e.days}</b> day${e.days === 1 ? '' : 's'}`}</span>${tools}</div>`;
}

export async function render(root){
  let rows = [];
  const draw = () => {
    const del = (e) => (e.own ? `<button class="btn sm ghost" data-act="del" data-id="${e.id}" aria-label="Delete">×</button>` : '');
    const sec = (title, kinds, hint) => { const list = rows.filter((e) => kinds.includes(e.kind));
      return `<section class="panel"><h2>${title}</h2>${list.length ? list.map((e) => countdownRow(e, del(e))).join('') : empty(hint)}</section>`; };
    root.innerHTML = `<section class="panel"><h2>Add a trip, event, renewal or birthday</h2>
      <form class="add wrapf" data-act="add"><input class="field" name="title" placeholder="e.g. USA trip" required aria-label="Title">
        <select class="field" name="kind" aria-label="Type">${options([['trip', 'Trip'], ['event', 'Event'], ['renewal', 'Renewal'], ['birthday', 'Birthday']])}</select>
        <label class="lab">Date<input class="field" type="date" name="start_date" required></label><label class="lab">Ends (optional)<input class="field" type="date" name="end_date"></label>
        <input class="field" name="note" placeholder="Note (optional)" aria-label="Note"><button class="btn pri">Add</button></form>
      <p class="hint">Birthdays repeat every year. Races are read from your training plan.</p></section>
      <div class="cols"><div class="stack">${sec('Trips, events and races', ['trip', 'event', 'race'], 'Nothing ahead yet.')}</div>
      <div class="stack">${sec('Renewals', ['renewal'], 'Add things like car insurance, MOT or passport expiry.')}${sec('Birthdays', ['birthday'], 'No birthdays added.')}</div></div>`;
  };
  const refresh = async () => { rows = await loadCountdowns(); draw(); };
  wire(root, {
    async add(f){
      const v = formData(f);
      await store.events.add({ title: v.title.trim(), kind: v.kind, start_date: v.start_date, end_date: v.end_date || null, note: v.note.trim(), repeats_yearly: v.kind === 'birthday' });
      await refresh();
    },
    async del(n){ await store.events.del(n.dataset.id); await refresh(); }
  });
  await refresh();
}
