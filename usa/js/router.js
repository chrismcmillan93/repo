import { qs } from './utils.js';
import * as overview from './views/overview.js';
import * as itinerary from './views/itinerary.js';
import * as bookings from './views/bookings.js';
import * as places from './views/places.js';
import * as costs from './views/costs.js';
import * as checklist from './views/checklist.js';

export const ROUTES = [
  { key: 'overview', label: 'Overview', view: overview },
  { key: 'itinerary', label: 'Itinerary', view: itinerary },
  { key: 'bookings', label: 'Bookings', view: bookings },
  { key: 'places', label: 'Places', view: places },
  { key: 'costs', label: 'Costs', view: costs },
  { key: 'checklist', label: 'Checklist', view: checklist }
];

function currentKey(){
  const hash = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.some((r) => r.key === hash) ? hash : 'overview';
}

let renderToken = 0;

export async function renderRoute(){
  const key = currentKey();
  qs('.app-nav').querySelectorAll('a').forEach((a) => {
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
    main.innerHTML = `<div class="empty-state"><strong>Couldn't load this screen</strong>${err && err.message ? err.message : 'Unknown error'}</div>`;
    console.error(err);
  }
}

export function initRouter(){
  window.addEventListener('hashchange', renderRoute);
}
