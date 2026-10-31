// Small shared app state, same shape as usa/js/state.js: a plain object plus a
// window event so the header and the active view can react to a change without
// prop-drilling. No session here — this app has no per-account auth.
import { db } from './db.js';
import { beginLoad, endLoad } from './offline.js';

export const state = {
  trip: null,
  legs: [],
  flightLegs: [],
  items: [],
  itineraryEntries: [],
  bookings: [],
  accommodations: [],
  packingItems: []
};

export function legById(id) {
  return state.legs.find((l) => l.id === id) || null;
}

export async function loadCore() {
  beginLoad(); // db.js flags any table it had to serve from the offline snapshot
  try {
    return await loadCoreInner();
  } finally {
    endLoad(); // updates the offline banner / write-control locks
  }
}

async function loadCoreInner() {
  const trip = await db.trip.get();
  state.trip = trip;
  if (!trip) {
    state.legs = []; state.flightLegs = []; state.items = []; state.itineraryEntries = [];
    state.bookings = []; state.accommodations = []; state.packingItems = [];
    return null;
  }
  const [legs, flightLegs, items, itineraryEntries, bookings, accommodations, packingItems] = await Promise.all([
    db.legs.list(trip.id),
    db.flightLegs.list(trip.id),
    db.items.list(trip.id),
    db.itineraryEntries.list(trip.id),
    db.bookings.list(trip.id),
    db.accommodations.list(trip.id),
    db.packingItems.list(trip.id)
  ]);
  state.legs = legs;
  state.flightLegs = flightLegs;
  state.items = items;
  state.itineraryEntries = itineraryEntries;
  state.bookings = bookings;
  state.accommodations = accommodations;
  state.packingItems = packingItems;
  return trip;
}

export function notifyTripChanged() {
  window.dispatchEvent(new CustomEvent('th:tripchange'));
}
