// Trips, events, renewals, birthdays and races, with countdowns. Two tabs: Upcoming (everything ahead, add a race, log a
// result for a race that has happened) and Race results (finished races with their times, newest first).
// Races are `fitness.races`: your training plan's races (read-only) plus any you add (yours to delete). Booked is a per-race
// flag you set (`race_booked`); a result is free text (`race_results.finish_time_text`). See races.js for the rules.
import * as store from '../store.js';
import { esc, pill, wire, formData, empty, options } from '../ui.js';
import { todayStr, daysUntil, formatDateShort, parseLocalDate, toDateInputValue, toast } from '../fit/utils.js';
import { db } from '../fit/db.js';
import { cleanRace, cleanResult, raceState, resultText, MAX_NAME, MAX_DISTANCE, MAX_NOTE, MAX_TIME, MAX_RESULT_NOTE } from '../races.js';

const KIND = { trip: 'Trip', event: 'Event', renewal: 'Renewal', birthday: 'Birthday', race: 'Race' };

function nextYearly(date, today){
  const d = parseLocalDate(date), t = parseLocalDate(today);
  let next = new Date(t.getFullYear(), d.getMonth(), d.getDate());
  if (toDateInputValue(next) < today) next = new Date(t.getFullYear() + 1, d.getMonth(), d.getDate());
  return toDateInputValue(next);
}

// Races, your booked flags and your results, each soft-failing so a problem with one never blanks the screen.
async function loadRaceData(){
  const uid = store.userId();
  const [races, booked, results] = await Promise.all([db.races.list('v2').catch(() => []), db.raceBooked.list(uid).catch(() => []), db.raceResults.list(uid).catch(() => [])]);
  return { races, bookedBy: Object.fromEntries(booked.map((b) => [b.race_id, b.booked])), resultBy: Object.fromEntries(results.map((r) => [r.race_id, r])) };
}

// Everything still ahead (or happening now), soonest first. A race that already has a result is no longer "coming up".
export async function loadCountdowns(raceData){
  const today = todayStr();
  const [own, { races, bookedBy, resultBy }] = await Promise.all([store.events.list(), raceData || loadRaceData()]);
  const rows = own.map((e) => {
    const date = e.repeats_yearly ? nextYearly(e.start_date, today) : e.start_date;
    return { id: e.id, own: true, title: e.title, kind: e.kind, date, end: e.repeats_yearly ? null : e.end_date, note: e.note, yearly: e.repeats_yearly };
  }).concat(races.filter((r) => !resultBy[r.id]).map((r) => ({ id: r.id, own: false, mine: !!r.user_id, title: r.name, kind: 'race', date: r.race_date, end: null, note: r.distance_label || r.role || '', booked: raceState(r, bookedBy, resultBy, today).booked })));
  return rows.filter((e) => (e.end || e.date) >= today).map((e) => ({ ...e, days: daysUntil(e.date) })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function countdownRow(e, tools = ''){
  const now = e.days <= 0;
  const range = e.end && e.end !== e.date ? `${formatDateShort(e.date)} to ${formatDateShort(e.end)}` : formatDateShort(e.date);
  const booked = e.kind === 'race' ? pill(e.booked ? 'Booked' : 'Planned', e.booked ? 'good' : '') : '';
  return `<div class="row"><span class="rt"><span class="rtitle">${esc(e.title)}</span><span class="rmeta">${pill(KIND[e.kind] || e.kind, e.kind === 'trip' ? 'goal' : '')}${booked}<span>${range}</span>${e.yearly ? '<span>every year</span>' : ''}${e.note ? `<span>${esc(e.note)}</span>` : ''}</span></span>
    <span class="right count ${e.days <= 14 && !now ? 'soon' : ''}">${now ? (e.end && e.end > todayStr() ? '<b>On now</b>' : '<b>Today</b>') : `<b>${e.days}</b> day${e.days === 1 ? '' : 's'}`}</span>${tools}</div>`;
}

export async function render(root, params){
  const tab = params[0] === 'results' ? 'results' : 'upcoming';
  const today = todayStr();
  let rows = [], race = { races: [], bookedBy: {}, resultBy: {} }, editing = null;

  // The result form: a plain text box (any keyboard), and an optional note. `r` is an existing result to edit, or null.
  const resultForm = (rc, r) => `<form class="add wrapf" data-act="resultsave" data-id="${rc.id}">
      <label class="lab" style="flex:1 1 200px">Result time<input class="field" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" name="time" required maxlength="${MAX_TIME}" placeholder="e.g. 52:14 or 1h 52m" value="${esc(resultText(r))}"></label>
      <label class="lab" style="flex:2 1 220px">Notes (optional)<input class="field" type="text" name="notes" maxlength="${MAX_RESULT_NOTE}" placeholder="Position, conditions, how it felt" value="${esc((r && r.notes) || '')}"></label>
      <button class="btn pri">Save result</button>${r ? '<button type="button" class="btn" data-act="resultcancel">Cancel</button>' : ''}</form>`;

  const tabs = () => `<div class="seg sm"><a class="${tab === 'upcoming' ? 'on' : ''}" href="#/events">Upcoming</a><a class="${tab === 'results' ? 'on' : ''}" href="#/events/results">Race results (${Object.keys(race.resultBy).length})</a></div>`;

  const upcoming = () => {
    const raceTools = (e) => `<button class="btn sm ${e.booked ? '' : 'ghost'}" data-act="booked" data-id="${e.id}" data-v="${e.booked ? '0' : '1'}" aria-pressed="${e.booked}" title="${e.booked ? 'Tap to mark as only planned' : 'Tap to mark as booked'}">${e.booked ? 'Booked ✓' : 'Mark booked'}</button>${e.mine ? `<button class="btn sm ghost" data-act="delrace" data-id="${e.id}" aria-label="Delete this race">×</button>` : ''}`;
    const tools = (e) => (e.kind === 'race' ? raceTools(e) : e.own ? `<button class="btn sm ghost" data-act="del" data-id="${e.id}" aria-label="Delete">×</button>` : '');
    // Races that have happened (or are today) and have no result yet: log it here and it moves to Race results.
    const toLog = race.races.filter((r) => raceState(r, race.bookedBy, race.resultBy, today).needsResult).sort((a, b) => (a.race_date < b.race_date ? 1 : -1));
    const logPanel = toLog.length ? `<section class="panel"><h2>Races to log <small>Add the result and it moves to Race results</small></h2>${toLog.map((r) => `<div class="stack"><div class="row"><span class="rt"><span class="rtitle">${esc(r.name)}</span><span class="rmeta"><span>${formatDateShort(r.race_date)}</span>${r.distance_label ? `<span>${esc(r.distance_label)}</span>` : ''}</span></span></div>${resultForm(r, null)}</div>`).join('')}</section>` : '';
    const sec = (title, kinds, hint) => { const list = rows.filter((e) => kinds.includes(e.kind) && !(e.kind === 'race' && e.date <= today));
      return `<section class="panel"><h2>${title}</h2>${list.length ? list.map((e) => countdownRow(e, tools(e))).join('') : empty(hint)}</section>`; };
    return `${logPanel}<section class="panel"><h2>Add a race</h2>
      <form class="add wrapf" data-act="addrace"><input class="field" style="flex:1 1 100%" name="name" placeholder="e.g. Manchester 10k" required maxlength="${MAX_NAME}" aria-label="Race name">
        <label class="lab">Date<input class="field" type="date" name="date" required></label>
        <input class="field" style="flex:1 1 160px" name="distance" placeholder="Distance, e.g. 10K or Half" maxlength="${MAX_DISTANCE}" aria-label="Distance">
        <select class="field" name="booked" aria-label="Planned or booked">${options([['0', 'Planned'], ['1', 'Booked']])}</select>
        <input class="field" style="flex:1 1 160px" name="note" placeholder="Note (optional)" maxlength="${MAX_NOTE}" aria-label="Note"><button class="btn pri">Add race</button></form>
      <p class="hint">Planned means you mean to enter; Booked means you have a place. Your training plan's races are listed below and you can mark those booked too. A race you add yourself can be deleted.</p></section>
      <section class="panel"><h2>Add a trip, event, renewal or birthday</h2>
      <form class="add wrapf" data-act="add"><input class="field" name="title" placeholder="e.g. USA trip" required aria-label="Title">
        <select class="field" name="kind" aria-label="Type">${options([['trip', 'Trip'], ['event', 'Event'], ['renewal', 'Renewal'], ['birthday', 'Birthday']])}</select>
        <label class="lab">Date<input class="field" type="date" name="start_date" required></label><label class="lab">Ends (optional)<input class="field" type="date" name="end_date"></label>
        <input class="field" name="note" placeholder="Note (optional)" aria-label="Note"><button class="btn pri">Add</button></form>
      <p class="hint">Birthdays repeat every year.</p></section>
      <div class="cols"><div class="stack">${sec('Trips, events and races', ['trip', 'event', 'race'], 'Nothing ahead yet.')}</div>
      <div class="stack">${sec('Renewals', ['renewal'], 'Add things like car insurance, MOT or passport expiry.')}${sec('Birthdays', ['birthday'], 'No birthdays added.')}</div></div>`;
  };

  const results = () => {
    const done = race.races.filter((r) => race.resultBy[r.id]).sort((a, b) => (a.race_date < b.race_date ? 1 : -1));
    const row = (r) => { const res = race.resultBy[r.id];
      return `<div class="stack"><div class="row"><span class="rt"><span class="rtitle">${esc(r.name)}</span><span class="rmeta"><span>${formatDateShort(r.race_date)}</span>${r.distance_label ? `<span>${esc(r.distance_label)}</span>` : ''}</span>${res.notes ? `<span class="hint">${esc(res.notes)}</span>` : ''}</span>
        <span class="right"><b class="big">${esc(resultText(res))}</b></span>
        <button class="btn sm ghost" data-act="resultedit" data-id="${r.id}">Edit</button><button class="btn sm ghost" data-act="resultdel" data-id="${r.id}" aria-label="Remove this result">×</button></div>${editing === r.id ? resultForm(r, res) : ''}</div>`; };
    return `<section class="panel"><h2>Race results <small>${done.length} race${done.length === 1 ? '' : 's'} completed</small></h2>
      ${done.length ? done.map(row).join('') : empty('No results yet. When a race is over it appears under Upcoming with a box for your time; save it and it moves here.')}
      <p class="hint">Times are kept exactly as you type them. Removing a result sends the race back to "Races to log".</p></section>`;
  };

  const draw = () => { root.innerHTML = `<section class="panel">${tabs()}</section>${tab === 'results' ? results() : upcoming()}`; };
  const refresh = async () => { race = await loadRaceData(); rows = await loadCountdowns(race); draw(); };

  wire(root, {
    async add(f){
      const v = formData(f);
      await store.events.add({ title: v.title.trim(), kind: v.kind, start_date: v.start_date, end_date: v.end_date || null, note: v.note.trim(), repeats_yearly: v.kind === 'birthday' });
      await refresh();
    },
    async del(n){ await store.events.del(n.dataset.id); await refresh(); },
    async addrace(f){
      const v = formData(f), row = cleanRace(v);
      if (!row) { toast('Give the race a name and a date.'); return; }
      const created = await db.races.create(store.userId(), row);
      if (v.booked === '1') await db.raceBooked.set(store.userId(), created.id, true);
      toast(v.booked === '1' ? 'Race added as booked.' : 'Race added as planned.');
      await refresh();
    },
    async delrace(n){ await db.races.remove(store.userId(), n.dataset.id); toast('Race deleted'); await refresh(); },
    async booked(n){ await db.raceBooked.set(store.userId(), n.dataset.id, n.dataset.v === '1'); await refresh(); },
    async resultsave(f){
      const row = cleanResult(formData(f));
      if (!row) { toast('Type your time first.'); return; }
      await db.raceResults.upsert(store.userId(), f.dataset.id, row);
      toast(editing ? 'Result updated.' : 'Result saved. It is now under Race results.');
      editing = null;
      await refresh();
    },
    resultedit(n){ editing = n.dataset.id; draw(); },
    resultcancel(){ editing = null; draw(); },
    async resultdel(n){ await db.raceResults.remove(store.userId(), n.dataset.id); toast('Result removed. The race is back under Races to log.'); editing = null; await refresh(); }
  });
  await refresh();
}
