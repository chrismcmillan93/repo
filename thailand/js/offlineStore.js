// Tiny IndexedDB key/value store for the offline data snapshots (see db.js).
//
// One object store, `snapshots`, keyed by strings the data layer builds
// (`trip`, or `<tripId>:<table>`). Every call resolves rather than throws when
// IndexedDB is unavailable (private mode, storage blocked, quota) — the app
// then simply behaves as it did before offline support: live data or an error.
const DB_NAME = 'thailand-offline';
const DB_VERSION = 1;
const STORE = 'snapshots';

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
    dbPromise.catch(() => { dbPromise = null; }); // allow a retry on the next call
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function snapGet(key) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[offline] snapshot read failed', key, err);
    return null;
  }
}

export async function snapPut(key, value) {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    await done(tx);
    return true;
  } catch (err) {
    console.warn('[offline] snapshot write failed', key, err);
    return false;
  }
}

// Read-modify-write in ONE transaction, so two quick edits can't clobber each
// other. `fn` receives the stored record (or null) and returns the new one, or
// undefined to leave it alone. Used to keep a snapshot in step with a write.
export async function snapPatch(key, fn) {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(key);
    req.onsuccess = () => {
      const next = fn(req.result || null);
      if (next !== undefined) store.put(next, key);
    };
    await done(tx);
  } catch (err) {
    console.warn('[offline] snapshot patch failed', key, err);
  }
}

// Drop every record except `trip` and those belonging to `tripId`, so a
// replaced trip row can never leave an old trip's data lying around.
export async function snapPruneExcept(tripId) {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.openKeyCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      const k = String(cur.key);
      if (k !== 'trip' && !k.startsWith(tripId + ':')) store.delete(cur.key);
      cur.continue();
    };
    await done(tx);
  } catch (err) {
    console.warn('[offline] snapshot prune failed', err);
  }
}
