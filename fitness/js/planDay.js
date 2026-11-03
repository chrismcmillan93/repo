// Shared rendering for one day of the v2 training plan, used by Today, Week
// and Plan so the three screens can never disagree about what a day contains.
// Works on both a plan_days row and the `plan_day` object get_day_bundle()
// nests into a session -- they share the same field names.
//
// Runs are shown miles-first ("3 mi (4.8 km)"); the plan's own session text
// already reads that way, so it is shown as-is. duration_min is an 11 min/mi
// estimate the plan marks "for display only" and is deliberately NOT shown
// for runs -- no minutes-based run display. The only minutes on a run are the
// time cap on long runs, which is a rule, not an estimate.
import { escapeHtml } from './utils.js';

const MODE_LABEL = {
  full: 'Full', reduced: 'Reduced', heavy: 'Heavy', short: 'Short', taper: 'Taper',
  upper: 'Upper only', hotel: 'Hotel gym', optional: 'Optional', none: 'No lift'
};

export function modeLabel(mode){
  return MODE_LABEL[mode] || mode || '';
}

// Chips: mode (lifts), time cap (long runs), optional.
export function planChipsHtml(d){
  const chips = [];
  if (d.type === 'lift' && d.mode) chips.push(`<li class="plan-chip chip-mode">Mode: ${escapeHtml(modeLabel(d.mode))}</li>`);
  if (d.time_cap_min) chips.push(`<li class="plan-chip chip-cap">Time cap: ${escapeHtml(d.time_cap_min)} min</li>`);
  if (d.optional) chips.push('<li class="plan-chip chip-optional">Optional</li>');
  return chips.length ? `<ul class="plan-chips">${chips.join('')}</ul>` : '';
}

// Free-text lines under the title: stair finisher, effort, venue.
export function planLinesHtml(d){
  const lines = [];
  if (d.finisher) lines.push(`<p class="plan-line plan-finisher"><span class="plan-line-label">Stair finisher</span> ${escapeHtml(d.finisher)}</p>`);
  // "See session" is the plan's own placeholder meaning "the session text above is the effort".
  if (d.effort && d.effort !== 'See session') lines.push(`<p class="plan-line plan-effort">${escapeHtml(d.effort)}</p>`);
  if (d.venue_hint) lines.push(`<p class="plan-line plan-venue">${escapeHtml(d.venue_hint)}</p>`);
  return lines.join('');
}

export function planModeHelpHtml(d){
  if (d.type !== 'lift' || !d.mode || !d.mode_description) return '';
  return `<details class="plan-mode-help"><summary>What does ${escapeHtml(modeLabel(d.mode).toLowerCase())} mean?</summary><p>${escapeHtml(d.mode_description)}</p></details>`;
}

// Weekly context: phase/load, the week's notes, and the Monday weight target
// (only shown when the week has one -- weeks 1-6).
export function planWeekHtml(week, { showWeightTarget = true } = {}){
  if (!week) return '';
  const target = showWeightTarget && week.weight_target_kg_monday != null
    ? `<p class="plan-weight-target">Monday weigh-in target <strong>${Number(week.weight_target_kg_monday).toFixed(1)} kg</strong></p>` : '';
  const notes = week.notes ? `<p class="plan-week-notes">${escapeHtml(week.notes)}</p>` : '';
  return `${target}${notes}`;
}
