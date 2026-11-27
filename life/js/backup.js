// Backup: one JSON file with everything of yours in the Life app, plus your own records in the
// training and food tables the app reads and writes. Built in the browser from your signed-in session,
// nothing is uploaded anywhere. Left out on purpose: push subscriptions (device keys), the
// Hevy and Garmin mirrors (they re-sync from the source), and your sign-in. The Giving up
// tables are only included if you tick the box, because the file is readable by anyone who has it.
import { supabase } from './supabaseClient.js';
import { userId } from './store.js';
import { todayStr } from './fit/utils.js';

export const LIFE_TABLES = ['goals', 'goal_steps', 'commitments', 'commitment_rules', 'tasks', 'habits', 'habit_checks', 'journal', 'list_items', 'career_items', 'events', 'settings', 'reviews', 'review_goals', 'notes', 'playbook_progress', 'niggles', 'daily_mood', 'progress_pics'];
export const PRIVATE_TABLES = ['quits', 'quit_slips', 'quit_cravings'];
export const FITNESS_TABLES = ['daily_logs', 'daily_checks', 'pick_sessions', 'day_swaps', 'plan_checkins', 'weekly_checkins', 'race_results', 'race_booked', 'week_list_ticks', 'races'];
// A stable order per table, so paging through a big one never skips or repeats a row.
const ORDER = {
  habit_checks: ['check_date', 'habit_id'], playbook_progress: ['directive_key'], settings: ['user_id'],
  daily_logs: ['log_date'], daily_checks: ['log_date', 'item_id'], pick_sessions: ['log_date', 'kind'], day_swaps: ['log_date'],
  plan_checkins: ['week_number'], weekly_checkins: ['week_number'], race_results: ['race_id'], race_booked: ['race_id'],
  week_list_ticks: ['week_start_date', 'list', 'item_key'], races: ['race_date', 'name']
};
export const PAGE = 1000;

async function readAll(client, table){
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select('*').eq('user_id', userId());
    (ORDER[table] || ['created_at', 'id']).forEach((c) => { q = q.order(c); });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function buildBackup({ includePrivate = false } = {}){
  const life = supabase.schema('life'), fit = supabase.schema('fitness');
  const out = { app: 'life', format: 1, exported_at: new Date().toISOString(), life: {}, fitness: {}, private: includePrivate ? {} : null };
  for (const t of LIFE_TABLES) out.life[t] = await readAll(life, t);
  for (const t of FITNESS_TABLES) { try { out.fitness[t] = await readAll(fit, t); } catch (_) { out.fitness[t] = []; } }
  if (includePrivate) for (const t of PRIVATE_TABLES) out.private[t] = await readAll(life, t);
  // Device and notification details are not part of a backup.
  if (out.life.settings) out.life.settings = out.life.settings.map((s) => ({ ...s, data: { ...s.data, last_backup: undefined } }));
  const counts = {};
  [out.life, out.fitness, out.private || {}].forEach((g) => Object.entries(g).forEach(([k, v]) => { counts[k] = v.length; }));
  return { backup: out, counts, rows: Object.values(counts).reduce((a, b) => a + b, 0) };
}

// Share sheet on phones (Save to Files), a plain download elsewhere.
export async function saveBackup(backup){
  const name = `life-backup-${todayStr()}.json`;
  const file = new File([JSON.stringify(backup, null, 2)], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (err) { if (err && err.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
