// Small shared app state: the trip/legs (used almost everywhere) and the
// GBP/USD display toggle. Not a framework — just a plain object plus a
// window event so the header and the active view can react to a toggle
// flip without prop-drilling.
import { db } from './db.js';

const CURRENCY_KEY = 'usa-trip-view-currency';

export const state = {
  trip: null,
  legs: []
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

export async function loadCore(){
  const [trip, legs] = await Promise.all([db.trips.getFirst(), db.legs.list()]);
  state.trip = trip;
  state.legs = legs;
  return state;
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
