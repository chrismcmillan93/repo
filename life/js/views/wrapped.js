// Wrapped: your year from Garmin and Hevy as swipeable cards. Deliberately read-only and
// separate from the fresh start: this screen reads the device mirrors (garmin_*, hevy_*) from
// 1 January straight from the tables, not through the floored helpers, because a year in review
// needs the whole year. Nothing from goals, tasks, habits, the journal or Giving up is
// included, except one anonymous "days and counting" card if you switch it on (off by default).
import * as store from '../store.js';
import { supabase as fitSb } from '../fit/supabaseClient.js';
import { esc, wire, empty } from '../ui.js';
import { todayStr } from '../fit/utils.js';
import { wrappedStats, quitCard } from '../wrappedStats.js';
import { streakInfo } from '../streaks.js';
import { privateBlocked } from '../lock.js';

const QUIT_KEY = 'life-wrapped-quit';
const readQuit = () => { try { return localStorage.getItem(QUIT_KEY) === '1'; } catch (_) { return false; } };
const saveQuit = (on) => { try { localStorage.setItem(QUIT_KEY, on ? '1' : '0'); } catch (_) { /* just won't be remembered */ } };

// PostgREST caps a response at 1,000 rows: page until a short page.
async function all(table, cols, col, from, to){
  const out = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await fitSb.from(table).select(cols).eq('user_id', store.userId()).gte(col, from).lte(col, to).order(col).range(at, at + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}
const soft = (p) => p.catch(() => []);

async function load(year){
  const from = `${year}-01-01`, to = `${year}-12-31`, fromTs = `${from}T00:00:00.000Z`, toTs = `${to}T23:59:59.999Z`;
  const [acts, days, sleep, workouts, sets] = await Promise.all([
    soft(all('garmin_activities', 'type_key, name, local_date, distance_m, duration_s, elevation_gain_m, avg_speed_mps', 'local_date', from, to)),
    soft(all('garmin_days', 'day, steps, resting_hr', 'day', from, to)),
    soft(all('garmin_sleep', 'day, sleep_s, hrv_last_night', 'day', from, to)),
    soft(all('hevy_workouts', 'hevy_id, start_time', 'start_time', fromTs, toTs)),
    soft(all('hevy_sets', 'hevy_workout_id, exercise_title, set_type, weight_kg, reps, performed_at', 'performed_at', fromTs, toTs))
  ]);
  return wrappedStats({ acts, days, sleep, sets, workouts, year });
}

async function quitDays(){
  if (privateBlocked()) return [];
  const today = todayStr();
  const quits = (await store.quits.list()).filter((q) => !q.archived);
  if (!quits.length) return [];
  const slips = await store.quitSlips.list();
  return quits.map((q) => streakInfo(q, slips.filter((s) => s.quit_id === q.id), today).current);
}

export async function render(root, params){
  const thisYear = Number(todayStr().slice(0, 4));
  const year = /^\d{4}$/.test(params[0] || '') ? Number(params[0]) : thisYear;
  const stats = await load(year);
  let withQuit = readQuit();
  let quit = null;
  if (withQuit) { try { quit = quitCard(await quitDays()); } catch (_) { quit = null; } }

  function draw(){
    const cards = [...stats.cards];
    if (withQuit && quit) cards.push(quit);
    const intro = { id: 'intro', kicker: 'Your year', big: String(year), unit: 'Wrapped', line: 'Swipe through. Garmin and Hevy only, nothing private.' };
    const outro = { id: 'outro', kicker: 'That was', big: String(year), unit: cards.length ? 'Now go and beat it.' : '', line: '' };
    const list = cards.length ? [intro, ...cards, outro] : [];
    root.innerHTML = `<section class="panel"><h2>Wrapped <small>${year}</small></h2>
        <div class="seg sm">${[thisYear - 1, thisYear].map((y) => `<a class="${y === year ? 'on' : ''}" href="#/wrapped/${y}">${y}</a>`).join('')}</div>
        ${list.length ? `<div class="wrap" tabindex="0" aria-label="Your ${year} in numbers, swipe sideways">${list.map((c, i) => `<article class="wcard c${i % 5}" id="w-${c.id}" aria-label="${esc(c.kicker)} ${esc(c.big)} ${esc(c.unit)}">
            <p class="wk">${esc(c.kicker)}</p><p class="wb">${esc(c.big)}</p><p class="wu">${esc(c.unit)}</p>${c.line ? `<p class="wl">${esc(c.line)}</p>` : ''}</article>`).join('')}</div>
          <div class="wdots" aria-hidden="true">${list.map((_, i) => `<i data-i="${i}"${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div>`
        : empty(`No Garmin or Hevy data for ${year} yet.`)}
        <div class="wfoot"><label class="check"><input type="checkbox" data-act="wquit" ${withQuit ? 'checked' : ''}> Include one anonymous card from Giving up</label>
        <p class="hint">Off by default. It shows only a number of days, never what it is. Garmin and Hevy are read straight from 1 January, so this one screen looks back before the fresh start. Everything else in the app does not.</p></div></section>`;
    const strip = root.querySelector('.wrap');
    if (strip) {
      const dots = Array.from(root.querySelectorAll('.wdots i'));
      strip.addEventListener('scroll', () => {
        const i = Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));
        dots.forEach((d, n) => d.classList.toggle('on', n === i));
      }, { passive: true });
    }
  }
  wire(root, {
    async wquit(n){
      withQuit = n.checked; saveQuit(withQuit);
      if (withQuit && !quit) { try { quit = quitCard(await quitDays()); } catch (_) { quit = null; } }
      draw();
    }
  });
  draw();
}
