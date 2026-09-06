// A tiny in-memory stand-in for the Supabase JS client, covering just the
// query-builder surface db.js actually uses (select/eq/is/in/gte/lte/order/
// single/insert/update/upsert/delete, plus rpc). Backs DEMO_MODE — see
// config.js. Not connected to any network; data lives only for the tab's
// lifetime.
//
// goal_progress is a real Postgres VIEW on the live project — it recomputes
// on every SELECT, live off goals/milestones/goal_updates. So this stand-in
// computes it the same way on every read (computeGoalProgress below) rather
// than reading a frozen snapshot — otherwise adding an update would never
// move a pace bar or hit-rate in preview.

function matchesFilters(row, filters) {
  return filters.every((f) => {
    if (f.op === 'eq') return row[f.col] === f.val;
    if (f.op === 'is') return row[f.col] === f.val || (f.val === null && (row[f.col] === null || row[f.col] === undefined));
    if (f.op === 'in') return f.val.includes(row[f.col]);
    if (f.op === 'gte') return row[f.col] >= f.val;
    if (f.op === 'lte') return row[f.col] <= f.val;
    return true;
  });
}

function makeId() { return 'demo-' + Math.random().toString(36).slice(2, 10); }

function clamp01(n) { return Math.max(0, Math.min(1, n)); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

// Mirrors goals.goal_progress (see the migration that created it) exactly,
// including the pass_fail hit-rate branch.
function computeGoalProgress(store) {
  const goals = store.goals || [];
  const milestones = store.milestones || [];
  const updates = store.goal_updates || [];

  return goals.map((g) => {
    const ms = milestones.filter((m) => m.goal_id === g.id);
    const ups = updates.filter((u) => u.goal_id === g.id).sort((a, b) => (a.occurred_on < b.occurred_on ? -1 : (a.occurred_on > b.occurred_on ? 1 : (a.created_at < b.created_at ? -1 : 1))));
    const latest = ups[ups.length - 1];
    const hits = ups.filter((u) => Number(u.value) >= 1).length;

    let percentComplete = null;
    const currentValue = latest && latest.value !== null && latest.value !== undefined ? Number(latest.value) : Number(g.start_value || 0);
    if (g.measure_type === 'numeric' && g.target_value !== null && g.target_value !== undefined && Number(g.target_value) !== Number(g.start_value)) {
      percentComplete = clamp01((currentValue - Number(g.start_value)) / (Number(g.target_value) - Number(g.start_value)));
    } else if (g.measure_type === 'milestone' && ms.length > 0) {
      percentComplete = ms.filter((m) => m.completed_on).length / ms.length;
    } else if (g.measure_type === 'pass_fail' && ups.length > 0) {
      percentComplete = hits / ups.length;
    }

    let percentElapsed = null;
    if (g.target_date && g.target_date !== g.start_date) {
      percentElapsed = clamp01((new Date() - new Date(g.start_date)) / (new Date(g.target_date) - new Date(g.start_date)));
    }

    return {
      id: g.id, user_id: g.user_id, area_id: g.area_id, title: g.title, status: g.status,
      horizon: g.horizon, priority: g.priority, measure_type: g.measure_type,
      start_date: g.start_date, target_date: g.target_date, unit: g.unit,
      start_value: g.start_value, target_value: g.target_value, direction: g.direction,
      // Matches the real view's unconditional `coalesce(latest.value, start_value)` —
      // no measure_type branch here (a previous version of this incorrectly zeroed
      // current_value for non-numeric goals, which broke pass_fail's "am I checked
      // in this period" check on the dashboard).
      current_value: currentValue,
      last_update_on: latest ? latest.occurred_on : null,
      latest_confidence: latest ? latest.confidence : null,
      update_count: ups.length,
      milestone_count: ms.length,
      milestones_done: ms.filter((m) => m.completed_on).length,
      pass_fail_hits: hits,
      pass_fail_total: ups.length,
      percent_complete: percentComplete,
      percent_elapsed: percentElapsed,
      days_remaining: g.target_date ? daysBetween(todayISO(), g.target_date) : null,
      days_since_update: latest ? daysBetween(latest.occurred_on, todayISO()) : null
    };
  });
}

export function createDemoClient(seed) {
  const store = seed; // { life_areas: [...], goals: [...], ... } — mutated in place

  function makeBuilder(table) {
    const state = { filters: [], order: [], op: 'select', payload: null, single: false };
    const builder = {
      select() { return builder; },
      eq(col, val) { state.filters.push({ op: 'eq', col, val }); return builder; },
      is(col, val) { state.filters.push({ op: 'is', col, val }); return builder; },
      in(col, val) { state.filters.push({ op: 'in', col, val }); return builder; },
      gte(col, val) { state.filters.push({ op: 'gte', col, val }); return builder; },
      lte(col, val) { state.filters.push({ op: 'lte', col, val }); return builder; },
      order(col, opts) { state.order.push({ col, asc: !opts || opts.ascending !== false }); return builder; },
      single() { state.single = true; return builder; },
      insert(row) { state.op = 'insert'; state.payload = row; return builder; },
      update(patch) { state.op = 'update'; state.payload = patch; return builder; },
      upsert(row, opts) { state.op = 'upsert'; state.payload = row; state.onConflict = opts && opts.onConflict; return builder; },
      delete() { state.op = 'delete'; return builder; },
      then(resolve, reject) {
        const isComputedView = table === 'goal_progress';
        const rows_ = isComputedView ? computeGoalProgress(store) : (store[table] || (store[table] = []));
        let rows;
        try {
          if (state.op === 'select') {
            rows = rows_.filter((r) => matchesFilters(r, state.filters));
            // A single composite comparator — chained .order() calls mean
            // "first key primary, second key tie-breaker", same as SQL
            // ORDER BY a, b. Sorting once per key independently would get
            // this backwards: each later full re-sort discards the earlier
            // one except among its own ties, so the *last* .order() call
            // would silently end up dominant instead of the first.
            if (state.order.length) {
              rows.sort((a, b) => {
                for (const { col, asc } of state.order) {
                  if (a[col] === b[col]) continue;
                  const cmp = a[col] > b[col] ? 1 : -1;
                  return asc ? cmp : -cmp;
                }
                return 0;
              });
            }
          } else if (state.op === 'insert') {
            const now = new Date().toISOString();
            const row = { id: makeId(), created_at: now, updated_at: now, ...state.payload };
            rows_.push(row);
            rows = [row];
          } else if (state.op === 'update') {
            rows = rows_.filter((r) => matchesFilters(r, state.filters));
            rows.forEach((r) => Object.assign(r, state.payload, { updated_at: new Date().toISOString() }));
          } else if (state.op === 'upsert') {
            const conflictCols = (state.onConflict || 'id').split(',');
            const existing = rows_.find((r) => conflictCols.every((c) => r[c] === state.payload[c]));
            if (existing) {
              Object.assign(existing, state.payload);
              rows = [existing];
            } else {
              const row = { id: makeId(), created_at: new Date().toISOString(), ...state.payload };
              rows_.push(row);
              rows = [row];
            }
          } else if (state.op === 'delete') {
            const toDelete = rows_.filter((r) => matchesFilters(r, state.filters));
            toDelete.forEach((r) => rows_.splice(rows_.indexOf(r), 1));
            rows = [];
          }
          resolve({ data: state.single ? (rows[0] || null) : rows, error: null });
        } catch (e) {
          if (reject) reject(e); else resolve({ data: null, error: e });
        }
      }
    };
    return builder;
  }

  return {
    from: makeBuilder,
    rpc(name) {
      if (name === 'seed_default_areas') return Promise.resolve({ data: 0, error: null });
      if (name === 'pending_reviews') return Promise.resolve({ data: store.__pending || [], error: null });
      return Promise.resolve({ data: null, error: null });
    }
  };
}
