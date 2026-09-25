// Derived, not stored — same rule as usa/js/views/costs.js: sums checked
// items' cost_gbp/cost_thb, never persists a total. An item with no explicit
// cost_thb falls back to trip.thb_rate via thbFor(), same as the live app.
import { esc, fmtGBP, fmtTHBNum, thbFor } from '../utils.js';
import { state } from '../state.js';

export async function render(main) {
  const byLeg = {};
  state.legs.forEach((l) => { byLeg[l.id] = { gbp: 0, thb: 0 }; });
  let totalGbp = 0, totalThb = 0;
  state.items.filter((i) => i.is_checked).forEach((i) => {
    const g = Number(i.cost_gbp || 0);
    const t = thbFor(i, state.trip);
    if (byLeg[i.leg_id]) { byLeg[i.leg_id].gbp += g; byLeg[i.leg_id].thb += t; }
    totalGbp += g; totalThb += t;
  });

  const chips = state.legs.map((l) => (
    '<div class="cost-chip">' + esc(l.name) + '<br><b>' + fmtGBP(byLeg[l.id].gbp) + '</b> · <b>฿' + fmtTHBNum(byLeg[l.id].thb) + '</b></div>'
  )).join('');

  const accomGbp = state.accommodations.reduce((sum, a) => sum + Number(a.total_gbp || 0), 0);

  main.innerHTML =
    '<div class="page-head"><p class="page-title">Costs</p><p class="page-lede">Per person, based on what\'s ticked as "added to the trip".</p></div>' +
    '<div class="panel" style="padding:0.9rem;"><div class="panel-title">Activities &amp; food so far</div>' +
    '<div class="cost-total">' + fmtGBP(totalGbp) + ' <small>· ฿' + fmtTHBNum(totalThb) + '</small></div>' +
    '<div class="cost-caption">Estimated extras only — excludes flights &amp; accommodation. Rate ≈ £1 = ฿' + esc(Number(state.trip.thb_rate).toString()) + ', so this is roughly how much cash to carry for ticked items.</div>' +
    '<div class="cost-grid">' + chips + '</div></div>' +
    '<div class="panel" style="padding:0.9rem;margin-top:0.8rem;"><div class="panel-title">Accommodation</div>' +
    '<div class="cost-total">' + fmtGBP(accomGbp) + '</div>' +
    '<div class="cost-caption">Total across all confirmed stays — see the Accommodation tab for who\'s paid what.</div></div>';
}
