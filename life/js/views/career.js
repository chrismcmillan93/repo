// Career: the wins log and skills for the current job, the side-business
// pipeline and income against a monthly target, and learning.
import * as store from '../store.js';
import { esc, bar, wire, formData, empty, options, money } from '../ui.js';
import { todayStr, formatDateShort, toast } from '../fit/utils.js';

const STAGES = ['Lead', 'Proposal sent', 'Active', 'Paid'];

export async function render(root){
  const today = todayStr(), month = today.slice(0, 7);
  let items = [], cfg = {};
  const of = (kind) => items.filter((i) => i.kind === kind);
  const del = (i) => `<button class="btn sm ghost" data-act="del" data-id="${i.id}" aria-label="Delete">×</button>`;

  function draw(){
    const deals = of('deal');
    const paid = deals.filter((x) => x.stage === 'Paid' && x.item_date.slice(0, 7) === month).reduce((s, x) => s + Number(x.amount || 0), 0);
    const target = Number(cfg.income_target) || 0;
    const stepper = (i) => `<span class="step"><button data-act="bump" data-id="${i.id}" data-by="-1" aria-label="One fewer">−</button><b>${i.progress}/${i.target}</b><button data-act="bump" data-id="${i.id}" data-by="1" aria-label="One more">+</button></span>`;
    root.innerHTML = `<div class="cols"><div class="stack">
      <section class="panel"><h2>Wins log <small>Evidence for the next review</small></h2>
        <form class="add" data-act="add" data-kind="win"><input class="field" name="title" required placeholder="What did you do, and what did it change?" aria-label="Log a win"><button class="btn pri">Log</button></form>
        ${of('win').length ? of('win').map((w) => `<div class="row"><span class="rt"><span class="rtitle">${esc(w.title)}</span></span><span class="right">${formatDateShort(w.item_date)}</span>${del(w)}</div>`).join('') : empty('Nothing logged yet. One line per win is enough.')}</section>
      <section class="panel"><h2>Business and side income <small>${money(paid)}${target ? ` of ${money(target)}` : ''} paid this month</small></h2>
        ${target ? bar(100 * paid / target, null, 'good') : ''}
        <div class="pipe">${STAGES.map((s) => `<div><span class="sub" style="margin:0">${s}</span>${deals.filter((x) => x.stage === s).map((x) => `<div class="card"><b>${esc(x.title)}</b>${x.amount != null ? money(x.amount) : ''}
          <select class="field" data-act="stage" data-id="${x.id}" aria-label="Stage">${options(STAGES.map((v) => [v, v]), x.stage)}</select>${del(x)}</div>`).join('')}</div>`).join('')}</div>
        <form class="add wrapf" data-act="add" data-kind="deal"><input class="field" name="title" required placeholder="Client or job" aria-label="Client or job"><label class="lab">Value (£)<input class="field" style="width:7em" type="number" step="0.01" min="0" name="amount"></label><button class="btn">Add lead</button></form>
        <form class="add" data-act="target"><label class="lab" style="flex:1">Monthly income target (£)<input class="field" type="number" min="0" step="1" name="t" value="${target || ''}"></label><button class="btn">Save</button></form></section>
    </div><div class="stack">
      <section class="panel"><h2>Skills for the next level <small>Examples you can point to</small></h2>
        ${of('skill').length ? of('skill').map((s) => `<div class="rt"><span class="rmeta spread"><b>${esc(s.title)}</b>${stepper(s)}${del(s)}</span>${bar(s.target ? 100 * s.progress / s.target : 0)}</div>`).join('') : empty('Add the skills the next role asks for, and count the examples you have.')}
        <form class="add wrapf" data-act="add" data-kind="skill"><input class="field" name="title" required placeholder="e.g. Leading a project end to end" aria-label="Skill"><label class="lab">Examples needed<input class="field" style="width:5em" type="number" min="1" name="target" value="4"></label><button class="btn">Add</button></form></section>
      <section class="panel"><h2>Next 1:1 <small>What to raise</small></h2>
        ${of('agenda').length ? of('agenda').map((a) => `<div class="row ${a.done ? 'done' : ''}"><input type="checkbox" data-act="tick" data-id="${a.id}" ${a.done ? 'checked' : ''} aria-label="Raised"><span class="rt"><span class="rtitle">${esc(a.title)}</span></span>${del(a)}</div>`).join('') : empty('Nothing to raise yet.')}
        <form class="add" data-act="add" data-kind="agenda"><input class="field" name="title" required placeholder="Add a point to raise" aria-label="Agenda point"><button class="btn">Add</button></form></section>
      <section class="panel"><h2>Learning <small>Courses and books</small></h2>
        ${of('learning').length ? of('learning').map((l) => `<div class="rt"><span class="rmeta spread"><b>${esc(l.title)}</b><label class="lab inline"><input class="field" style="width:5em" type="number" min="0" max="100" data-act="pct" data-id="${l.id}" value="${l.progress}" aria-label="Percent complete">%</label>${del(l)}</span>${bar(l.progress)}</div>`).join('') : empty('Add a course or book and track how far through you are.')}
        <form class="add" data-act="add" data-kind="learning"><input class="field" name="title" required placeholder="Course or book" aria-label="Course or book"><button class="btn">Add</button></form></section>
    </div></div>`;
  }

  const refresh = async () => { [items, cfg] = await Promise.all([store.career.list((q) => q.order('item_date', { ascending: false }).order('created_at', { ascending: false })), store.settings.get()]); draw(); };
  const find = (id) => items.find((i) => i.id === id);
  wire(root, {
    async add(f){
      const v = formData(f), kind = f.dataset.kind;
      await store.career.add({ kind, title: v.title.trim(), amount: v.amount ? Number(v.amount) : null, target: v.target ? Number(v.target) : 0, stage: kind === 'deal' ? 'Lead' : '' });
      if (kind === 'win') toast('Win logged');
      await refresh();
    },
    async del(n){ await store.career.del(n.dataset.id); await refresh(); },
    async tick(n){ await store.career.set(n.dataset.id, { done: n.checked }); await refresh(); },
    async stage(n){ await store.career.set(n.dataset.id, { stage: n.value, item_date: today }); await refresh(); },
    async bump(n){ const i = find(n.dataset.id); await store.career.set(i.id, { progress: Math.max(0, Math.min(i.target, i.progress + Number(n.dataset.by))) }); await refresh(); },
    async pct(n){ await store.career.set(n.dataset.id, { progress: Math.max(0, Math.min(100, Number(n.value) || 0)) }); await refresh(); },
    async target(f){ await store.settings.save({ ...cfg, income_target: Number(formData(f).t) || 0 }); toast('Saved'); await refresh(); }
  });
  await refresh();
}
