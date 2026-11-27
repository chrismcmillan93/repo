// Shared builders for the tests: dates and synthetic Garmin rows. No dependencies.
export const day = (base, n) => { const d = new Date(`${base}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// `n` days of steady sleep/day rows ending on `end`, slightly varied so the baseline has a spread.
export function steady(end, n, over = {}){
  const sleep = [], days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = day(end, -i), v = i % 3;
    sleep.push({ day: d, sleep_s: (7.5 + v * 0.2) * 3600, hrv_last_night: 60 + (i % 4) });
    days.push({ day: d, resting_hr: 52 + (i % 2), avg_stress: 30 + v });
  }
  return { sleep, days };
}
