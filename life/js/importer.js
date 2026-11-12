// One-off (repeatable) copy of everything worth keeping from the Goals app:
// goals and milestones, wishlist, notes pages and Playbook progress. Anything
// already copied (matched by its Goals-app id) is skipped, so it is safe to run again.
import * as store from './store.js';
import { todayStr } from './fit/utils.js';
import { daysBetween } from './lib.js';

export async function importFromGoalsApp(){
  const today = todayStr();
  const src = await store.goalsApp.load();
  const [haveGoals, haveLists, haveNotes, havePlay] = await Promise.all([store.goals.list(), store.listItems.list((q) => q.eq('list', 'wishlist')), store.notes.list(), store.playbook.list()]);
  const done = { goals: 0, wishlist: 0, notes: 0, playbook: 0 };

  const seenGoals = new Set(haveGoals.map((g) => g.source_goal_id).filter(Boolean));
  const areaName = Object.fromEntries(src.areas.map((a) => [a.id, a.name]));
  const goalIdMap = Object.fromEntries(haveGoals.filter((g) => g.source_goal_id).map((g) => [g.source_goal_id, g.id]));
  for (const g of src.goals.filter((x) => !seenGoals.has(x.id))) {
    const vals = src.updates.filter((u) => u.goal_id === g.id);
    const numeric = g.measure_type === 'numeric' && g.target_value != null;
    const start = g.start_value != null ? Number(g.start_value) : 0;
    const current = !vals.length ? start : g.cumulative ? start + vals.reduce((s, u) => s + Number(u.value), 0) : Number(vals[vals.length - 1].value);
    const row = await store.goals.add({
      title: g.title, why: g.why || g.description || '', area: areaName[g.area_id] || 'Personal', start_date: g.start_date || today, target_date: g.target_date,
      measure: numeric ? 'numeric' : 'steps', start_value: numeric ? start : null, target_value: numeric ? Number(g.target_value) : null, current_value: numeric ? current : null, unit: g.unit || '',
      status: { active: 'active', paused: 'paused', achieved: 'achieved', dropped: 'stopped' }[g.status] || 'active', source_goal_id: g.id,
      last_progress_on: vals.length ? vals[vals.length - 1].occurred_on : null
    });
    goalIdMap[g.id] = row.id;
    await store.steps.addMany(src.milestones.filter((m) => m.goal_id === g.id).map((m, i) => {
      const away = m.due_date ? daysBetween(today, m.due_date) : 0;
      return { goal_id: row.id, title: m.title, due_date: m.due_date, done_on: m.completed_on, sort_order: i, level: away > 120 ? 'year' : away > 45 ? 'quarter' : 'month' };
    }));
    done.goals += 1;
  }

  const seenLists = new Set(haveLists.map((i) => i.source_id).filter(Boolean));
  const wish = src.wishlist.filter((w) => !seenLists.has(w.id));
  await store.listItems.addMany(wish.map((w, i) => ({ list: 'wishlist', title: w.title, cost: w.estimated_cost != null && (!w.unit || /£|gbp/i.test(w.unit)) ? Number(w.estimated_cost) : null,
    status: ['idea', 'planned', 'booked', 'done'].includes(w.status) ? w.status : 'idea', sort_order: i, source_id: w.id, group_name: areaName[w.area_id] || '' })));
  done.wishlist = wish.length;

  const seenNotes = new Set(haveNotes.map((n) => n.source_id).filter(Boolean));
  const pages = src.pages.filter((p) => !seenNotes.has(p.id));
  await store.notes.addMany(pages.map((p) => ({ title: p.title || 'Untitled', content: p.content || '', area: areaName[p.area_id] || '', source_id: p.id, created_at: p.created_at, updated_at: p.updated_at || p.created_at })));
  done.notes = pages.length;

  const seenPlay = new Set(havePlay.map((p) => p.directive_key));
  for (const p of src.playbook.filter((x) => !seenPlay.has(x.directive_key))) {
    await store.playbook.set(p.directive_key, { status: ['not_started', 'working_on_it', 'adopted'].includes(p.status) ? p.status : 'not_started', note: p.note || '' });
    done.playbook += 1;
  }
  return done;
}

export function importSummary(d){
  const parts = [[d.goals, 'goal'], [d.wishlist, 'wishlist item'], [d.notes, 'note'], [d.playbook, 'Playbook entry']].filter(([n]) => n).map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`);
  return parts.length ? `Imported ${parts.join(', ')}` : 'Everything in the Goals app is already here';
}
