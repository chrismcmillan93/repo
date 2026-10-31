// Offline state + UX. Offline is READ-ONLY by design: the trip data is shown
// from the IndexedDB snapshot (see db.js / offlineStore.js) and every control
// that writes is locked until the connection (and live data) is back.
//
// "Read-only" = the browser reports offline, OR the data currently on screen
// came from the snapshot because the live fetch failed (airplane mode, a dead
// hotel Wi-Fi where navigator.onLine still says true, Supabase down, ...).
import { qs, qsa, toast } from './utils.js';

export const offlineState = {
  fromSnapshot: false,   // some table in the current load came from a snapshot
  snapshotSavedAt: null, // oldest savedAt among the snapshot-served tables
  lastLiveAt: null       // when the last fully-live load finished
};

const listeners = new Set();
function emit() { listeners.forEach((fn) => fn()); refreshUi(); }

export function onOfflineChange(fn) { listeners.add(fn); }

export function isReadOnly() {
  return offlineState.fromSnapshot || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

export const OFFLINE_WRITE_MESSAGE = "You're offline — editing is paused until you're back online.";

export function assertWritable() {
  if (isReadOnly()) throw new Error(OFFLINE_WRITE_MESSAGE);
}

// loadCore() brackets each full load with these.
export function beginLoad() {
  offlineState.fromSnapshot = false;
  offlineState.snapshotSavedAt = null;
}
export function noteSnapshotUsed(savedAt) {
  offlineState.fromSnapshot = true;
  if (!offlineState.snapshotSavedAt || savedAt < offlineState.snapshotSavedAt) offlineState.snapshotSavedAt = savedAt;
}
export function endLoad() {
  if (!offlineState.fromSnapshot) offlineState.lastLiveAt = Date.now();
  emit();
}

/* ---------------- banner ---------------- */

function fmtSaved(ts) {
  if (!ts) return 'earlier';
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function refreshBanner() {
  const el = qs('#offlineBanner');
  if (!el) return;
  if (!isReadOnly()) { el.hidden = true; el.textContent = ''; return; }
  const when = offlineState.snapshotSavedAt || offlineState.lastLiveAt;
  el.hidden = false;
  el.innerHTML = '';
  const msg = document.createElement('span');
  msg.textContent = 'Offline — showing data saved ' + fmtSaved(when);
  const sub = document.createElement('span');
  sub.className = 'offline-sub';
  sub.textContent = ' · editing paused';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'offline-retry';
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => requestRefresh());
  el.append(msg, sub, retry);
}

/* ---------------- locking write controls ---------------- */

// Every control that writes to the database. Keep in step with the views: a
// control missing here still can't save anything offline (db.js throws via
// assertWritable and the existing error toast shows) — it just wouldn't look
// locked. Expand/collapse, filters and Export PDF are read-only and stay live.
const WRITE_BUTTONS = [
  'toggle-paid', 'toggle-booking', 'delete-booking', 'add-booking',
  'toggle-item', 'move-item', 'delete-item', 'add-item',
  'itin-add', 'itin-delete', 'select-choice',
  'toggle-pack', 'delete-pack', 'add-pack'
].map((a) => '[data-action="' + a + '"]');
const WRITE_INPUTS = ['draft-booking', 'draft-title', 'draft-cost', 'draft-pack', 'itin-draft-time', 'itin-draft-text']
  .map((r) => '[data-role="' + r + '"]');
const WRITE_SELECTOR = WRITE_BUTTONS.concat(WRITE_INPUTS, ['[data-write]']).join(',');
const LOCK_TITLE = 'Editing is paused while offline';

function lockEl(el) {
  if (el.dataset.offlineLocked) return;
  const isField = el.matches('input,textarea,select');
  if (isField) {
    if (el.disabled) return; // already disabled by the view (e.g. move up on the first row)
    el.disabled = true;
  } else {
    // Buttons stay focusable via aria-disabled so a tap can explain *why* (a
    // truly disabled button swallows the tap silently on mobile).
    if (el.disabled) return;
    el.setAttribute('aria-disabled', 'true');
  }
  el.dataset.offlineLocked = '1';
  el.dataset.offlineTitle = el.getAttribute('title') || '';
  el.title = LOCK_TITLE;
}

function unlockEl(el) {
  el.removeAttribute('aria-disabled');
  if (el.matches('input,textarea,select')) el.disabled = false;
  if (el.dataset.offlineTitle) el.title = el.dataset.offlineTitle; else el.removeAttribute('title');
  delete el.dataset.offlineLocked;
  delete el.dataset.offlineTitle;
}

function applyLock(root) {
  const scope = root || document;
  if (isReadOnly()) {
    if (scope.matches && scope.matches(WRITE_SELECTOR)) lockEl(scope);
    qsa(WRITE_SELECTOR, scope).forEach(lockEl);
  } else {
    qsa('[data-offline-locked]', scope).forEach(unlockEl);
  }
}

function refreshUi() {
  document.body.classList.toggle('is-offline', isReadOnly());
  refreshBanner();
  applyLock(document);
}

function requestRefresh() {
  // main.js listens for this, reloads (falling back to the snapshot again if
  // still unreachable) and re-renders the current screen.
  window.dispatchEvent(new CustomEvent('th:tripchange'));
}

let started = false;
export function initOfflineUi() {
  if (started) return;
  started = true;

  const main = qs('#app-main');

  // Capture phase on <main>: runs before the views' own delegated handlers, so a
  // tap on a locked control is swallowed and explained instead of half-running.
  const block = (e) => {
    const el = e.target.closest && e.target.closest('[data-offline-locked]');
    if (!el || !main.contains(el)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'click') toast(OFFLINE_WRITE_MESSAGE);
  };
  main.addEventListener('click', block, true);
  main.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') block(e); }, true);

  // Views re-render by replacing innerHTML; re-lock whatever they put in.
  new MutationObserver((muts) => {
    if (!isReadOnly()) return;
    muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) applyLock(n); }));
  }).observe(main, { childList: true, subtree: true });

  window.addEventListener('offline', () => emit());
  window.addEventListener('online', () => {
    // If what's on screen came from the snapshot, fetch the real thing now;
    // otherwise (live data, connection just blipped) simply unlock.
    if (offlineState.fromSnapshot) requestRefresh(); else emit();
  });

  refreshUi();
}
