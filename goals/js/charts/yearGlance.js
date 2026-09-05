// Year at a glance: four quarter blocks — goals started, completed, dropped,
// and that quarter's review rating (if the review exists).

import { escapeHtml } from '../utils.js';

/** @param {{label:string, started:number, completed:number, dropped:number, rating:number|null}[]} quarters */
export function renderYearGlance(year, quarters) {
  const blocks = quarters.map((q) => `
    <div class="yg-block">
      <p class="yg-quarter">${escapeHtml(q.label)}</p>
      <div class="yg-stats">
        <div><span class="yg-num">${q.started}</span><span class="yg-unit">started</span></div>
        <div><span class="yg-num">${q.completed}</span><span class="yg-unit">achieved</span></div>
        <div><span class="yg-num">${q.dropped}</span><span class="yg-unit">dropped</span></div>
      </div>
      <p class="yg-rating">${q.rating ? '★'.repeat(q.rating) + '☆'.repeat(5 - q.rating) : 'No review yet'}</p>
    </div>
  `).join('');

  return `<div class="year-glance"><p class="yg-year">${year}</p><div class="yg-grid">${blocks}</div></div>`;
}
