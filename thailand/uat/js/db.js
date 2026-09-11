// Thin data-access layer over the `thailand_uat` schema. Every function throws
// on error (with the Supabase error message attached) so callers can toast it.
//
// Same house rule as usa/js/db.js: every list() is scoped to a trip id passed
// explicitly by the caller (always state.trip.id), not just left to RLS — belt
// and suspenders, even though this schema's RLS is currently wide open to the
// anon key (see the thailand_uat_rls_and_grants migration for why). items and
// itinerary_entries hang off legs rather than trip_id directly, so those two
// join through legs!inner(trip_id) to stay scoped the same way.
import { supabase } from './supabaseClient.js';

function checkError(error) {
  if (error) throw new Error(error.message || 'Database error');
}

async function listByTrip(table, tripId, orderCol) {
  const { data, error } = await supabase.from(table).select('*').eq('trip_id', tripId).order(orderCol);
  checkError(error);
  return data || [];
}

async function listByLegOfTrip(table, tripId, orderCol) {
  const { data, error } = await supabase
    .from(table)
    .select('*, legs!inner(trip_id)')
    .eq('legs.trip_id', tripId)
    .order(orderCol);
  checkError(error);
  return (data || []).map((row) => { const { legs, ...rest } = row; return rest; });
}

async function insertOne(table, values) {
  const { data, error } = await supabase.from(table).insert(values).select().single();
  checkError(error);
  return data;
}

async function updateOne(table, id, values) {
  const { data, error } = await supabase.from(table).update(values).eq('id', id).select().single();
  checkError(error);
  return data;
}

async function removeOne(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  checkError(error);
}

export const db = {
  trip: {
    // One shared trip, no ownership filter — see config.js/CLAUDE.md on why.
    async get() {
      const { data, error } = await supabase.from('trip').select('*').order('created_at').limit(1).maybeSingle();
      checkError(error);
      return data;
    },
    update: (id, values) => updateOne('trip', id, values)
  },
  legs: {
    list: (tripId) => listByTrip('legs', tripId, 'sort_order'),
    update: (id, values) => updateOne('legs', id, values)
  },
  flightLegs: {
    list: (tripId) => listByTrip('flight_legs', tripId, 'sort_order')
  },
  items: {
    list: (tripId) => listByLegOfTrip('items', tripId, 'sort_order'),
    create: (values) => insertOne('items', values),
    update: (id, values) => updateOne('items', id, values),
    remove: (id) => removeOne('items', id)
  },
  itineraryEntries: {
    list: (tripId) => listByLegOfTrip('itinerary_entries', tripId, 'sort_order'),
    create: (values) => insertOne('itinerary_entries', values),
    update: (id, values) => updateOne('itinerary_entries', id, values),
    remove: (id) => removeOne('itinerary_entries', id)
  },
  bookings: {
    list: (tripId) => listByTrip('bookings', tripId, 'sort_order'),
    create: (values) => insertOne('bookings', values),
    update: (id, values) => updateOne('bookings', id, values),
    remove: (id) => removeOne('bookings', id)
  },
  accommodations: {
    list: (tripId) => listByTrip('accommodations', tripId, 'sort_order'),
    create: (values) => insertOne('accommodations', values),
    update: (id, values) => updateOne('accommodations', id, values),
    remove: (id) => removeOne('accommodations', id)
  },
  packingItems: {
    list: (tripId) => listByTrip('packing_items', tripId, 'sort_order'),
    create: (values) => insertOne('packing_items', values),
    update: (id, values) => updateOne('packing_items', id, values),
    remove: (id) => removeOne('packing_items', id)
  }
};
