// Thin data-access layer over the `usa` schema. Every function throws on
// error (with the Supabase error message attached) so callers can toast it.
import { supabase } from './supabaseClient.js';

function checkError(error){
  if (error) throw new Error(error.message || 'Database error');
}

async function listAll(table, { order } = {}) {
  let q = supabase.from(table).select('*');
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
    async getFirst(){
      const { data, error } = await supabase.from('trips').select('*').order('created_at').limit(1).maybeSingle();
      checkError(error);
      return data;
    },
    update: (id, values) => updateOne('trips', id, values)
  },
  legs: {
    list: () => listAll('legs', { order: { column: 'sort_order' } }),
    create: (values) => insertOne('legs', values),
    update: (id, values) => updateOne('legs', id, values),
    remove: (id) => removeOne('legs', id)
  },
  flights: {
    list: () => listAll('flights', { order: { column: 'created_at' } }),
    create: (values) => insertOne('flights', values),
    update: (id, values) => updateOne('flights', id, values),
    remove: (id) => removeOne('flights', id)
  },
  accommodations: {
    list: () => listAll('accommodations', { order: { column: 'check_in' } }),
    create: (values) => insertOne('accommodations', values),
    update: (id, values) => updateOne('accommodations', id, values),
    remove: (id) => removeOne('accommodations', id)
  },
  transport: {
    list: () => listAll('transport', { order: { column: 'created_at' } }),
    create: (values) => insertOne('transport', values),
    update: (id, values) => updateOne('transport', id, values),
    remove: (id) => removeOne('transport', id)
  },
  places: {
    list: () => listAll('places', { order: { column: 'name' } }),
    create: (values) => insertOne('places', values),
    update: (id, values) => updateOne('places', id, values),
    remove: (id) => removeOne('places', id)
  },
  itineraryItems: {
    list: () => listAll('itinerary_items', { order: { column: 'sort_order' } }),
    create: (values) => insertOne('itinerary_items', values),
    update: (id, values) => updateOne('itinerary_items', id, values),
    remove: (id) => removeOne('itinerary_items', id)
  },
  checklistItems: {
    list: () => listAll('checklist_items', { order: { column: 'sort_order' } }),
    create: (values) => insertOne('checklist_items', values),
    update: (id, values) => updateOne('checklist_items', id, values),
    remove: (id) => removeOne('checklist_items', id)
  },
  expenses: {
    list: () => listAll('expenses', { order: { column: 'date' } }),
    create: (values) => insertOne('expenses', values),
    update: (id, values) => updateOne('expenses', id, values),
    remove: (id) => removeOne('expenses', id)
  }
};
