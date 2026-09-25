import { esc, fmtGBP, URGENCY_COLOR, URGENCY_RANK } from '../utils.js';
import { state } from '../state.js';

function legCard(leg) {
  const items = state.items.filter((i) => i.leg_id === leg.id);
  const checked = items.filter((i) => i.is_checked);
  const costGbp = checked.reduce((sum, i) => sum + Number(i.cost_gbp || 0), 0);
  return '<div class="panel" style="padding:0.9rem;">' +
    '<div class="panel-title"><span class="leg-num">' + esc(leg.leg_number) + '</span> ' + esc(leg.name) + '</div>' +
    '<div class="panel-sub">' + esc(leg.dates_label) + ' · ' + esc((leg.party || []).join(', ')) + '</div>' +
    '<div class="item-meta" style="margin-top:0.6rem;">' +
    '<span class="item-cost">' + checked.length + '/' + items.length + ' added</span>' +
    '<span class="item-cost">' + fmtGBP(costGbp) + 'pp so far</span>' +
    '</div></div>';
}

function upcomingBookingsHtml() {
  const open = state.bookings.filter((b) => !b.is_done)
    .sort((a, b) => (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9))
    .slice(0, 5);
  if (!open.length) return '<p class="section-note">Everything on the pre-trip checklist is done. 🎉</p>';
  return open.map((b) => (
    '<div class="row"><div class="urgency-dot" style="background:' + (URGENCY_COLOR[b.urgency] || URGENCY_COLOR.low) + ';"></div>' +
    '<div style="flex:1;min-width:0;"><div class="item-title">' + esc(b.title) + '</div>' +
    (b.deadline_label ? '<div class="deadline">' + esc(b.deadline_label) + '</div>' : '') + '</div></div>'
  )).join('');
}

export async function render(main) {
  const legsHtml = state.legs.map(legCard).join('');
  main.innerHTML =
    '<div class="page-head"><p class="page-title">Trip overview</p><p class="page-lede">Progress through each stop, and what still needs booking.</p></div>' +
    legsHtml +
    '<div class="panel" style="padding:0.9rem;margin-top:1rem;"><div class="panel-title">Coming up on the checklist</div><div style="margin-top:0.4rem;">' + upcomingBookingsHtml() + '</div></div>';
}
