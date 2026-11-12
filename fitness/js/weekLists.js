// Shopping list and prep tasks for a week, generated from the nutrition plan
// (v4) so they can never disagree with the meals on Today and Week: they are
// the sum of that week's scaled meals (js/nutrition.js buildDay), swap options
// excluded. Nothing here is stored except your ticks (fitness.week_list_ticks).
//
// Quantities are the plan's own. The only conversions are the ones the plan
// states (meat: cooked weight = 0.75 x raw) plus one clearly-marked estimate
// for dry rice (about 2.8 g cooked per g dry, from the plan's own 130 kcal per
// 100 g cooked against a typical 365 kcal per 100 g dry).
import { escapeHtml, formatDayLabel, formatDateShort } from './utils.js';

const MEAT_YIELD = 0.75;          // plan: cooked weight is 0.75 of raw weight
const RICE_COOKED_PER_DRY = 2.8;  // estimate, shown as "about"
const round = (n, step) => Math.round(n / step) * step;

const CATEGORIES = [
  ['Protein', /beef mince|chicken|eggs/i],
  ['Carbs', /rice|sweet potato|oats|banana|gel/i],
  ['Fruit & veg', /blueberr|pineapple|honeydew|pepper|veg/i],
  ['Pantry & supplements', /./]
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// days: [{ date, day }] where day is a buildDay() result (or null outside the plan).
function foodTotals(days){
  const totals = new Map();
  for (const { day } of days) {
    if (!day) continue;
    for (const m of day.meals) {
      for (const f of m.foods) {
        if (f.is_swap_option) continue;
        const cur = totals.get(f.name) || { name: f.name, unit: f.unit, qty: 0 };
        cur.qty += Number(f.quantity) || 0;
        totals.set(f.name, cur);
      }
    }
  }
  return [...totals.values()];
}

function qtyText(item){
  const { name, unit, qty } = item;
  if (/beef mince|chicken breast/i.test(name) && unit === 'g') {
    const raw = round(qty / MEAT_YIELD, 10);
    return { text: `${raw} g raw`, note: `${qty} g cooked across the week (cooked is 0.75 of raw)` };
  }
  if (/white rice/i.test(name) && unit === 'g') {
    return { text: `${qty} g cooked`, note: `About ${round(qty / RICE_COOKED_PER_DRY, 10)} g dry (estimate: about 2.8 g cooked per g dry)` };
  }
  if (/sweet potato/i.test(name) && unit === 'g') return { text: `${qty} g baked`, note: '' };
  if (/oats/i.test(name) && unit === 'g') return { text: `${qty} g dry`, note: 'Cooked in water, no dairy' };
  if (/veg|pepper/i.test(name) && unit === 'g') return { text: `${qty} g cooked`, note: 'Peppers always cooked' };
  if (unit === 'g') return { text: `${qty} g`, note: '' };
  if (unit === 'whole') return { text: `${qty}`, note: '' };
  if (unit === 'serving') return { text: `${qty} serving${qty === 1 ? '' : 's'}`, note: '' };
  if (unit === 'cup') return { text: `${qty} cup${qty === 1 ? '' : 's'}`, note: '' };
  return { text: `${qty} ${unit}`, note: '' };
}

export function buildShoppingList(days){
  const groups = CATEGORIES.map(([category]) => ({ category, items: [] }));
  for (const item of foodTotals(days)) {
    const idx = CATEGORIES.findIndex(([, re]) => re.test(item.name));
    const { text, note } = qtyText(item);
    groups[idx].items.push({ key: `shop:${slug(item.name)}`, name: item.name, qty: text, note });
  }
  const pantry = groups[groups.length - 1];
  pantry.items.push({ key: 'shop:supplements', name: 'Creatine, vitamin D, electrolytes', qty: 'check stock', note: 'Daily supplements from the plan' });
  return groups.filter((g) => g.items.length);
}

// Two batch-cooking sessions a week, Mon-Wed and Thu-Sun, for each cooked
// component the meals use. (The plan itself sets no prep schedule; this is a
// simple split of the week's own quantities.)
const BATCHES = [
  { label: 'Monday to Wednesday', when: 'Sunday evening or Monday morning', idx: [0, 1, 2] },
  { label: 'Thursday to Sunday', when: 'Wednesday or Thursday', idx: [3, 4, 5, 6] }
];
const COMPONENTS = [
  { id: 'mince', title: 'Cook the mince', re: /beef mince/i, meals: 'lunch and dinner', kind: 'meat' },
  { id: 'chicken', title: 'Cook the chicken', re: /chicken breast/i, meals: 'afternoon snacks', kind: 'meat' },
  { id: 'rice', title: 'Cook the rice', re: /white rice/i, meals: 'lunch, snack and dinner', kind: 'rice' },
  { id: 'sweet-potato', title: 'Bake the sweet potatoes', re: /sweet potato/i, meals: 'dinners', kind: 'plain', suffix: 'baked' },
  { id: 'veg', title: 'Cook the veg and peppers', re: /veg|pepper/i, meals: 'breakfast, lunch and dinner', kind: 'plain', suffix: 'cooked' }
];

export function buildPrepTasks(days){
  const out = [];
  for (const batch of BATCHES) {
    const sub = batch.idx.map((i) => days[i]).filter((d) => d && d.day);
    if (!sub.length) continue;
    const names = sub.map((d) => formatDayLabel(d.date).slice(0, 3)).join(', ');
    const totals = foodTotals(sub);
    const tasks = [];
    for (const c of COMPONENTS) {
      const qty = totals.filter((t) => c.re.test(t.name) && t.unit === 'g').reduce((s, t) => s + t.qty, 0);
      if (!qty) continue;
      let description;
      if (c.kind === 'meat') description = `${round(qty / MEAT_YIELD, 10)} g raw (${qty} g cooked) for ${c.meals} on ${names}.`;
      else if (c.kind === 'rice') description = `${qty} g cooked (about ${round(qty / RICE_COOKED_PER_DRY, 10)} g dry) for ${c.meals} on ${names}.`;
      else description = `${qty} g ${c.suffix} for ${c.meals} on ${names}.`;
      tasks.push({ key: `prep:${batch.idx[0]}:${c.id}`, title: c.title, description });
    }
    // Gels for the Saturday long run.
    const sat = sub.find((d) => d.day.key === 'long_run_day');
    if (sat) {
      const gels = foodTotals([sat]).filter((t) => /gel/i.test(t.name)).reduce((s, t) => s + t.qty, 0);
      if (gels) tasks.push({ key: `prep:${batch.idx[0]}:gels`, title: 'Pack the long-run gels', description: `${gels} gels for Saturday's long run (the plan: train the gut with the race gel).` });
    }
    if (tasks.length) out.push({ label: batch.label, when: batch.when, tasks });
  }
  return out;
}

function tickRowHtml(list, item, checked, topLine, name, notes){
  return `
    <li class="tick-row ${checked ? 'is-checked' : ''}" data-list="${list}" data-item-key="${escapeHtml(item.key)}">
      <button type="button" class="tick-box" aria-pressed="${checked}" aria-label="Mark ${escapeHtml(name)} as done"></button>
      <div class="tick-body">
        ${topLine ? `<div class="tick-top-line"><span class="tick-macro">${escapeHtml(topLine)}</span></div>` : ''}
        <div class="tick-name">${escapeHtml(name)}</div>
        ${notes ? `<div class="tick-notes">${escapeHtml(notes)}</div>` : ''}
      </div>
      <span class="tick-status" aria-live="polite"></span>
    </li>`;
}

export function shoppingListHtml(groups, weekStart, ticks){
  if (!groups.length) return '';
  return `
    <section class="panel">
      <h2 class="panel-title">Shopping list</h2>
      <p class="panel-summary">For the week of ${escapeHtml(formatDateShort(weekStart))}: the sum of that week's meals, scaled to your weight.</p>
      ${groups.map((g) => `
        <h3 class="plan-subhead">${escapeHtml(g.category)}</h3>
        <ul class="tick-list">${g.items.map((it) => tickRowHtml('shopping', it, !!ticks[`shopping|${it.key}`], it.qty, it.name, it.note)).join('')}</ul>`).join('')}
    </section>`;
}

export function prepTasksHtml(batches, ticks){
  if (!batches.length) return '';
  return `
    <section class="panel">
      <h2 class="panel-title">Prep tasks</h2>
      ${batches.map((b) => `
        <h3 class="plan-subhead">${escapeHtml(b.label)} · ${escapeHtml(b.when)}</h3>
        <ul class="tick-list">${b.tasks.map((t) => tickRowHtml('prep', t, !!ticks[`prep|${t.key}`], '', t.title, t.description)).join('')}</ul>`).join('')}
    </section>`;
}
