// Tiny shared bit of state: who's signed in right now. Set once by main.js
// on every auth state change; read by db.js to stamp user_id on inserts
// (RLS requires it — see the with_check policies on every table).

let currentUser = null;

export function setCurrentUser(user) { currentUser = user; }
export function getCurrentUser() { return currentUser; }
export function getUserId() { return currentUser ? currentUser.id : null; }
