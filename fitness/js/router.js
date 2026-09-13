import { qs, qsa } from './utils.js';
import * as today from './views/today.js';
import * as week from './views/week.js';
import * as plan from './views/plan.js';
import * as progress from './views/progress.js';
import * as checkin from './views/checkin.js';

export const ROUTES = [
  { key: 'today', label: 'Today', view: today },
  { key: 'week', label: 'Week', view: week },
  { key: 'plan', label: 'Plan', view: plan },
  { key: 'progress', label: 'Progress', view: progress },
  { key: 'checkin', label: 'Check-in', view: checkin }
];

function currentKey(){
  const hash = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.some((r) => r.key === hash) ? hash : 'today';
}

let renderToken = 0;

export async function renderRoute(){
  const key = currentKey();
  qsa('.tab-bar a').forEach((a) => {
    a.classList.toggle('is-active', a.dataset.route === key);
  });

  const main = qs('#app-main');
  const route = ROUTES.find((r) => r.key === key);
  const myToken = ++renderToken;

  main.innerHTML = '<p class="section-note">Loading…</p>';
  try {
    await route.view.render(main);
  } catch (err) {
    if (myToken !== renderToken) return; // a newer route render superseded this one
    main.innerHTML = `<div class="empty-state"><strong>Couldn't load this screen.</strong><p>${err && err.message ? err.message : 'Unknown error'}</p><button type="button" class="btn btn-quiet" id="routeRetry">Try again</button></div>`;
    const retry = qs('#routeRetry', main);
    if (retry) retry.addEventListener('click', () => renderRoute());
    console.error(err);
  }
}

export function initRouter(){
  window.addEventListener('hashchange', renderRoute);
}
