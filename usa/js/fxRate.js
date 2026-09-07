// Live GBP -> USD rate. Applied automatically to the in-memory display
// value by main.js's applyLiveRate() -- this module itself never touches
// trips.fx_rate in the DB, and stops being consulted at all once the user
// has manually saved a rate this page load (state.fxManualOverride).
//
// Two free, keyless, CORS-enabled sources are tried in order --
// frankfurter.app first, open.er-api.com as a fallback if that one is ever
// unreachable, rate-limited, or moved -- matching the same "no API key, no
// billing" rule already followed for place ratings. A single flaky source
// shouldn't take the whole feature down.
let cached = null;
let fetchPromise = null;

async function fetchFrankfurter(){
  const res = await fetch('https://api.frankfurter.app/latest?from=GBP&to=USD');
  if (!res.ok) throw new Error('frankfurter.app: bad response ' + res.status);
  const data = await res.json();
  const rate = data && data.rates && data.rates.USD;
  if (typeof rate !== 'number') throw new Error('frankfurter.app: no USD rate in response');
  return rate;
}

async function fetchOpenErApi(){
  const res = await fetch('https://open.er-api.com/v6/latest/GBP');
  if (!res.ok) throw new Error('open.er-api.com: bad response ' + res.status);
  const data = await res.json();
  const rate = data && data.rates && data.rates.USD;
  if (typeof rate !== 'number') throw new Error('open.er-api.com: no USD rate in response');
  return rate;
}

export function getLiveRate(){
  if (cached !== null) return Promise.resolve(cached);
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetchFrankfurter()
    .catch((err) => {
      console.warn('Live fx rate: primary source failed, trying fallback.', err);
      return fetchOpenErApi();
    })
    .then((rate) => {
      cached = rate;
      fetchPromise = null;
      return cached;
    })
    .catch((err) => {
      // Both sources failed -- clear fetchPromise too, not just cached, so
      // the *next* call (the next page load, or the next usa:tripchange)
      // actually retries the fetch instead of forever replaying this same
      // failed result. Without this, one bad request permanently disables
      // the live rate for the rest of the page's lifetime.
      console.warn('Live fx rate: unavailable from any source, will retry next time.', err);
      cached = null;
      fetchPromise = null;
      return null;
    });
  return fetchPromise;
}
