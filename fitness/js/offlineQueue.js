// A small write queue that survives a page reload. Every write in this app
// goes through save() below: optimistic (the caller updates the UI first),
// then actually attempted against Supabase. If that attempt fails -- for
// any reason, not just detected offline-ness, since a flaky connection
// often only reveals itself as a failed fetch -- the write is persisted to
// localStorage under a stable key (last-write-wins per key, so ticking the
// same box five times before it ever succeeds queues once, not five times)
// and retried automatically when the browser comes back online or the app
// reloads. The caller always gets told whether the save actually landed, so
// it can show an inline "couldn't save" state rather than just swallowing
// the error into a console.log.

const STORAGE_KEY = 'fitness-offline-queue';

function readQueue(){
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function writeQueue(q){
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(q)); } catch (e) { /* ignore */ }
}

function setPending(key, kind, payload){
  const q = readQueue();
  q[key] = { kind, payload, queuedAt: Date.now() };
  writeQueue(q);
}

function clearPending(key){
  const q = readQueue();
  if (key in q) { delete q[key]; writeQueue(q); }
}

export function hasPending(key){
  const q = readQueue();
  return key in q;
}

export function pendingCount(){
  return Object.keys(readQueue()).length;
}

// run() performs the actual write and must throw on failure. kind+payload
// must be plain, JSON-serialisable data describing the same write, so a
// later flush() (possibly after a full reload, with `run` no longer in
// scope) can replay it via the `replayers` map passed to flush().
export async function save({ key, kind, payload, run }) {
  try {
    const result = await run();
    clearPending(key);
    return { ok: true, result };
  } catch (err) {
    setPending(key, kind, payload);
    return { ok: false, error: err, queued: true };
  }
}

// Attempts every queued write. `replayers` is a { [kind]: (payload) =>
// Promise } map supplied by the caller (main.js), since this module can't
// import db.js's specifics without coupling the queue to one shape of
// write forever.
export async function flush(replayers){
  const q = readQueue();
  const keys = Object.keys(q);
  if (!keys.length) return { attempted: 0, succeeded: 0 };
  let succeeded = 0;
  for (const key of keys) {
    const item = q[key];
    const replay = replayers[item.kind];
    if (!replay) continue;
    try {
      await replay(item.payload);
      clearPending(key);
      succeeded++;
    } catch (e) {
      // Leave it queued -- still offline, or still failing. Stop-on-first
      // failure per key only; other keys still get their own attempt.
    }
  }
  return { attempted: keys.length, succeeded };
}

export function initAutoFlush(replayers, onFlushed){
  window.addEventListener('online', async () => {
    const res = await flush(replayers);
    if (res.succeeded > 0 && onFlushed) onFlushed(res);
  });
}
