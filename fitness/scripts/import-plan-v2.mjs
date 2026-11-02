#!/usr/bin/env node
// Import the Edale 50km v2 training plan into the `fitness` schema.
//
//   node fitness/scripts/import-plan-v2.mjs --check            validate the JSON, print a summary
//   node fitness/scripts/import-plan-v2.mjs --part N > part.sql emit idempotent SQL part N (1..8); no --part = all parts
//
// This repo has no package.json and the app only ever writes through RLS, so
// the importer emits SQL rather than talking to Supabase itself: apply the
// output with the Supabase MCP `apply_migration` tool (or the CLI), the same
// way every other DDL/seed in this repo lands. Re-running is safe:
//   - plan_weeks / plan_days / lift_modes / lift_templates: upsert (plan_days on
//     plan_version + date + session). plan_days rows whose (date, session) no
//     longer appear in the JSON are removed first, so a corrected session name
//     replaces the old row instead of sitting beside it.
//   - lift_template_exercises: replaced wholesale per template.
//   - races: upsert only, NEVER deleted -- race_results (the user's logged
//     finish times) hang off them and cascade.
// Nothing here touches logged data.
//
// The Windmill 10k (8 Nov 2026) is in the JSON but deliberately skipped: it is
// before the plan starts and was ruled out of the app.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'data', 'edale-50km-training-plan-v2.json');
const SKIP_RACES = ['Windmill'];
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const plan = JSON.parse(readFileSync(SRC, 'utf8'));
const weeks = plan.weeks;
const days = weeks.flatMap((w) => w.days.map((d) => ({ ...d, week_number: w.week })));

function parseRace(r, i){
  const m = r.when.match(/(\d{1,2}) (\w{3}) (\d{4})/);
  if (!m) throw new Error(`Cannot parse race date: ${r.when}`);
  const date = `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const t = r.when.match(/\b(\d{2}:\d{2})\b/);
  return { race_date: date, start_time: t ? t[1] : null, name: r.name.replace(/\s*\(entered\)\s*$/, ''),
    role: r.role, status: r.booked ? 'entered' : 'planned', sort_order: i };
}
const races = plan.races.filter((r) => !SKIP_RACES.some((s) => r.name.includes(s))).map(parseRace);

// ---- validation -----------------------------------------------------------
function check(){
  const errs = [];
  const ok = (cond, msg) => { if (!cond) errs.push(msg); };
  ok(weeks.length === 42, `expected 42 weeks, got ${weeks.length}`);
  ok(days.length === 294, `expected 294 days, got ${days.length}`);
  ok(days[0].date === '2026-11-30', `first day ${days[0].date}`);
  ok(days[days.length - 1].date === '2027-09-19', `last day ${days[days.length - 1].date}`);
  const seen = new Set();
  for (const d of days) {
    const dt = new Date(`${d.date}T00:00:00Z`);
    ok(DOWS[dt.getUTCDay()] === d.dow, `${d.date}: dow ${d.dow} does not match the calendar`);
    ok(!seen.has(`${d.date}|${d.session}`), `duplicate ${d.date} ${d.session}`);
    seen.add(`${d.date}|${d.session}`);
    if (d.type === 'run') ok(d.distance_miles != null, `${d.date}: run day without distance_miles`);
  }
  ok(new Set(days.map((d) => d.date)).size === 294, 'dates are not unique');
  ok(races.length === 8 && races.every((r) => r.status === 'planned'), 'expected 8 planned races (Windmill skipped)');
  return errs;
}

// ---- SQL generation -------------------------------------------------------
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined ? 'null' : String(v));

// Long strings repeated across many days (efforts, finishers, legacy names)
// are replaced with ~N tokens in the JSON payload and expanded from a dict, so
// the migration stays small. Expansion is exact, not lossy.
function buildDict(rows, cols){
  const counts = new Map();
  for (const r of rows) for (const c of cols) if (typeof r[c] === 'string' && r[c].length >= 12) counts.set(r[c], (counts.get(r[c]) || 0) + 1);
  const dict = [...counts].filter(([, n]) => n >= 2).map(([s]) => s);
  return { dict, tok: new Map(dict.map((s, i) => [s, `~${i}`])) };
}

// Output is split into parts so each migration stays small enough to review
// and apply reliably: part 1 = plan, weeks, lift modes/templates, races;
// parts 2..8 = plan_days, WEEKS_PER_PART weeks each. Every part is idempotent.
const WEEKS_PER_PART = 6;
const TOTAL_PARTS = 1 + Math.ceil(weeks.length / WEEKS_PER_PART);

const DAY_COLS = ['week_number', 'day_id', 'date', 'dow', 'type', 'session', 'legacy_session', 'kind', 'mode', 'effort',
  'distance_miles', 'distance_km', 'duration_min', 'time_cap_min', 'finisher', 'venue_hint', 'optional', 'load_label'];
// Short JSON keys keep the payload small; the recordset maps them straight
// back to the real column names.
const SHORT = { week_number: 'wn', day_id: 'id', date: 'dt', dow: 'dw', type: 'ty', session: 'se', legacy_session: 'ls', kind: 'ki',
  mode: 'mo', effort: 'ef', distance_miles: 'dm', distance_km: 'dk', duration_min: 'du', time_cap_min: 'tc', finisher: 'fi',
  venue_hint: 'vh', optional: 'op', load_label: 'll' };
const SQLTYPE = { week_number: 'int', optional: 'boolean', distance_miles: 'numeric', distance_km: 'numeric', duration_min: 'int',
  time_cap_min: 'int', date: 'date' };
const DICT_COLS = ['legacy_session', 'effort', 'finisher', 'venue_hint'];
const HEADER = `-- Generated by fitness/scripts/import-plan-v2.mjs from fitness/data/edale-50km-training-plan-v2.json.\n-- Idempotent: safe to re-run. Touches plan tables only; never logged data.\n`;

function emitMeta(){
  const weekJson = weeks.map((w) => ({ week_number: w.week, start_date: w.start, end_date: w.end, phase: w.phase, load: w.load,
    notes: w.notes || '', weight_target_kg_monday: w.weight_target_kg_monday, run_miles: w.run_miles, run_km: w.run_km }));
  const out = [HEADER];
  out.push(`insert into fitness.training_plans (plan_version, plan_id, name, athlete, start_date, end_date, effort_guide, rules, generated_on)
values ('v2', ${q(plan.plan_id)}, 'Edale 50km', ${q(plan.athlete)}, ${q(plan.start)}, ${q(plan.race_day)},
  $j$${JSON.stringify(plan.effort_guide)}$j$::jsonb, $j$${JSON.stringify(plan.rules)}$j$::jsonb, ${q(plan.generated)})
on conflict (plan_version) do update set plan_id = excluded.plan_id, name = excluded.name, athlete = excluded.athlete,
  start_date = excluded.start_date, end_date = excluded.end_date, effort_guide = excluded.effort_guide,
  rules = excluded.rules, generated_on = excluded.generated_on;`);
  out.push(`insert into fitness.plan_weeks (plan_version, week_number, start_date, end_date, phase, load, notes, weight_target_kg_monday, run_miles, run_km)
select 'v2', x.week_number, x.start_date, x.end_date, x.phase, x.load, coalesce(x.notes, ''), x.weight_target_kg_monday, x.run_miles, x.run_km
from jsonb_to_recordset($j$${JSON.stringify(weekJson)}$j$::jsonb) as x(week_number int, start_date date, end_date date, phase text, load text, notes text, weight_target_kg_monday numeric, run_miles numeric, run_km numeric)
on conflict (plan_version, week_number) do update set start_date = excluded.start_date, end_date = excluded.end_date,
  phase = excluded.phase, load = excluded.load, notes = excluded.notes,
  weight_target_kg_monday = excluded.weight_target_kg_monday, run_miles = excluded.run_miles, run_km = excluded.run_km;`);
  const modes = Object.entries(plan.lift_modes);
  out.push(`insert into fitness.lift_modes (plan_version, mode, description) values
${modes.map(([k, v]) => `  ('v2', ${q(k)}, ${q(v)})`).join(',\n')}
on conflict (plan_version, mode) do update set description = excluded.description;`);
  const templates = Object.entries(plan.lift_templates);
  out.push(`insert into fitness.lift_templates (plan_version, name, when_label, sort_order) values
${templates.map(([name, t], i) => `  ('v2', ${q(name)}, ${q(t.when)}, ${i + 1})`).join(',\n')}
on conflict (plan_version, name) do update set when_label = excluded.when_label, sort_order = excluded.sort_order;`);
  out.push(`delete from fitness.lift_template_exercises where template_id in (select id from fitness.lift_templates where plan_version = 'v2');`);
  const exRows = templates.flatMap(([name, t]) => t.exercises.map((e, i) => `  ((select id from fitness.lift_templates where plan_version = 'v2' and name = ${q(name)}), ${i + 1}, ${q(e.name)}, ${q(e.sets)}, ${q(e.note || '')})`));
  out.push(`insert into fitness.lift_template_exercises (template_id, order_num, name, sets, note) values\n${exRows.join(',\n')};`);
  out.push(`insert into fitness.races (plan_version, race_date, start_time, name, role, status, sort_order) values
${races.map((r) => `  ('v2', ${q(r.race_date)}, ${q(r.start_time)}, ${q(r.name)}, ${q(r.role)}, ${q(r.status)}, ${r.sort_order})`).join(',\n')}
on conflict (plan_version, race_date, name) do update set start_time = excluded.start_time, role = excluded.role,
  status = excluded.status, sort_order = excluded.sort_order;`);
  return out.join('\n\n') + '\n';
}

function emitDays(part){
  const firstWeek = (part - 2) * WEEKS_PER_PART + 1;
  const lastWeek = Math.min(firstWeek + WEEKS_PER_PART - 1, weeks.length);
  const rows = days.filter((d) => d.week_number >= firstWeek && d.week_number <= lastWeek);
  // Long strings repeated across days (efforts, finishers, legacy names) are
  // replaced with ~N tokens and expanded from a dict. Exact, not lossy.
  const counts = new Map();
  for (const d of days) for (const c of DICT_COLS) if (typeof d[c] === 'string' && d[c].length >= 12) counts.set(d[c], (counts.get(d[c]) || 0) + 1);
  const dictAll = [...counts].filter(([, n]) => n >= 2).map(([str]) => str);
  const tok = new Map(dictAll.map((str, i) => [str, `~${i}`]));
  const dayJson = rows.map((d) => {
    const o = {};
    for (const c of DAY_COLS) {
      let v = d[c];
      if (v === null || v === undefined || v === false) continue;
      if (typeof v === 'string' && tok.has(v)) v = tok.get(v);
      o[SHORT[c]] = v;
    }
    return o;
  });
  const usedTokens = new Set(JSON.stringify(dayJson).match(/"~\d+"/g)?.map((t) => t.slice(1, -1)) || []);
  const dictSql = dictAll.map((str, i) => [`~${i}`, str]).filter(([k]) => usedTokens.has(k)).map(([k, str]) => `(${q(k)}, ${q(str)})`).join(',\n    ');
  const x = (c) => (DICT_COLS.includes(c) ? `coalesce((select v from _dict where k = x.${SHORT[c]}), x.${SHORT[c]})` : `x.${SHORT[c]}`);
  const recordset = DAY_COLS.map((c) => `${SHORT[c]} ${SQLTYPE[c] || 'text'}`).join(', ');
  return `${HEADER}-- plan_days for weeks ${firstWeek}-${lastWeek}.
drop table if exists pg_temp._dict, pg_temp._incoming;
create temp table _dict (k text primary key, v text not null);
${dictSql ? `insert into _dict values\n    ${dictSql};` : ''}
create temp table _incoming as
select ${DAY_COLS.map((c) => `${x(c)} as ${c}`).join(',\n  ')}
from jsonb_to_recordset($j$${JSON.stringify(dayJson)}$j$::jsonb) as x(${recordset});
delete from fitness.plan_days p where p.plan_version = 'v2' and p.week_number between ${firstWeek} and ${lastWeek}
  and not exists (select 1 from _incoming i where i.date = p.date and i.session = p.session);
insert into fitness.plan_days (plan_version, ${DAY_COLS.join(', ')})
select 'v2', week_number, day_id, date, dow, type, session, legacy_session, kind, mode, effort, distance_miles, distance_km,
  duration_min, time_cap_min, finisher, venue_hint, coalesce(optional, false), load_label from _incoming
on conflict (plan_version, date, session) do update set week_number = excluded.week_number, day_id = excluded.day_id,
  dow = excluded.dow, type = excluded.type, legacy_session = excluded.legacy_session, kind = excluded.kind, mode = excluded.mode,
  effort = excluded.effort, distance_miles = excluded.distance_miles, distance_km = excluded.distance_km,
  duration_min = excluded.duration_min, time_cap_min = excluded.time_cap_min, finisher = excluded.finisher,
  venue_hint = excluded.venue_hint, optional = excluded.optional, load_label = excluded.load_label;
drop table pg_temp._dict, pg_temp._incoming;
`;
}

function emit(part){
  if (part === 1) return emitMeta();
  if (part >= 2 && part <= TOTAL_PARTS) return emitDays(part);
  throw new Error(`--part must be 1..${TOTAL_PARTS}`);
}

const errs = check();
if (process.argv.includes('--check')) {
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  const counts = {};
  for (const d of days) counts[d.type] = (counts[d.type] || 0) + 1;
  console.log(`OK: ${weeks.length} weeks, ${days.length} days, ${days[0].date} .. ${days[days.length - 1].date}`);
  console.log('day types:', JSON.stringify(counts));
  console.log('races:', races.map((r) => `${r.race_date} ${r.name} [${r.status}]`).join(' | '));
} else {
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  const pi = process.argv.indexOf('--part');
  if (pi === -1) { for (let i = 1; i <= TOTAL_PARTS; i++) process.stdout.write(emit(i) + '\n'); }
  else process.stdout.write(emit(Number(process.argv[pi + 1])));
}
