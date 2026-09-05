// A tiny in-memory stand-in for the Supabase JS client, covering just the
// query-builder surface db.js actually uses (select/eq/is/in/gte/lte/order/
// single/insert/update/upsert/delete, plus rpc). Backs DEMO_MODE — see
// config.js. Not connected to any network; data lives only for the tab's
// lifetime.

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
        const rows_ = store[table] || (store[table] = []);
        let rows;
        try {
          if (state.op === 'select') {
            rows = rows_.filter((r) => matchesFilters(r, state.filters));
            state.order.forEach(({ col, asc }) => {
              rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
            });
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
