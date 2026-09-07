// Thin data-access layer over the `usa` schema. Every function throws on
// error (with the Supabase error message attached) so callers can toast it.
//
// Every list() below is scoped to a trip_id, passed explicitly by the
// caller (always state.trip.id) rather than relying on RLS alone to keep
// two different people's trips apart — belt and suspenders, and it also
// means these queries still make sense before RLS is fully tightened.
import { supabase } from './supabaseClient.js';

function checkError(error){
  if (error) throw new Error(error.message || 'Database error');
}

async function listByTrip(table, tripId, { order } = {}) {
  let q = supabase.from(table).select('*').eq('trip_id', tripId);
  if (order) q = q.order(order.column, { ascending: order.ascending !== false });
  const { data, error } = await q;
  checkError(error);
  return data || [];
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
  trips: {
    // Scoped to the signed-in user explicitly, not just RLS — a brand new
    // account must never be handed someone else's trip by accident.
    async getFirst(userId){
      const { data, error } = await supabase.from('trips').select('*').eq('user_id', userId).order('created_at').limit(1).maybeSingle();
      checkError(error);
      return data;
    },
    create: (values) => insertOne('trips', values),
    update: (id, values) => updateOne('trips', id, values)
  },
  legs: {
    list: (tripId) => listByTrip('legs', tripId, { order: { column: 'sort_order' } }),
    // Legs marked is_shared are readable across trips (once RLS allows it)
    // for the cross-trip "same stop, different trip" view — e.g. two
    // travellers both in Vegas for the same wedding. Excludes this trip's
    // own legs since those are already shown normally.
    async listSharedElsewhere(tripId){
      const { data, error } = await supabase
        .from('legs')
        .select('*, trips(name)')
        .eq('is_shared', true)
        .neq('trip_id', tripId);
      checkError(error);
      return data || [];
    },
    create: (values) => insertOne('legs', values),
    update: (id, values) => updateOne('legs', id, values),
    remove: (id) => removeOne('legs', id)
  },
  flights: {
    list: (tripId) => listByTrip('flights', tripId, { order: { column: 'created_at' } }),
    create: (values) => insertOne('flights', values),
    update: (id, values) => updateOne('flights', id, values),
    remove: (id) => removeOne('flights', id)
  },
  accommodations: {
    list: (tripId) => listByTrip('accommodations', tripId, { order: { column: 'check_in' } }),
    create: (values) => insertOne('accommodations', values),
    update: (id, values) => updateOne('accommodations', id, values),
    remove: (id) => removeOne('accommodations', id)
  },
  transport: {
    list: (tripId) => listByTrip('transport', tripId, { order: { column: 'created_at' } }),
    create: (values) => insertOne('transport', values),
    update: (id, values) => updateOne('transport', id, values),
    remove: (id) => removeOne('transport', id)
  },
  places: {
    list: (tripId) => listByTrip('places', tripId, { order: { column: 'name' } }),
    create: (values) => insertOne('places', values),
    update: (id, values) => updateOne('places', id, values),
    remove: (id) => removeOne('places', id)
  },
  itineraryItems: {
    list: (tripId) => listByTrip('itinerary_items', tripId, { order: { column: 'sort_order' } }),
    // Items on a leg marked is_shared, belonging to someone else's trip.
    // Joins places(...) for location detail -- readable under the matching
    // "shared leg place read" RLS policy, which only opens up a place when
    // it's actually referenced from a shared leg's itinerary (see
    // usa_shared_leg_place_read migration), same read-only shape as the
    // leg/item policies themselves.
    async listSharedElsewhere(tripId){
      const { data, error } = await supabase
        .from('itinerary_items')
        .select('*, legs!inner(is_shared, name, city), trips(name), places(name, address, maps_url, rating)')
        .eq('legs.is_shared', true)
        .neq('trip_id', tripId);
      checkError(error);
      return data || [];
    },
    create: (values) => insertOne('itinerary_items', values),
    update: (id, values) => updateOne('itinerary_items', id, values),
    remove: (id) => removeOne('itinerary_items', id)
  },
  checklistItems: {
    list: (tripId) => listByTrip('checklist_items', tripId, { order: { column: 'sort_order' } }),
    create: (values) => insertOne('checklist_items', values),
    update: (id, values) => updateOne('checklist_items', id, values),
    remove: (id) => removeOne('checklist_items', id)
  },
  expenses: {
    list: (tripId) => listByTrip('expenses', tripId, { order: { column: 'date' } }),
    create: (values) => insertOne('expenses', values),
    update: (id, values) => updateOne('expenses', id, values),
    remove: (id) => removeOne('expenses', id)
  }
};
