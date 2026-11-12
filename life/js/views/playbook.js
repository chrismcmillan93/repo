// Playbook: the 6 pillars and 24 books from the Goals app, each directive with a
// status (not started, working on it, adopted) and a note. A habit-type directive
// can become a daily habit on Today in one tap.
import * as store from '../store.js';
import { esc, pill, wire, empty, bar } from '../ui.js';
import { toast } from '../fit/utils.js';
import { PILLARS, allDirectives } from '../playbookContent.js';

const NEXT = { not_started: 'working_on_it', working_on_it: 'adopted', adopted: 'not_started' };
const LABEL = { not_started: ['Not started', ''], working_on_it: ['Working on it', 'warn'], adopted: ['Adopted', 'good'] };
const FILTERS = [['all', 'All'], ['working_on_it', 'Working on it'], ['adopted', 'Adopted'], ['habit', 'Habits only']];

export async function render(root){
  let prog = {}, filter = 'all', open = new Set();
  const all = allDirectives();

  function draw(){
    const st = (k) => (prog[k] && prog[k].status) || 'not_started';
    const shown = (d) => filter === 'all' || (filter === 'habit' ? d.kind === 'habit' : st(d.key) === filter);
    const adopted = all.filter((d) => st(d.key) === 'adopted').length, working = all.filter((d) => st(d.key) === 'working_on_it').length;
    const pillars = PILLARS.map((p) => {
      const books = p.books.map((b) => {
        const ds = all.filter((d) => d.bookKey === b.key);
        const vis = ds.filter(shown);
        if (!vis.length) return '';
        const n = ds.filter((d) => st(d.key) === 'adopted').length;
        return `<details class="drop book" data-k="${b.key}" ${open.has(b.key) ? 'open' : ''}><summary><b>${esc(b.title)}</b> <span class="hint">${esc(b.author)} · ${n}/${ds.length} adopted</span></summary>
          <p class="hint">${esc(b.blurb)}</p>
          ${vis.map((d) => { const pr = prog[d.key] || {}; const s = st(d.key);
            return `<div class="directive"><div class="gh"><b>${esc(d.text)}</b><button class="btn sm" data-act="cycle" data-key="${d.key}" title="Move to the next status">${pill(LABEL[s][0], LABEL[s][1])}</button></div>
              <p class="hint">${esc(d.detail)}</p>
              <div class="wrapf"><input class="field" data-act="note" data-key="${d.key}" value="${esc(pr.note || '')}" placeholder="How you're applying it" aria-label="Note">
              ${d.kind === 'habit' ? (pr.habit_id ? '<span class="pill good">On Today as a habit</span>' : `<button class="btn sm" data-act="habit" data-key="${d.key}">Make it a daily habit</button>`) : ''}</div></div>`; }).join('')}</details>`;
      }).join('');
      return books ? `<section class="panel"><h2>${esc(p.numeral)}. ${esc(p.title)}</h2><p class="hint">${esc(p.blurb)}</p>${books}</section>` : '';
    }).join('');
    root.innerHTML = `<section class="panel"><h2>Playbook <small>${all.length} directives from ${PILLARS.reduce((n, p) => n + p.books.length, 0)} books</small></h2>
      <div class="stats"><div><b class="big">${adopted}</b><span>adopted</span></div><div><b class="big">${working}</b><span>working on it</span></div></div>${bar(100 * adopted / all.length, null, 'good')}
      <div class="seg">${FILTERS.map(([k, l]) => `<button class="${filter === k ? 'on' : ''}" data-act="filter" data-key="${k}">${l}</button>`).join('')}</div></section>
      ${pillars || `<section class="panel">${empty('Nothing matches this filter.')}</section>`}`;
    root.querySelectorAll('details.book').forEach((d) => d.addEventListener('toggle', () => { if (d.open) open.add(d.dataset.k); else open.delete(d.dataset.k); }));
  }
  const refresh = async () => { prog = Object.fromEntries((await store.playbook.list()).map((p) => [p.directive_key, p])); draw(); };
  wire(root, {
    filter(n){ filter = n.dataset.key; draw(); },
    async cycle(n){ const k = n.dataset.key; await store.playbook.set(k, { status: NEXT[(prog[k] && prog[k].status) || 'not_started'] }); await refresh(); },
    async note(n){ await store.playbook.set(n.dataset.key, { note: n.value.trim(), status: (prog[n.dataset.key] && prog[n.dataset.key].status) || 'working_on_it' }); toast('Saved'); await refresh(); },
    async habit(n){
      const d = all.find((x) => x.key === n.dataset.key);
      const h = await store.habits.add({ title: d.text.replace(/\.$/, '') });
      await store.playbook.set(d.key, { habit_id: h.id, status: (prog[d.key] && prog[d.key].status) === 'adopted' ? 'adopted' : 'working_on_it' });
      toast('Added to your habits on Today');
      await refresh();
    }
  });
  await refresh();
}
