// Live GBP -> USD rate. Applied automatically to the in-memory display
// value by main.js's applyLiveRate() -- this module itself never touches
// trips.fx_rate in the DB, and stops being consulted at all once the user
// has manually saved a rate this page load (state.fxManualOverride).
// frankfurter.app is free, keyless and CORS-enabled (ECB-based daily
// rates), matching the same "no API key, no billing" rule already
// followed for place ratings.
let cached = null;
let fetchPromise = null;

export function getLiveRate(){
  if (cached !== null) return Promise.resolve(cached);
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch('https://api.frankfurter.app/latest?from=GBP&to=USD')
    .then((res) => { if (!res.ok) throw new Error('bad response'); return res.json(); })
    .then((data) => {
      const rate = data && data.rates && data.rates.USD;
      cached = typeof rate === 'number' ? rate : null;
      return cached;
    })
    .catch(() => {
      cached = null;
      return null;
    });
  return fetchPromise;
}
