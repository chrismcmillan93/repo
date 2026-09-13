// Small shared app state -- a plain object plus a couple of window events,
// same "not a framework" pattern as usa/js/state.js.
import { todayStr } from './utils.js';

export const state = {
  session: null,
  // The date currently shown on the Today screen. Defaults to real today
  // and persists across route changes within the page's lifetime.
  currentDate: todayStr(),
  dayBundle: null,
  currentBlock: null // fetched once, used for the Today nav's date bounds
};

export function notifyDayChanged(){
  window.dispatchEvent(new CustomEvent('fitness:daychange'));
}
