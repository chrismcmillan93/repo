import { db } from '../db.js';
import { state, getViewCurrency, legLabel } from '../state.js';
import { escapeHtml, formatMoney, convertToView } from '../utils.js';

const CATEGORY_LABEL = {
  flights: 'Flights',
  accommodation: 'Accommodation',
  transport: 'Transport',
  activities: 'Activities',
  food_and_drink: 'Food & drink',
  other: 'Other'
};
const CATEGORY_ORDER = ['flights', 'accommodation', 'transport', 'activities', 'food_and_drink', 'other'];

function emptyBucket(){ return { budgeted: 0, actual: 0 }; }

function addToBucket(buckets, key, budgeted, actual, trip, viewCurrency, currency){
  if (!buckets[key]) buckets[key] = emptyBucket();
  buckets[key].budgeted += convertToView(budgeted || 0, currency, trip, viewCurrency);
  buckets[key].actual += convertToView(actual || 0, currency, trip, viewCurrency);
}

function rowsHtml(buckets, order, labelFn){
  let tb = 0, ta = 0;
  const rows = order.map((key) => {
    const b = buckets[key] || emptyBucket();
    tb += b.budgeted; ta += b.actual;
    const remaining = b.budgeted - b.actual;
    return `<tr>
      <td>${escapeHtml(labelFn(key))}</td>
      <td class="num">${escapeHtml(formatMoney(b.budgeted, null))}</td>
      <td class="num">${escapeHtml(formatMoney(b.actual, null))}</td>
      <td class="num">${escapeHtml(formatMoney(remaining, null))}</td>
    </tr>`;
  }).join('');
  const totalRow = `<tr class="total-row">
    <td>Total</td>
    <td class="num">${escapeHtml(formatMoney(tb, null))}</td>
    <td class="num">${escapeHtml(formatMoney(ta, null))}</td>
    <td class="num">${escapeHtml(formatMoney(tb - ta, null))}</td>
  </tr>`;
  return rows + totalRow;
}

export async function render(container){
  const [flights, accommodations, transport, itineraryItems, expenses] = await Promise.all([
    db.flights.list(state.trip.id), db.accommodations.list(state.trip.id), db.transport.list(state.trip.id),
    db.itineraryItems.list(state.trip.id), db.expenses.list(state.trip.id)
  ]);

  const trip = state.trip;
  const viewCurrency = getViewCurrency();
  const symbol = viewCurrency === 'GBP' ? '£' : '$';

  const byCategory = {};
  const byLeg = {};
  let paid = 0, unpaid = 0;

  function legBucket(legId){
    const key = legId || 'trip-wide';
    if (!byLeg[key]) byLeg[key] = emptyBucket();
    return byLeg[key];
  }

  flights.forEach((f) => {
    addToBucket(byCategory, 'flights', f.budget_amount, f.actual_amount, trip, viewCurrency, f.currency);
    const b = legBucket(null);
    b.budgeted += convertToView(f.budget_amount || 0, f.currency, trip, viewCurrency);
    b.actual += convertToView(f.actual_amount || 0, f.currency, trip, viewCurrency);
    const amt = convertToView(f.actual_amount ?? f.budget_amount ?? 0, f.currency, trip, viewCurrency);
    if (f.is_paid) paid += amt; else unpaid += amt;
  });

  accommodations.forEach((a) => {
    addToBucket(byCategory, 'accommodation', a.budget_amount, a.actual_amount, trip, viewCurrency, a.currency);
    const b = legBucket(a.leg_id);
    b.budgeted += convertToView(a.budget_amount || 0, a.currency, trip, viewCurrency);
    b.actual += convertToView(a.actual_amount || 0, a.currency, trip, viewCurrency);
    const amt = convertToView(a.actual_amount ?? a.budget_amount ?? 0, a.currency, trip, viewCurrency);
    if (a.is_paid) paid += amt; else unpaid += amt;
  });

  transport.forEach((t) => {
    addToBucket(byCategory, 'transport', t.budget_amount, t.actual_amount, trip, viewCurrency, t.currency);
    const b = legBucket(t.leg_id);
    b.budgeted += convertToView(t.budget_amount || 0, t.currency, trip, viewCurrency);
    b.actual += convertToView(t.actual_amount || 0, t.currency, trip, viewCurrency);
    const amt = convertToView(t.actual_amount ?? t.budget_amount ?? 0, t.currency, trip, viewCurrency);
    if (t.is_paid) paid += amt; else unpaid += amt;
  });

  itineraryItems.forEach((i) => {
    // An unselected option in a choice group (e.g. the UFC-vs-Sphere
    // alternative you didn't pick) shouldn't double-count against the one
    // you did.
    if (!i.estimated_cost || !i.is_selected) return;
    addToBucket(byCategory, 'activities', i.estimated_cost, 0, trip, viewCurrency, i.currency);
    const b = legBucket(i.leg_id);
    b.budgeted += convertToView(i.estimated_cost, i.currency, trip, viewCurrency);
  });

  expenses.forEach((e) => {
    const cat = e.category || 'other';
    if (e.is_estimate) {
      addToBucket(byCategory, cat, e.amount, 0, trip, viewCurrency, e.currency);
    } else {
      addToBucket(byCategory, cat, 0, e.amount, trip, viewCurrency, e.currency);
    }
    const b = legBucket(e.leg_id);
    const amt = convertToView(e.amount || 0, e.currency, trip, viewCurrency);
    if (e.is_estimate) b.budgeted += amt; else b.actual += amt;
  });

  const legOrder = [...state.legs.map((l) => l.id), 'trip-wide'];
  const legLabelFn = (key) => key === 'trip-wide' ? 'Flights (trip-wide)' : legLabel(key);

  container.innerHTML = `
    <div class="page-head">
      <h1>Costs</h1>
      <p class="lede">Every figure below is converted into ${viewCurrency} at the current rate (1 GBP = ${trip ? Number(trip.fx_rate).toFixed(4) : '—'} USD) so categories and legs can be summed together.</p>
    </div>

    <section class="section">
      <div class="section-head"><h2>By category</h2></div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Category</th><th class="num">Budgeted (${symbol})</th><th class="num">Actual (${symbol})</th><th class="num">Remaining (${symbol})</th></tr></thead>
          <tbody>${rowsHtml(byCategory, CATEGORY_ORDER, (k) => CATEGORY_LABEL[k] || k)}</tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>By leg</h2></div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Leg</th><th class="num">Budgeted (${symbol})</th><th class="num">Actual (${symbol})</th><th class="num">Remaining (${symbol})</th></tr></thead>
          <tbody>${rowsHtml(byLeg, legOrder, legLabelFn)}</tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Paid vs unpaid</h2></div>
      <p class="section-note" style="margin-bottom:8px;">Flights, accommodation and transport only — the bookings with a paid state.</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th></th><th class="num">Amount (${symbol})</th></tr></thead>
          <tbody>
            <tr><td>Paid</td><td class="num">${escapeHtml(formatMoney(paid, null))}</td></tr>
            <tr><td>Unpaid</td><td class="num">${escapeHtml(formatMoney(unpaid, null))}</td></tr>
            <tr class="total-row"><td>Total</td><td class="num">${escapeHtml(formatMoney(paid + unpaid, null))}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}
