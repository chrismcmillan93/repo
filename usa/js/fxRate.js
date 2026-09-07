// Live GBP -> USD rate, offered as a one-click suggestion only -- it never
// overwrites the manually-set trips.fx_rate on its own. frankfurter.app is
// free, keyless and CORS-enabled (ECB-based daily rates), matching the
// same "no API key, no billing" rule already followed for place ratings.
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
