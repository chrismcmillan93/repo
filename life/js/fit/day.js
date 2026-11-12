// One day of training and food, read from and written to the Fitness app's own
// tables, so both apps always agree: the session (planned or picked), the
// Weights / Cardio / Both picker that also decides the day's meals and calories,
// each lift's exercises, each meal's foods, ticks, and the morning weigh-in.
// Used by Today (compact) and Health > Day (full).
import { db } from './db.js';
import { loadNutrition, inNutritionPlan, buildDay, effectiveWeight, sessionFacts, pickDayKey, describeScaling, adjustEnabled } from './nutrition.js';
import { sessionOptions } from './sessionChoices.js';
import { escapeHtml as esc, toast, round1 } from './utils.js';
import { userId } from '../store.js';
import { sourcesFor, swapDays, resetWeek, dayOptionsHtml } from './daySwap.js';
import { startOfWeek, endOfWeek, dateRange, formatDayLabel } from './utils.js';
import { bar, wire, options } from '../ui.js';

let templatesCache = null;
export async function liftTemplates(){
  if (!templatesCache) templatesCache = db.liftTemplates.list('v2').catch(() => []);
  return templatesCache;
}

async function loadSwap(date){
  const dates = dateRange(startOfWeek(date), endOfWeek(date));
  const [planDays, swaps] = await Promise.all([db.planDays.listRange('v2', dates[0], dates[6]), db.daySwaps.listRange(userId(), dates[0], dates[6])]);
  if (!planDays.length) return null;
  return { dates, swaps, planByDate: Object.fromEntries(planDays.map((p) => [p.date, p])) };
}

async function loadDay(date, full){
  const uid = userId();
  const [bundle, nut, tpls, swap] = await Promise.all([db.getDayBundle(date), loadNutrition(), liftTemplates(), full ? loadSwap(date).catch(() => null) : null]);
  let day = null, weightInfo = null;
  if (inNutritionPlan(nut, date)) {
    weightInfo = await effectiveWeight(uid, date);
    const { miles, isRaceDay } = sessionFacts(bundle);
    const key = pickDayKey(bundle.picks, bundle.pick_sessions);
    day = buildDay(nut, { date, weight: weightInfo.weight, enabled: adjustEnabled(), miles, isRaceDay, key: key || undefined });
    day.fromPick = !!key;
  }
  return {
    bundle, nut, tpls, day, weightInfo,
    checks: { ...(bundle.checks || {}) },
    picks: bundle.picks || { weights: false, cardio: false },
    names: bundle.pick_sessions || {},
    swap,
    meals: day ? day.meals : (bundle.meals || []),
    dayType: day ? day.key : bundle.day_type
  };
}

function exercisesHtml(tpl){
  if (!tpl || !tpl.exercises || !tpl.exercises.length) return '';
  return `<details class="drop" data-k="ex-${esc(tpl.name)}"><summary>Exercises (${tpl.exercises.length})</summary><ol class="exlist">${tpl.exercises.map((x) => `
    <li><b>${esc(x.name)}</b><span>${esc(x.sets || '')}</span>${x.note ? `<em>${esc(x.note)}</em>` : ''}</li>`).join('')}</ol></details>`;
}

function sessionHtml(s, c, compact){
  const d = s.plan_day || {};
  const id = `session:${s.session_type}`;
  const chips = [
    s.session_type === 'lift' && d.mode ? `Mode: ${d.mode}` : '',
    d.time_cap_min ? `Time cap ${d.time_cap_min} min` : '',
    d.load_label ? `Load: ${d.load_label}` : '',
    d.optional ? 'Optional' : '',
    s.source === 'pick' ? 'Your pick' : ''
  ].filter(Boolean);
  const lines = [
    d.effort && d.effort !== 'See session' ? d.effort : '',
    d.finisher ? `Stair finisher: ${d.finisher}` : '',
    d.venue_hint || '',
    !compact && s.session_type === 'lift' && d.mode_description ? d.mode_description : ''
  ].filter(Boolean);
  const tpl = s.session_type === 'lift' ? c.tpls.find((t) => t.name === s.title) : null;
  return `<div class="sess">
    <label class="row ${c.checks[id] ? 'done' : ''}"><input type="checkbox" data-act="tick" data-id="${id}" ${c.checks[id] ? 'checked' : ''}>
      <span class="rt"><span class="rtitle"><b>${esc(s.title)}</b></span>
      <span class="rmeta">${chips.map((x) => `<span class="pill">${esc(x)}</span>`).join('')}</span></span></label>
    ${lines.map((l) => `<p class="hint">${esc(l)}</p>`).join('')}
    ${exercisesHtml(tpl)}
  </div>`;
}

function pickerHtml(c, hasPlanned){
  const active = c.picks.weights && c.picks.cardio ? 'both' : c.picks.weights ? 'weights' : c.picks.cardio ? 'cardio' : null;
  const btn = (k, label) => `<button type="button" class="${active === k ? 'on' : ''}" data-act="pick" data-pick="${k}" aria-pressed="${active === k}">${label}</button>`;
  const selects = ['weights', 'cardio'].filter((k) => c.picks[k]).map((k) => `
    <label class="lab">Which ${k} session?<select class="field" data-act="pickname" data-kind="${k}">${options(sessionOptions(k).map((n) => [n, n]), c.names[k], 'Not specified')}</select></label>`).join('');
  const body = `<div class="seg">${btn('weights', 'Weights')}${btn('cardio', 'Cardio')}${btn('both', 'Both')}</div>${selects}`;
  if (hasPlanned && !active) return `<details class="drop" data-k="picker"><summary>Do something different today?</summary><p class="hint">Replaces the planned session, and the meals follow it. Tap your pick again to go back to the plan.</p>${body}</details>`;
  return `<p class="sub">${hasPlanned ? 'Your pick (replaces the plan)' : 'Pick the session'}</p>${body}
    <p class="hint">${active ? 'Tap your pick again to clear it. Meals and calories follow the pick.' : 'Weights or Both gives lift-day meals; Cardio gives run-day meals.'}</p>`;
}

function foodHtml(f){
  const qty = f.quantity == null ? '' : f.unit === 'g' ? `${f.quantity}g` : `${f.quantity} ${f.unit || ''}`;
  return `<li class="${f.is_swap_option ? 'swap' : ''}"><span><b>${esc(f.name)}</b><em>${f.kcal ?? 0} kcal · ${f.protein_g ?? 0}g protein · ${f.carbs_g ?? 0}g carbs · ${f.fat_g ?? 0}g fat</em></span><span class="qty">${esc(qty)}</span></li>`;
}

function mealsHtml(c, compact){
  if (!c.meals.length || !c.dayType) return '<p class="hint">No meal plan covers this date.</p>';
  let kcal = 0, protein = 0;
  const rows = c.meals.map((m) => {
    const id = `meal:${c.dayType}:${m.slot_order}`;
    const on = !!c.checks[id];
    if (on) { kcal += Number(m.kcal) || 0; protein += Number(m.protein_g) || 0; }
    const foods = m.foods && m.foods.length ? m.foods : [{ name: m.name, quantity: null, kcal: m.kcal, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g }];
    return `<div class="meal ${on ? 'done' : ''}"><input type="checkbox" data-act="tick" data-id="${id}" ${on ? 'checked' : ''} aria-label="Mark ${esc(m.name)} as eaten">
      <details class="drop" data-k="${id}"><summary><span class="rtitle">${esc(m.name)}</span> <span class="hint">${esc(m.time_label || '')}</span>
        <span class="mm">${m.kcal} kcal · ${round1(m.protein_g)}g protein</span></summary>
        <ul class="foods">${foods.filter((f) => !f.is_swap_option).map(foodHtml).join('')}</ul>
        ${foods.some((f) => f.is_swap_option) ? `<p class="sub">Or swap the protein for</p><ul class="foods">${foods.filter((f) => f.is_swap_option).map(foodHtml).join('')}</ul>` : ''}
      </details></div>`;
  }).join('');
  const target = c.meals.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
  const floor = c.day ? Number(c.nut.plan.protein_floor_g) : (c.bundle.target && c.bundle.target.protein_floor_g) || 0;
  const label = c.day ? c.day.label : c.dayType;
  return `<p class="sub">${esc(label)} meals${c.day && c.day.fromPick ? ' · following your pick' : ''}</p>
    <div class="fuel"><div><span>Calories</span><b>${Math.round(kcal)} / ${target} kcal</b>${bar(100 * kcal / (target || 1), null, kcal > target ? 'warn' : '')}</div>
    <div><span>Protein</span><b>${round1(protein)} / ${floor} g</b>${bar(100 * protein / (floor || 1), null, 'good')}</div></div>
    ${rows}
    ${!compact && c.day ? `<p class="hint">${esc(describeScaling(c.day, c.weightInfo))}</p>` : ''}`;
}

const STATUS = [['yes', 'Yes'], ['partial', 'Partly'], ['no', 'No']];
function reviewHtml(c){
  const log = c.bundle.log || {};
  const row = (field, label, values, cur) => `<div class="qrow"><span>${label}</span><div class="seg sm">${values.map(([v, t]) => `<button type="button" class="${cur === v ? 'on' : ''}" data-act="log" data-field="${field}" data-v="${v}" aria-pressed="${cur === v}">${t}</button>`).join('')}</div></div>`;
  const yn = (b) => (b === true ? 'yes' : b === false ? 'no' : null);
  return `<details class="drop" data-k="review" ${log.nutrition_status || log.training_status ? '' : 'open'}><summary>How did today go?${log.nutrition_status || log.training_status ? ` <span class="hint">food ${log.nutrition_status || '-'}, training ${log.training_status || '-'}</span>` : ''}</summary>
    ${row('nutrition_status', 'Stuck to the food plan', STATUS, log.nutrition_status)}
    ${row('training_status', 'Did the training', STATUS, log.training_status)}
    ${row('progress_pics', 'Progress pictures taken', [['yes', 'Yes'], ['no', 'No']], yn(log.progress_pics))}
    ${row('read_pages', 'Read 1 chapter / 10 pages', [['yes', 'Yes'], ['no', 'No']], yn(log.read_pages))}
    <label class="lab">Notes<textarea class="field" rows="2" data-act="lognotes" placeholder="Energy, cravings, how the session felt">${esc(log.notes || '')}</textarea></label></details>`;
}

function swapHtml(c, date){
  if (!c.swap || !c.swap.dates.includes(date)) return '';
  const sources = sourcesFor(c.swap.dates, c.swap.swaps);
  const from = sources[date] !== date ? sources[date] : null;
  return `<details class="drop" data-k="swap" ${from ? 'open' : ''}><summary>Swap with another day this week${from ? ' (swapped)' : ''}</summary>
    ${from ? `<p class="hint">Showing ${esc(formatDayLabel(from))}'s planned session.</p>` : '<p class="hint">Trade today\'s planned session with another day in the same week. The plan itself never changes.</p>'}
    <div class="wrapf"><select class="field" id="swapWith" aria-label="Swap with">${dayOptionsHtml(c.swap.dates, sources, c.swap.planByDate, { exclude: date })}</select>
    <button type="button" class="btn" data-act="swap">Swap</button>${c.swap.swaps.length ? '<button type="button" class="btn ghost" data-act="swapreset">Reset this week</button>' : ''}</div></details>`;
}

function html(c, opts){
  const sessions = c.bundle.sessions || [];
  const hasPlanned = !!(c.bundle.plan && c.bundle.plan.has_day);
  const pw = c.bundle.plan && c.bundle.plan.week;
  const w = c.bundle.log && c.bundle.log.weight_kg;
  return `
    ${pw ? `<p class="hint">Week ${pw.week_number} of ${pw.total_weeks} · ${esc(pw.phase)} · ${esc(pw.load)} load${!opts.compact && pw.notes ? ` · ${esc(pw.notes)}` : ''}</p>` : ''}
    ${sessions.length ? sessions.map((s) => sessionHtml(s, c, opts.compact)).join('') : '<p class="hint">Nothing is planned for this day.</p>'}
    ${pickerHtml(c, hasPlanned)}
    ${mealsHtml(c, opts.compact)}
    ${opts.compact ? '' : swapHtml(c, opts.date)}
    <form class="add" data-act="weigh"><label class="lab" style="flex:1">Morning weigh-in (kg)<input class="field" name="kg" type="number" step="0.1" min="50" max="200" inputmode="decimal" value="${w != null ? Number(w) : ''}" placeholder="${c.weightInfo && c.weightInfo.weight ? c.weightInfo.weight : ''}"></label><button class="btn">Save</button></form>
    ${reviewHtml(c)}`;
}

export async function mountDay(host, date, opts = {}){
  const el = document.createElement('div');
  el.className = 'fitday';
  el.innerHTML = '<p class="hint">Loading training and food…</p>';
  host.replaceChildren(el);
  let c;
  opts = { ...opts, date };
  try { c = await loadDay(date, !opts.compact); } catch (err) {
    el.innerHTML = `<p class="hint">Couldn't load training and food: ${esc(err.message)}</p>`;
    return;
  }
  const draw = () => {
    const open = new Set(Array.from(el.querySelectorAll('details[open]')).map((d) => d.dataset.k));
    el.innerHTML = html(c, opts);
    el.querySelectorAll('details').forEach((d) => { if (open.has(d.dataset.k)) d.open = true; });
  };
  const reload = async () => { c = await loadDay(date, !opts.compact); draw(); if (opts.onChange) opts.onChange(); };
  draw();
  wire(el, {
    async tick(n){
      c.checks[n.dataset.id] = n.checked;
      draw();
      await db.dailyChecks.upsert(userId(), date, n.dataset.id, n.checked);
      if (opts.onChange) opts.onChange();
    },
    async pick(n){
      const want = { weights: n.dataset.pick !== 'cardio', cardio: n.dataset.pick !== 'weights' };
      const same = want.weights === !!c.picks.weights && want.cardio === !!c.picks.cardio;
      const next = same ? { weights: false, cardio: false } : want;
      await Promise.all(['weights', 'cardio'].map((k) => db.dailyChecks.upsert(userId(), date, `pick:${k}`, next[k])));
      await db.pickSessions.remove(userId(), date, ['weights', 'cardio'].filter((k) => !next[k]));
      await reload();
    },
    async pickname(n){
      if (n.value) await db.pickSessions.set(userId(), date, n.dataset.kind, n.value);
      else await db.pickSessions.remove(userId(), date, [n.dataset.kind]);
      await reload();
    },
    async log(n){
      const field = n.dataset.field, cur = (c.bundle.log || {})[field];
      const bool = field === 'progress_pics' || field === 'read_pages';
      const val = bool ? (n.dataset.v === 'yes') : n.dataset.v;
      const next = cur === val ? null : val;
      c.bundle.log = { ...(c.bundle.log || {}), [field]: next };
      draw();
      await db.dailyLogs.upsert(userId(), date, { [field]: next });
    },
    async lognotes(n){
      c.bundle.log = { ...(c.bundle.log || {}), notes: n.value };
      await db.dailyLogs.upsert(userId(), date, { notes: n.value });
      toast('Notes saved');
    },
    async swap(){
      await swapDays(userId(), c.swap.dates, c.swap.swaps, date, el.querySelector('#swapWith').value);
      toast('Swapped');
      await reload();
    },
    async swapreset(){ await resetWeek(userId(), c.swap.dates); toast('Week reset to the plan'); await reload(); },
    async weigh(f){
      const kg = Number(new FormData(f).get('kg'));
      if (!kg) return;
      await db.dailyLogs.upsert(userId(), date, { weight_kg: kg });
      toast(`Saved ${kg} kg`);
      await reload();
    }
  });
}
