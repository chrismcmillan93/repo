// Small shared app state: the current session, the trip/legs (used almost
// everywhere) and the GBP/USD display toggle. Not a framework — just a
// plain object plus a window event so the header and the active view can
// react to a toggle flip without prop-drilling.
import { db } from './db.js';

const CURRENCY_KEY = 'usa-trip-view-currency';

export const state = {
  session: null,
  trip: null,
  legs: [],
  sharedLegsElsewhere: [] // other people's is_shared legs (e.g. their Vegas stop)
};

export function getViewCurrency(){
  try {
    const v = window.localStorage.getItem(CURRENCY_KEY);
    return v === 'USD' ? 'USD' : 'GBP';
  } catch (e) {
    return 'GBP';
  }
}

export function setViewCurrency(code){
  try { window.localStorage.setItem(CURRENCY_KEY, code); } catch (e) { /* ignore */ }
  window.dispatchEvent(new CustomEvent('usa:currencychange', { detail: { currency: code } }));
}

// Loads the signed-in user's own trip + its legs, plus a read-only list of
// any *other* trip's legs marked is_shared (the cross-trip Vegas view).
// Returns null (leaving state.trip untouched by callers) if this account
// has no trip yet — the caller decides what to do about that.
export async function loadCore(userId){
  const trip = await db.trips.getFirst(userId);
  state.trip = trip;
  if (!trip) { state.legs = []; state.sharedLegsElsewhere = []; return null; }
  const [legs, sharedElsewhere] = await Promise.all([
    db.legs.list(trip.id),
    db.legs.listSharedElsewhere(trip.id)
  ]);
  state.legs = legs;
  state.sharedLegsElsewhere = sharedElsewhere;
  return trip;
}

export function legById(id){
  return state.legs.find((l) => l.id === id) || null;
}

export function legLabel(id){
  const leg = legById(id);
  return leg ? leg.name : '—';
}

export function notifyTripChanged(){
  window.dispatchEvent(new CustomEvent('usa:tripchange'));
}
