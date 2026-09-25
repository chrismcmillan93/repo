import { esc, fmtGBP, toast, friendlyError } from '../utils.js';
import { state, legById } from '../state.js';
import { db } from '../db.js';

let wired = false;
let mainEl = null;

function partyFor(a) {
  if (a.party_override && a.party_override.length) return a.party_override;
  const leg = legById(a.leg_id);
  return (leg && leg.party) || [];
}

function stubHtml(a) {
  const party = partyFor(a);
  const chips = party.map((name) => {
    const paid = !!(a.paid && a.paid[name]);
    return '<button class="person-chip ' + (paid ? 'paid' : '') + '" data-action="toggle-paid" data-id="' + a.id + '" data-name="' + esc(name) + '">' +
      '<span class="dot"></span>' + esc(name) + (paid ? ' · paid' : '') + '</button>';
  }).join('');
  const leg = legById(a.leg_id);
  return '<div class="stub">' +
    '<div class="stub-top"><div><div class="stub-name">' + esc(a.name) + '</div>' +
    '<div class="stub-host">' + esc(a.host || '') + (leg ? ' · ' + esc(leg.name) : '') + '</div></div>' +
    '<div class="item-cost" style="text-align:right;">' + (a.total_gbp != null ? fmtGBP(a.total_gbp) : '—') + '</div></div>' +
    '<div class="stub-dates">' +
    '<div class="stub-datecol"><div class="stub-datelabel">Check-in</div><div class="stub-dateval">' + esc(a.check_in_label || '—') + '</div></div>' +
    '<div class="stub-datecol"><div class="stub-datelabel">Check-out</div><div class="stub-dateval">' + esc(a.check_out_label || '—') + '</div></div>' +
    '</div>' +
    (a.address ? '<div class="item-desc" style="margin-top:0.5rem;">' + esc(a.address) + '</div>' : '') +
    (a.note ? '<div class="stub-note">' + esc(a.note) + '</div>' : '') +
    (chips ? '<div class="stub-people">' + chips + '</div>' : '') +
    '</div>';
}

function rerender() { if (mainEl) render(mainEl); }
async function withErrorToast(fn) { try { await fn(); } catch (err) { toast(friendlyError(err)); } }

function wire(main) {
  if (wired) return;
  wired = true;
  main.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="toggle-paid"]');
    if (!btn) return;
    const a = state.accommodations.find((x) => x.id === btn.dataset.id);
    if (!a) return;
    const name = btn.dataset.name;
    const paid = Object.assign({}, a.paid, { [name]: !(a.paid && a.paid[name]) });
    a.paid = paid;
    rerender();
    await withErrorToast(() => db.accommodations.update(a.id, { paid }));
  });
}

export async function render(main) {
  mainEl = main;
  wire(main);
  const sorted = state.accommodations.slice().sort((a, b) => a.sort_order - b.sort_order);
  const totalGbp = sorted.reduce((sum, a) => sum + Number(a.total_gbp || 0), 0);
  const rows = sorted.length ? sorted.map(stubHtml).join('') : '<div class="empty">No accommodation logged yet.</div>';
  main.innerHTML =
    '<div class="page-head"><p class="page-title">Accommodation</p><p class="page-lede">Tap a name to mark it paid. Total across all stops: ' + fmtGBP(totalGbp) + '.</p></div>' +
    '<div class="panel"><div class="panel-body" style="border-top:none;padding-top:0.4rem;">' + rows + '</div></div>';
}
