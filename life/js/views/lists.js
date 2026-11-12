// Lists: shopping (this week's food, generated from the meal plan, plus your own
// items), reusable packing lists, and the wishlist.
import * as store from '../store.js';
import { esc, pill, wire, formData, empty, options, bar, money } from '../ui.js';
import { todayStr, startOfWeek, formatDateShort } from '../fit/utils.js';
import { db } from '../fit/db.js';
import { loadWeek } from '../fit/week.js';
import { buildShoppingList } from '../fit/weekLists.js';

const TABS = [['shopping', 'Shopping'], ['packing', 'Packing'], ['wishlist', 'Wishlist']];
const NEXT = { idea: 'planned', planned: 'booked', booked: 'done', done: 'idea' };

export async function render(root, params){
  const tab = TABS.some((t) => t[0] === params[0]) ? params[0] : 'shopping';
  const weekStart = startOfWeek(todayStr());
  let items = [], gen = [], ticks = {}, group = null;

  async function load(){
    items = await store.listItems.list((q) => q.eq('list', tab).order('sort_order').order('created_at'));
    if (tab === 'shopping') {
      try {
        const [w, t] = await Promise.all([loadWeek(weekStart), db.weekListTicks.listForWeek(store.userId(), weekStart)]);
        gen = buildShoppingList(w.days.map((d) => ({ date: d.date, day: d.day })));
        ticks = Object.fromEntries(t.filter((x) => x.list === 'shopping' || x.item_key.startsWith('shop:')).map((x) => [x.item_key, x.is_checked]));
      } catch (_) { gen = []; }
    }
  }

  const itemRow = (it, extra = '') => `<div class="row ${it.done ? 'done' : ''}"><input type="checkbox" data-act="tick" data-id="${it.id}" ${it.done ? 'checked' : ''} aria-label="Done"><span class="rt"><span class="rtitle">${esc(it.title)}</span></span>${extra}<button class="btn sm ghost" data-act="del" data-id="${it.id}" aria-label="Delete">×</button></div>`;

  function draw(){
    let body = '';
    if (tab === 'shopping') {
      body = `<div class="cols"><section class="panel"><h2>This week's food <small>Week of ${formatDateShort(weekStart)}, from your meal plan</small></h2>
        ${gen.length ? gen.map((g) => `<p class="sub">${esc(g.category)}</p>${g.items.map((i) => `<label class="row ${ticks[i.key] ? 'done' : ''}"><input type="checkbox" data-act="gentick" data-id="${esc(i.key)}" ${ticks[i.key] ? 'checked' : ''}>
          <span class="rt"><span class="rtitle">${esc(i.name)}</span>${i.note ? `<span class="rmeta">${esc(i.note)}</span>` : ''}</span><span class="right">${esc(i.qty)}</span></label>`).join('')}`).join('') : empty('No meal plan covers this week.')}
        <p class="hint">Quantities follow your weight and this week's sessions. Ticks are shared with the Fitness app.</p></section>
        <section class="panel"><h2>Your own items</h2>${items.length ? items.map((it) => itemRow(it)).join('') : empty('Nothing added.')}
        <form class="add" data-act="add"><input class="field" name="title" required placeholder="Add an item" aria-label="Add an item"><button class="btn">Add</button></form>
        ${items.some((i) => i.done) ? '<div class="btns"><button class="btn sm" data-act="clear">Remove ticked items</button></div>' : ''}</section></div>`;
    }
    if (tab === 'packing') {
      const groups = [...new Set(items.map((i) => i.group_name))];
      if (!group || !groups.includes(group)) group = groups[0] || null;
      const mine = items.filter((i) => i.group_name === group), n = mine.filter((i) => i.done).length;
      body = `<section class="panel"><h2>Packing lists <small>${group ? `${n} of ${mine.length} packed` : ''}</small></h2>
        ${groups.length ? `<div class="seg">${groups.map((g) => `<button class="${g === group ? 'on' : ''}" data-act="group" data-id="${esc(g)}">${esc(g)}</button>`).join('')}</div>${bar(mine.length ? 100 * n / mine.length : 0)}${mine.map((it) => itemRow(it)).join('')}
          <form class="add" data-act="add"><input class="field" name="title" required placeholder="Add to ${esc(group)}" aria-label="Add an item"><button class="btn">Add</button></form>
          <div class="btns"><button class="btn sm" data-act="reset">Untick all, ready for next time</button><button class="btn sm" data-act="delgroup">Delete this list</button></div>` : empty('No packing lists yet. Lists are reusable: untick everything and pack again next trip.')}
        <form class="add" data-act="newgroup"><input class="field" name="name" required placeholder="New list, e.g. Race weekend" aria-label="New packing list"><button class="btn pri">Create list</button></form></section>`;
    }
    if (tab === 'wishlist') {
      const total = items.filter((i) => i.status !== 'done').reduce((s, i) => s + Number(i.cost || 0), 0);
      body = `<section class="panel"><h2>Wishlist <small>${money(total)} not yet bought or done</small></h2>
        ${items.length ? items.map((it) => `<div class="row"><span class="rt"><span class="rtitle">${esc(it.title)}</span></span><span class="right">${it.cost != null ? money(it.cost) : ''}</span>
          <button class="btn sm" data-act="stage" data-id="${it.id}" title="Move to the next stage">${pill(it.status, it.status === 'booked' || it.status === 'done' ? 'good' : it.status === 'planned' ? 'goal' : '')}</button><button class="btn sm ghost" data-act="del" data-id="${it.id}" aria-label="Delete">×</button></div>`).join('') : empty('Nothing on the wishlist.')}
        <form class="add wrapf" data-act="add"><input class="field" name="title" required placeholder="Something you want to buy or do" aria-label="Wishlist item"><label class="lab">Cost (£)<input class="field" style="width:7em" type="number" step="0.01" min="0" name="cost"></label><button class="btn">Add</button></form>
        <p class="hint">Tap the stage to move an item on: idea, planned, booked, done.</p></section>`;
    }
    root.innerHTML = `<div class="seg">${TABS.map(([k, label]) => `<a class="${tab === k ? 'on' : ''}" href="#/lists/${k}">${label}</a>`).join('')}</div>${body}`;
  }

  const refresh = async () => { await load(); draw(); };
  wire(root, {
    async tick(n){ await store.listItems.set(n.dataset.id, { done: n.checked }); await refresh(); },
    async gentick(n){ ticks[n.dataset.id] = n.checked; draw(); await db.weekListTicks.upsert(store.userId(), weekStart, 'shopping', n.dataset.id, n.checked); },
    async add(f){ const v = formData(f); await store.listItems.add({ list: tab, group_name: tab === 'packing' ? group : '', title: v.title.trim(), cost: v.cost ? Number(v.cost) : null, sort_order: items.length }); await refresh(); },
    async del(n){ await store.listItems.del(n.dataset.id); await refresh(); },
    async clear(){ await Promise.all(items.filter((i) => i.done).map((i) => store.listItems.del(i.id))); await refresh(); },
    group(n){ group = n.dataset.id; draw(); },
    async newgroup(f){ group = formData(f).name.trim(); await store.listItems.add({ list: 'packing', group_name: group, title: 'Passport, wallet, keys, phone', sort_order: 0 }); await refresh(); },
    async reset(){ await Promise.all(items.filter((i) => i.group_name === group && i.done).map((i) => store.listItems.set(i.id, { done: false }))); await refresh(); },
    async delgroup(){ await Promise.all(items.filter((i) => i.group_name === group).map((i) => store.listItems.del(i.id))); group = null; await refresh(); },
    async stage(n){ const it = items.find((i) => i.id === n.dataset.id); await store.listItems.set(it.id, { status: NEXT[it.status] }); await refresh(); }
  });
  await refresh();
}
