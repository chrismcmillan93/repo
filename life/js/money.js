// Money: pots, pay-day transfers and regular payments. Pure functions (no network, no DOM), so they can be tested on their
// own, and plain enough that supabase/functions/life-push/money.js is an EXACT COPY of this file (a function bundle cannot
// import from the app folder; life/tests/money.test.mjs fails if they differ).
//
// Nothing here reads a bank. A pot is money you put aside: a savings goal (the USA trip) or an upcoming bill (the MOT).
// You move the money in your banking app and tap "Moved" to record it. Dates are plain 'YYYY-MM-DD' strings.
export const PAYDAY_DEFAULT = 1;
export const CADENCES = ['weekly', 'monthly', 'yearly', 'one_off'];
export const CADENCE_LABEL = { weekly: 'Every week', monthly: 'Every month', yearly: 'Every year', one_off: 'One-off' };

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const up2 = (n) => Math.ceil(Number(n) * 100 - 1e-9) / 100; // round UP to the penny, so a plan never falls a penny short
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (s) => String(s).split('-').map(Number);
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // days in month m (1-12)
const DAY = 864e5;
const days = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
export const addDays = (s, n) => new Date(Date.parse(`${s}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// `s` plus `n` months, keeping day `day` (default: s's own day) but never past the end of the month (31 Jan + 1 month = 28 Feb).
export function addMonths(s, n, day){
  const [y, m, d] = parts(s), t = y * 12 + (m - 1) + n, ny = Math.floor(t / 12), nm = (t % 12) + 1;
  return iso(ny, nm, Math.min(day == null ? d : day, dim(ny, nm)));
}

export const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

// The next time a payment falls due, on or after `today`. Weekly, monthly and yearly roll forward from the saved date (so the
// saved date never needs editing); a one-off stays on its date, even if that is past (the caller decides what past means).
export function rollDue(next_due, cadence, today){
  if (!validDate(next_due) || cadence === 'one_off' || next_due >= today) return next_due;
  if (cadence === 'weekly') return addDays(next_due, Math.ceil(days(next_due, today) / 7) * 7);
  const step = cadence === 'yearly' ? 12 : 1, anchor = parts(next_due)[2];
  let k = Math.max(0, Math.floor(days(next_due, today) / (step === 12 ? 366 : 31)) - 1); // start near the answer
  for (; k < 2000; k++) { const c = addMonths(next_due, k * step, anchor); if (c >= today) return c; }
  return next_due;
}

// What a payment costs per month. Weekly is x52/12, yearly is /12; a one-off is not a regular cost.
export function monthlyEquivalent(p){
  const a = Number(p.amount) || 0;
  return p.cadence === 'weekly' ? (a * 52) / 12 : p.cadence === 'monthly' ? a : p.cadence === 'yearly' ? a / 12 : 0;
}

// The money that goes out in a normal month: monthly and weekly payments. Yearly and one-off ones are not in it, because
// those are covered by pots (put aside a bit each month), which is what the transfers total counts.
export function regularMonthly(payments){
  return r2((payments || []).filter((p) => p.active !== false && (p.cadence === 'monthly' || p.cadence === 'weekly')).reduce((t, p) => t + monthlyEquivalent(p), 0));
}

// Payments falling due from today to `n` days ahead, soonest first. A one-off already past is finished, not "due".
export function dueSoon(payments, today, n){
  const end = addDays(today, n);
  return (payments || []).filter((p) => p.active !== false).map((p) => ({ ...p, due: rollDue(p.next_due, p.cadence, today) }))
    .filter((p) => p.due >= today && p.due <= end).sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
}

// How a payment's due date reads in a short line: "today", "tomorrow", or "3 Dec".
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (s) => { const [, m, d] = parts(s); return `${d} ${MON[m - 1]}`; };
export const gbp = (n) => { const v = Number(n) || 0; return `${v < 0 ? '-' : ''}£${Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(r2(v)) ? 0 : 2, maximumFractionDigits: 2 })}`; };

// The morning-notification line: payments going out in the next few days, e.g. "Going out: Phone £22 (tomorrow), Broadband £30 (3 Dec)".
// At most `perLine` named, then "+N more". Returns [] when nothing is due. Used by life-push, which may read the payments table only.
export function paymentLines(payments, today, n = 3, perLine = 3){
  const list = dueSoon(payments, today, n);
  if (!list.length) return [];
  const when = (d) => (d === today ? 'today' : d === addDays(today, 1) ? 'tomorrow' : shortDate(d));
  const clip = (s, k) => (s.length > k ? `${s.slice(0, k - 1).trimEnd()}…` : s);
  const more = list.length > perLine ? `, +${list.length - perLine} more` : '';
  return [`Going out: ${list.slice(0, perLine).map((p) => `${clip(p.title, 30)} ${gbp(p.amount)} (${when(p.due)})`).join(', ')}${more}`];
}

// The pay days (the `payday`th of each month, 1-28) from `from` to `to`, both inclusive.
export function payDates(from, to, payday = PAYDAY_DEFAULT){
  const pd = Math.max(1, Math.min(28, Math.round(Number(payday)) || PAYDAY_DEFAULT));
  const out = [];
  if (!validDate(from) || !validDate(to) || to < from) return out;
  let [y, m] = parts(from);
  for (let guard = 0; guard < 1200; guard++) {
    const d = iso(y, m, pd);
    if (d > to) break;
    if (d >= from) out.push(d);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export const potBalance = (deposits, potId) => r2((deposits || []).filter((d) => d.pot_id === potId).reduce((t, d) => t + Number(d.amount), 0));
// What you moved into a pot this calendar month (money in only).
export const movedThisMonth = (deposits, potId, today) => r2((deposits || []).filter((d) => d.pot_id === potId && Number(d.amount) > 0 && String(d.deposited_on).slice(0, 7) === today.slice(0, 7)).reduce((t, d) => t + Number(d.amount), 0));

// Where a pot stands and what it needs. `left` is the pay days still to come up to the date it is needed (today's pay day
// counts). A bill pot with no monthly amount set is told what to put aside each month (what is still needed / pay days left,
// rounded up so it always arrives); a set monthly amount is checked against the target instead, and "short" says by how much and
// what monthly amount would fix it. Status: done, ontrack, short, or nodate (no date to plan towards).
// `moved` is what has gone into the pot this calendar month. When this month's pay day has already passed and nothing has been
// moved yet, that transfer is still owed, so it counts as one more pay day left (otherwise a late month would quietly raise
// every later month's share). Leave `moved` out to ignore this.
export function potPlan(pot, balance, today, payday = PAYDAY_DEFAULT, moved){
  const target = Number(pot.target), bal = r2(balance), needed = Math.max(0, r2(target - bal));
  const hasDate = validDate(pot.target_date);
  const pd = Math.max(1, Math.min(28, Math.round(Number(payday)) || PAYDAY_DEFAULT)), thisPay = `${today.slice(0, 7)}-${pad(pd)}`;
  const owed = hasDate && moved != null && !(moved > 0) && thisPay < today && pot.target_date >= thisPay ? 1 : 0;
  const left = hasDate ? payDates(today, pot.target_date, payday).length + owed : 0;
  const set = pot.monthly_amount != null && pot.monthly_amount !== '' ? Number(pot.monthly_amount) : null;
  const suggested = hasDate ? (left ? up2(needed / left) : needed) : 0;
  const planned = set != null ? r2(set) : suggested;
  const projected = r2(bal + planned * left), short = hasDate ? Math.max(0, r2(target - projected)) : 0;
  const status = bal >= target ? 'done' : !hasDate ? 'nodate' : short > 0 ? 'short' : 'ontrack';
  return { balance: bal, target, needed, left, suggested, planned: status === 'done' ? 0 : planned, projected, short, requiredMonthly: hasDate ? (left ? up2(needed / left) : needed) : 0, status, overdue: hasDate && pot.target_date < today && bal < target };
}

// This month's transfers: one per pot that still needs money, with how much has been moved already.
export function transferChecklist(pots, deposits, today, payday = PAYDAY_DEFAULT){
  const items = (pots || []).map((pot) => {
    const moved = movedThisMonth(deposits, pot.id, today), plan = potPlan(pot, potBalance(deposits, pot.id), today, payday, moved);
    return { pot, plan, amount: plan.planned, moved, done: plan.planned > 0 ? moved >= plan.planned - 0.005 : true };
  }).filter((i) => i.plan.status !== 'done' && i.amount > 0);
  return { items, total: r2(items.reduce((t, i) => t + i.amount, 0)), toMove: r2(items.reduce((t, i) => t + Math.max(0, i.amount - Math.min(i.moved, i.amount)), 0)) };
}

// Income minus regular payments minus pot transfers, or null when no income has been set.
export const leftOver = (income, regular, transfers) => (income == null || income === '' || Number.isNaN(Number(income)) ? null : r2(Number(income) - Number(regular) - Number(transfers)));

export const ordinal = (n) => { const k = n % 100; return `${n}${k >= 11 && k <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`; };

// ---- what the forms may save (null when something needed is missing) ----
const money = (v) => { const n = Number(String(v ?? '').replace(/[£,\s]/g, '')); return Number.isFinite(n) ? r2(n) : NaN; };

export function cleanPot({ name, kind, target, date, goal, saved, monthly }){
  const n = String(name || '').trim().slice(0, 80), t = money(target);
  if (!n || !(t > 0)) return null;
  const sv = money(saved), mo = money(monthly);
  return { row: { name: n, kind: kind === 'saving' ? 'saving' : 'bill', target: t, target_date: validDate(date) ? date : null, goal_id: goal || null, monthly_amount: monthly !== '' && monthly != null && mo >= 0 ? mo : null, sort_order: 0 }, saved: sv > 0 ? sv : 0 };
}

export function cleanPayment({ title, amount, cadence, next_due, pot }){
  const t = String(title || '').trim().slice(0, 80), a = money(amount);
  if (!t || !(a > 0) || !validDate(next_due)) return null;
  return { title: t, amount: a, cadence: CADENCES.includes(cadence) ? cadence : 'monthly', next_due, pot_id: pot || null, active: true };
}

export function cleanDeposit({ amount, note }){
  const a = money(amount);
  if (!Number.isFinite(a) || a === 0) return null;
  return { amount: a, note: String(note || '').trim().slice(0, 120) };
}

export function cleanMoneySettings({ income, payday }){
  const inc = money(income), pd = Math.round(Number(payday));
  return { income: income === '' || income == null || !(inc >= 0) ? null : inc, payday: pd >= 1 && pd <= 28 ? pd : PAYDAY_DEFAULT };
}
