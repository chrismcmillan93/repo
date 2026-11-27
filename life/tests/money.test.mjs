import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addMonths, rollDue, monthlyEquivalent, regularMonthly, dueSoon, paymentLines, payDates, potBalance, movedThisMonth, potPlan, transferChecklist, leftOver,
  ordinal, gbp, shortDate, cleanPot, cleanPayment, cleanDeposit, cleanMoneySettings, validDate } from '../js/money.js';

test('the notification function uses an exact copy of the app\'s money logic', () => {
  // supabase/functions/life-push/money.js is a copy of life/js/money.js (a function bundle cannot import from the app folder).
  // If this fails: copy the app file over the function's copy and redeploy.
  const app = fs.readFileSync(new URL('../js/money.js', import.meta.url), 'utf8');
  const fn = fs.readFileSync(new URL('../../supabase/functions/life-push/money.js', import.meta.url), 'utf8');
  assert.equal(fn, app);
});

test('addMonths keeps the day but never passes the end of the month', () => {
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(addMonths('2027-01-31', 2, 31), '2027-03-31'); // anchored on the original day, not on a clamped one
});

test('rollDue moves a saved date forward to the next occurrence', () => {
  assert.equal(rollDue('2026-12-03', 'monthly', '2026-12-03'), '2026-12-03'); // due today counts
  assert.equal(rollDue('2026-09-03', 'monthly', '2026-12-04'), '2027-01-03');
  assert.equal(rollDue('2026-01-31', 'monthly', '2026-03-01'), '2026-03-31'); // keeps the 31st where it can
  assert.equal(rollDue('2026-11-02', 'weekly', '2026-12-03'), '2026-12-07');
  assert.equal(rollDue('2025-03-14', 'yearly', '2026-12-03'), '2027-03-14');
  assert.equal(rollDue('2024-02-29', 'yearly', '2026-12-03'), '2027-02-28');
  assert.equal(rollDue('2026-06-01', 'one_off', '2026-12-03'), '2026-06-01'); // a one-off never rolls
  assert.equal(rollDue('2027-03-14', 'yearly', '2026-12-03'), '2027-03-14'); // already ahead
});

test('monthly equivalents and the regular monthly total (yearly and one-off are covered by pots, not counted)', () => {
  assert.equal(monthlyEquivalent({ amount: 55, cadence: 'yearly' }).toFixed(2), '4.58');
  assert.equal(monthlyEquivalent({ amount: 12, cadence: 'weekly' }).toFixed(2), '52.00');
  assert.equal(monthlyEquivalent({ amount: 88.5, cadence: 'one_off' }), 0);
  const pays = [{ amount: 30, cadence: 'monthly' }, { amount: 22, cadence: 'monthly' }, { amount: 38, cadence: 'monthly' }, { amount: 29.99, cadence: 'monthly' },
    { amount: 55, cadence: 'yearly' }, { amount: 190, cadence: 'yearly' }, { amount: 88.5, cadence: 'one_off' }, { amount: 500, cadence: 'monthly', active: false }];
  assert.equal(regularMonthly(pays), 119.99);
  assert.equal(regularMonthly([]), 0);
});

test('payDates counts the pay days up to a date, today and the date included', () => {
  assert.equal(payDates('2026-11-27', '2027-04-30', 1).length, 5); // 1 Dec, Jan, Feb, Mar, Apr
  assert.deepEqual(payDates('2026-12-01', '2026-12-01', 1), ['2026-12-01']); // today is a pay day
  assert.equal(payDates('2026-12-02', '2027-01-01', 1).length, 1);
  assert.equal(payDates('2026-11-27', '2027-04-30', 28).length, 6); // 28 Nov ... 28 Apr
  assert.equal(payDates('2026-11-27', '2027-04-30', 31).length, 6); // clamped to the 28th
  assert.deepEqual(payDates('2027-01-01', '2026-01-01', 1), []);
});

const dep = (pot_id, amount, deposited_on) => ({ pot_id, amount, deposited_on });
const usa = { id: 'usa', target: 4500, target_date: '2027-04-30', monthly_amount: 500 };
const mot = { id: 'mot', target: 55, target_date: '2027-03-14', monthly_amount: null };
const tax = { id: 'tax', target: 190, target_date: '2027-06-01', monthly_amount: null };
const T = '2026-11-27';

test('USA trip: £500 a month from £1,500 reaches £4,000, so it is £500 short and needs £600', () => {
  const p = potPlan(usa, 1500, T, 1);
  assert.equal(p.left, 5); assert.equal(p.projected, 4000); assert.equal(p.short, 500); assert.equal(p.requiredMonthly, 600); assert.equal(p.status, 'short'); assert.equal(p.planned, 500);
  const fixed = potPlan({ ...usa, monthly_amount: 600 }, 1500, T, 1);
  assert.equal(fixed.short, 0); assert.equal(fixed.status, 'ontrack');
});

test('bill pots are told what to put aside: needed divided by the pay days left, rounded up', () => {
  const m = potPlan(mot, 15, T, 1);
  assert.equal(m.left, 4); assert.equal(m.suggested, 10); assert.equal(m.planned, 10); assert.equal(m.status, 'ontrack');
  const c = potPlan(tax, 50, T, 1);
  assert.equal(c.left, 7); assert.equal(c.suggested, 20); assert.equal(c.status, 'ontrack');
  assert.equal(potPlan({ ...mot, target: 100 }, 0, T, 1).suggested, 25); // 100 / 4
  assert.equal(potPlan({ ...mot, target: 100 }, 0, '2026-12-02', 1).suggested, 33.34); // 100 / 3 rounds up so it always arrives
  assert.equal(potPlan({ ...mot, target: 100 }, 0, '2026-12-02', 1).projected >= 100, true);
});

test('a month where pay day has passed and nothing is moved yet keeps its share, instead of raising every later month', () => {
  const tax2 = potPlan(tax, 50, '2026-12-02', 1, 0); // 1 Dec has gone, nothing moved: still owed
  assert.equal(tax2.left, 7); assert.equal(tax2.suggested, 20);
  assert.equal(potPlan(tax, 50, '2026-12-02', 1, 20).left, 6); // moved: this month is done
  assert.equal(potPlan(tax, 50, '2026-12-02', 1).left, 6); // moved not given: ignored
  assert.equal(potPlan(tax, 50, '2026-12-01', 1, 0).left, 7); // today IS pay day: counted once, not twice
  assert.equal(potPlan({ ...mot, target_date: '2026-11-20' }, 15, '2026-12-02', 1, 0).left, 0); // due before this month's pay day: nothing owed
});

test('pot status: done, no date, and a date that has passed', () => {
  assert.equal(potPlan(mot, 55, T, 1).status, 'done');
  assert.equal(potPlan(mot, 80, T, 1).planned, 0);
  const free = potPlan({ id: 'x', target: 1000, target_date: null, monthly_amount: 50 }, 100, T, 1);
  assert.equal(free.status, 'nodate'); assert.equal(free.planned, 50); assert.equal(free.left, 0);
  const late = potPlan({ ...mot, target_date: '2026-11-01' }, 15, T, 1);
  assert.equal(late.status, 'short'); assert.equal(late.overdue, true); assert.equal(late.requiredMonthly, 40);
});

test('balances and what has been moved this month', () => {
  const ds = [dep('usa', 1500, '2026-11-27'), dep('usa', 500, '2026-12-01'), dep('usa', -100, '2026-12-05'), dep('mot', 10, '2026-12-01'), dep('mot', 10, '2026-11-01')];
  assert.equal(potBalance(ds, 'usa'), 1900);
  assert.equal(potBalance(ds, 'nothing'), 0);
  assert.equal(movedThisMonth(ds, 'usa', '2026-12-10'), 500); // the withdrawal is not "moved in"
  assert.equal(movedThisMonth(ds, 'mot', '2026-12-10'), 10);
  assert.equal(movedThisMonth(ds, 'mot', '2027-01-02'), 0);
});

test('the transfer checklist: £530 this month, and what is still to move', () => {
  const ds = [dep('usa', 1500, '2026-11-27'), dep('mot', 15, '2026-11-27'), dep('tax', 50, '2026-11-27')];
  const c = transferChecklist([usa, mot, tax], ds, '2026-12-01', 1);
  assert.deepEqual(c.items.map((i) => [i.pot.id, i.amount]), [['usa', 500], ['mot', 10], ['tax', 20]]);
  assert.equal(c.total, 530); assert.equal(c.toMove, 530);
  const after = transferChecklist([usa, mot, tax], [...ds, dep('usa', 500, '2026-12-01'), dep('mot', 10, '2026-12-01')], '2026-12-02', 1);
  assert.equal(after.items.find((i) => i.pot.id === 'usa').done, true);
  assert.equal(after.items.find((i) => i.pot.id === 'tax').done, false);
  assert.equal(after.toMove, 20);
  assert.equal(transferChecklist([mot], [dep('mot', 55, '2026-12-01')], '2026-12-02', 1).items.length, 0); // a full pot needs nothing
});

test('left over: income minus regular payments minus pot transfers', () => {
  assert.equal(leftOver(2400, 119.99, 530), 1750.01);
  assert.equal(leftOver(null, 119.99, 530), null);
  assert.equal(leftOver('', 1, 1), null);
});

test('due soon and the morning line', () => {
  const pays = [
    { title: 'Broadband', amount: 30, cadence: 'monthly', next_due: '2026-09-01' }, { title: 'Phone', amount: 22, cadence: 'monthly', next_due: '2026-11-01' },
    { title: 'Car insurance', amount: 38, cadence: 'monthly', next_due: '2026-11-03' }, { title: 'Gym', amount: 29.99, cadence: 'monthly', next_due: '2026-11-08' },
    { title: 'Old one-off', amount: 99, cadence: 'one_off', next_due: '2026-10-01' }, { title: 'Stopped', amount: 5, cadence: 'monthly', next_due: '2026-12-01', active: false }];
  assert.deepEqual(dueSoon(pays, '2026-11-27', 14).map((p) => [p.title, p.due]), [['Broadband', '2026-12-01'], ['Phone', '2026-12-01'], ['Car insurance', '2026-12-03'], ['Gym', '2026-12-08']]);
  assert.deepEqual(paymentLines(pays, '2026-11-27', 3), []); // nothing in the next 3 days
  assert.deepEqual(paymentLines(pays, '2026-11-30', 3), ['Going out: Broadband £30 (tomorrow), Phone £22 (tomorrow), Car insurance £38 (3 Dec)']);
  assert.match(paymentLines(pays, '2026-12-01', 10, 2)[0], /^Going out: Broadband £30 \(today\), Phone £22 \(today\), \+2 more$/);
});

test('formatting helpers', () => {
  assert.equal(gbp(30), '£30'); assert.equal(gbp(29.99), '£29.99'); assert.equal(gbp(1750.01), '£1,750.01'); assert.equal(gbp(-100), '-£100'); assert.equal(gbp(1500), '£1,500');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 28].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '28th']);
  assert.equal(shortDate('2026-12-03'), '3 Dec');
  assert.equal(validDate('2026-12-03'), true); assert.equal(validDate('3 Dec'), false); assert.equal(validDate(''), false);
});

test('the forms: what they may save', () => {
  assert.equal(cleanPot({ name: '', target: 55 }), null);
  assert.equal(cleanPot({ name: 'MOT', target: 0 }), null);
  const p = cleanPot({ name: ' MOT ', kind: 'bill', target: '£55', date: '2027-03-14', goal: '', saved: '15', monthly: '' });
  assert.deepEqual(p, { row: { name: 'MOT', kind: 'bill', target: 55, target_date: '2027-03-14', goal_id: null, monthly_amount: null, sort_order: 0 }, saved: 15 });
  assert.equal(cleanPot({ name: 'x', kind: 'weird', target: 10, monthly: '5', date: 'soon' }).row.kind, 'bill');
  assert.equal(cleanPot({ name: 'x', target: 10, monthly: '5', date: 'soon' }).row.monthly_amount, 5);
  assert.equal(cleanPot({ name: 'x', target: 10, date: 'soon' }).row.target_date, null);
  assert.equal(cleanPayment({ title: 'Phone', amount: '22', cadence: 'monthly', next_due: '' }), null);
  assert.equal(cleanPayment({ title: 'Phone', amount: '-5', cadence: 'monthly', next_due: '2026-12-01' }), null);
  assert.deepEqual(cleanPayment({ title: ' Phone ', amount: '22.00', cadence: 'weird', next_due: '2026-12-01', pot: 'p1' }), { title: 'Phone', amount: 22, cadence: 'monthly', next_due: '2026-12-01', pot_id: 'p1', active: true });
  assert.deepEqual(cleanDeposit({ amount: '£500', note: ' moved ' }), { amount: 500, note: 'moved' });
  assert.deepEqual(cleanDeposit({ amount: '-100' }), { amount: -100, note: '' }); // a minus takes money out
  assert.equal(cleanDeposit({ amount: '0' }), null); assert.equal(cleanDeposit({ amount: 'abc' }), null);
  assert.deepEqual(cleanMoneySettings({ income: '2,400', payday: '15' }), { income: 2400, payday: 15 });
  assert.deepEqual(cleanMoneySettings({ income: '', payday: '40' }), { income: null, payday: 1 });
});
