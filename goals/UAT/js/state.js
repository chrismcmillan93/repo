// Tiny shared bit of state: who's signed in right now. Set once by main.js
// on every auth state change; read by db.js to stamp user_id on inserts
// (RLS requires it — see the with_check policies on every table).

let currentUser = null;

export function setCurrentUser(user) { currentUser = user; }
export function getCurrentUser() { return currentUser; }
export function getUserId() { return currentUser ? currentUser.id : null; }

// One-shot prefill for the "new goal" form — set by anything that wants to
// hand the form a head start (e.g. Playbook's "turn into a goal"), read
// exactly once by goalForm.js on mount so it never leaks into an unrelated
// later visit to #/goal/new.
let goalFormPrefill = null;
export function setGoalFormPrefill(partial) { goalFormPrefill = partial; }
export function consumeGoalFormPrefill() {
  const p = goalFormPrefill;
  goalFormPrefill = null;
  return p;
}
