// Thin data-access layer over the `thailand` schema. Every function throws
// on error (with the Supabase error message attached) so callers can toast it.
//
// Same house rule as usa/js/db.js: every list() is scoped to a trip id passed
// explicitly by the caller (always state.trip.id), not just left to RLS — belt
// and suspenders, even though this schema's RLS is wide open to the anon key
// (see the thailand_uat_rls_and_grants migration, predating the schema rename,
// for why). items and itinerary_entries hang off legs rather than trip_id
// directly, so those two join through legs!inner(trip_id) to stay scoped the
// same way.
//
// OFFLINE SNAPSHOTS. Every successful read is also saved to IndexedDB
// (offlineStore.js); when a read can't reach Supabase — browser offline, request
// failed/timed out, or a 5xx — the saved snapshot is returned instead and
// offline.js is told, which shows the banner and locks the write controls.
// Snapshots are keyed per trip (`<tripId>:<table>`, plus a `trip` record
// holding the trip row itself) and re-checked against the trip id on read, so
// one trip's rows can never be served for another. Successful writes patch the
// matching snapshot in place so a reload offline doesn't lose an edit that
// reached the server a moment earlier. Offline writes are refused outright
// (assertWritable) rather than left to fail silently.
import { supabase } from './supabaseClient.js';
import { snapGet, snapPut, snapPatch, snapPruneExcept } from './offlineStore.js';
import { noteSnapshotUsed, assertWritable, offlineState } from './offline.js';

// With a snapshot to fall back on there is no reason to wait out a dead
// connection (one bar of signal can hang a request for minutes).
const SNAPSHOT_TIMEOUT_MS = 8000;

let activeTripId = null; // set by every trip-scoped read; keys snapshot patches after writes

function checkError(error) {
  if (error) throw new Error(error.message || 'Database error');
}

// Connectivity failures and server outages fall back to the snapshot; 4xx
// (bad query, missing schema, RLS) are real bugs and still surface.
function isUnreachable(res) {
  return !!res.error && (res.status === 0 || res.status >= 500 || res.status === undefined);
}

function timeoutSignal() {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS) : undefined;
}

// run(signal) performs the Supabase query and returns {data, error, status};
// shape(data) turns the raw rows into what callers get (and what is stored).
async function readWithSnapshot(snapKey, tripId, run, shape) {
  const snap = await snapGet(snapKey);
  const usable = snap && (tripId == null || snap.tripId === tripId) ? snap : null;

  let res;
  // Browser says offline — or an earlier read in this same load already found the
  // server unreachable (offlineState is reset per load) — so don't make every
  // remaining table wait out its own timeout; go straight to the snapshot.
  if (usable && ((typeof navigator !== 'undefined' && navigator.onLine === false) || offlineState.fromSnapshot)) {
    res = { error: { message: 'offline' }, status: 0 };
  } else {
    try { res = await run(usable ? timeoutSignal() : undefined); }
    catch (err) { res = { error: { message: String(err && err.message || err) }, status: 0 }; }
  }

  if (!res.error) {
    const out = shape(res.data);
    if (out !== null) await snapPut(snapKey, { savedAt: Date.now(), tripId, data: out });
    return out;
  }
  if (usable && isUnreachable(res)) {
    noteSnapshotUsed(usable.savedAt);
    return usable.data;
  }
  checkError(res.error);
}

// After a write that reached the server, mirror it into that table's snapshot.
function patchSnapshot(table, fn) {
  if (!activeTripId) return Promise.resolve();
  return snapPatch(activeTripId + ':' + table, (rec) => {
    if (!rec || !Array.isArray(rec.data)) return undefined;
    return Object.assign({}, rec, { data: fn(rec.data) });
  });
}

async function listByTrip(table, tripId, orderCol) {
  activeTripId = tripId;
  return readWithSnapshot(
    tripId + ':' + table, tripId,
    (signal) => {
      let q = supabase.from(table).select('*').eq('trip_id', tripId).order(orderCol);
      if (signal) q = q.abortSignal(signal);
      return q;
    },
    (data) => data || []
  );
}

async function listByLegOfTrip(table, tripId, orderCol) {
  activeTripId = tripId;
  return readWithSnapshot(
    tripId + ':' + table, tripId,
    (signal) => {
      let q = supabase.from(table).select('*, legs!inner(trip_id)').eq('legs.trip_id', tripId).order(orderCol);
      if (signal) q = q.abortSignal(signal);
      return q;
    },
    (data) => (data || []).map((row) => { const { legs, ...rest } = row; return rest; })
  );
}

async function insertOne(table, values) {
  assertWritable();
  const { data, error } = await supabase.from(table).insert(values).select().single();
  checkError(error);
  await patchSnapshot(table, (rows) => rows.concat([data]));
  return data;
}

async function updateOne(table, id, values) {
  assertWritable();
  const { data, error } = await supabase.from(table).update(values).eq('id', id).select().single();
  checkError(error);
  if (table === 'trip') {
    await snapPatch('trip', (rec) => (rec && rec.data && rec.data.id === id ? Object.assign({}, rec, { data }) : undefined));
  } else {
    await patchSnapshot(table, (rows) => rows.map((r) => (r.id === id ? Object.assign({}, r, data) : r)));
  }
  return data;
}

async function removeOne(table, id) {
  assertWritable();
  const { error } = await supabase.from(table).delete().eq('id', id);
  checkError(error);
  await patchSnapshot(table, (rows) => rows.filter((r) => r.id !== id));
}

export const db = {
  trip: {
    // One shared trip, no ownership filter — see config.js/CLAUDE.md on why.
    async get() {
      const trip = await readWithSnapshot(
        'trip', null,
        (signal) => {
          let q = supabase.from('trip').select('*').order('created_at').limit(1);
          if (signal) q = q.abortSignal(signal);
          return q.maybeSingle();
        },
        (data) => data || null // an empty result never overwrites a good snapshot
      );
      if (trip) {
        activeTripId = trip.id;
        snapPruneExcept(trip.id);
      }
      return trip;
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
