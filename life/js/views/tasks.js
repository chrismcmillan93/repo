// To-dos: quick capture into an inbox, then today, upcoming and repeating tasks.
import * as store from '../store.js';
import { esc, wire, formData, empty, options } from '../ui.js';
import { todayStr, startOfWeek, toast } from '../fit/utils.js';
import { setTaskDone, carryOver } from '../lib.js';
import { taskRow, towardsSelect, towardsFields } from './shared.js';

export async function render(root){
  const today = todayStr();
  let d = null;
  async function load(){
    const [tasks, goals, commits] = await Promise.all([
      store.tasks.list((q) => q.or(`status.neq.done,done_on.eq.${today}`).order('due_date', { nullsFirst: false }).order('created_at')),
      store.goals.list((q) => q.eq('status', 'active')),
      store.commitments.list((q) => q.eq('week_start', startOfWeek(today)))
    ]);
    await carryOver(tasks);
    d = { tasks, goals, commits, byId: Object.fromEntries(goals.map((g) => [g.id, g])) };
  }
  function draw(){
    const del = (t) => `<button class="btn sm ghost" data-act="del" data-id="${t.id}" aria-label="Delete">×</button>`;
    const sec = (title, list, hint, small = '') => `<section class="panel"><h2>${title} <small>${small}</small></h2>${list.length ? list.map((t) => taskRow(t, d.byId, del(t))).join('') : empty(hint)}</section>`;
    const todayList = d.tasks.filter((t) => t.status !== 'inbox' && (t.due_date === today || t.done_on === today));
    const upcoming = d.tasks.filter((t) => t.status === 'open' && (!t.due_date || t.due_date > today));
    const inbox = d.tasks.filter((t) => t.status === 'inbox');
    root.innerHTML = `<section class="panel"><h2>Quick capture</h2><form class="add" data-act="capture"><input class="field" name="title" required placeholder="Anything on your mind. Sort it later." aria-label="Quick capture"><button class="btn pri">Capture</button></form></section>
      <div class="cols"><div class="stack">${sec('Today', todayList, 'Nothing due today.')}${sec('Upcoming', upcoming, 'Nothing scheduled.')}
        <section class="panel"><h2>Add a task</h2><form class="add wrapf" data-act="add"><input class="field" name="title" required placeholder="Task" aria-label="Task">
          <label class="lab">Due<input class="field" type="date" name="due_date" value="${today}"></label>
          <select class="field" name="repeat" aria-label="Repeat">${options([['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month']], null, 'Does not repeat')}</select>
          ${towardsSelect(d.commits, d.goals)}<button class="btn">Add</button></form></section></div>
      <section class="panel"><h2>Inbox <small>Give each a date, or delete it</small></h2>${inbox.length ? inbox.map((t) => `<div class="row"><span class="rt"><span class="rtitle">${esc(t.title)}</span>
        <form class="add wrapf" data-act="file" data-id="${t.id}"><input class="field" type="date" name="due_date" value="${today}" aria-label="Due date">${towardsSelect(d.commits, d.goals)}<button class="btn sm">Schedule</button><button type="button" class="btn sm ghost" data-act="del" data-id="${t.id}">Delete</button></form></span></div>`).join('') : empty('Inbox is empty.')}</section></div>`;
  }
  const refresh = async () => { await load(); draw(); };
  wire(root, {
    async capture(f){ await store.tasks.add({ title: formData(f).title.trim(), status: 'inbox' }); toast('Captured to inbox'); await refresh(); },
    async add(f){ const v = formData(f); await store.tasks.add({ title: v.title.trim(), status: 'open', due_date: v.due_date || null, repeat: v.repeat || null, ...towardsFields(v.towards, d.commits) }); await refresh(); },
    async file(f){ const v = formData(f); await store.tasks.set(f.dataset.id, { status: 'open', due_date: v.due_date || today, ...towardsFields(v.towards, d.commits) }); await refresh(); },
    async task(n){ await setTaskDone(d.tasks.find((t) => t.id === n.dataset.id), n.checked); await refresh(); },
    async del(n){ await store.tasks.del(n.dataset.id); await refresh(); }
  });
  await refresh();
}
