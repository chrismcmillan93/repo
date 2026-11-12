// Journal: reasons for misses and day closes from the evening review, plus your
// own notes and a decision log.
import * as store from '../store.js';
import { esc, pill, wire, formData, empty, options } from '../ui.js';
import { todayStr, addDays, formatDateShort, toast } from '../fit/utils.js';

const SEG = (on) => `<div class="seg"><a class="${on === 'journal' ? 'on' : ''}" href="#/journal">Journal</a><a class="${on === 'pages' ? 'on' : ''}" href="#/journal/pages">Notes pages</a></div>`;
const LABEL = { note: ['Note', ''], miss: ['Missed', 'warn'], decision: ['Decision', 'goal'], close: ['Day closed', 'good'] };

export async function render(root, params){
  if (params[0] === 'pages') return pages(root, params[1]);
  let rows = [];
  function draw(){
    const list = (kinds, hint) => { const r = rows.filter((x) => kinds.includes(x.kind));
      return r.length ? r.map((j) => `<div class="row"><span class="rt"><span class="rtitle">${esc(j.body)}</span><span class="rmeta">${pill(LABEL[j.kind][0], LABEL[j.kind][1])}<span>${formatDateShort(j.entry_date)}</span></span></span><button class="btn sm ghost" data-act="del" data-id="${j.id}" aria-label="Delete">×</button></div>`).join('') : empty(hint); };
    const misses = rows.filter((x) => x.kind === 'miss' && x.entry_date >= addDays(todayStr(), -28)).length;
    root.innerHTML = `${SEG('journal')}<section class="panel"><h2>Write something down</h2><form class="add wrapf" data-act="add"><input class="field" name="body" required placeholder="A note, or a decision and why you made it" aria-label="Entry">
        <select class="field" name="kind" aria-label="Type">${options([['note', 'Note'], ['decision', 'Decision']])}</select><button class="btn pri">Save</button></form></section>
      <div class="cols"><section class="panel"><h2>Journal <small>${misses} missed task${misses === 1 ? '' : 's'} in the last 4 weeks</small></h2>${list(['note', 'miss', 'close'], 'Evening reviews and notes appear here.')}</section>
      <section class="panel"><h2>Decision log</h2>${list(['decision'], 'Record what you decided and why, so you can check it later.')}</section></div>`;
  }
  const refresh = async () => { rows = await store.journal.list((q) => q.order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(200)); draw(); };
  wire(root, {
    async add(f){ const v = formData(f); await store.journal.add({ body: v.body.trim(), kind: v.kind, entry_date: todayStr() }); await refresh(); },
    async del(n){ await store.journal.del(n.dataset.id); await refresh(); }
  });
  await refresh();
}

// Notes pages: longer-form notes (reference, plans, ideas), searchable, one open at a time.
async function pages(root, openId){
  let list = [], q = '';
  function draw(){
    const cur = list.find((n) => n.id === openId);
    const shown = list.filter((n) => !q || (n.title + ' ' + n.content).toLowerCase().includes(q.toLowerCase()));
    root.innerHTML = `${SEG('pages')}<div class="cols g"><section class="panel"><h2>Notes pages <small>${list.length}</small></h2>
      <input class="field" data-act="search" value="${esc(q)}" placeholder="Search notes" aria-label="Search notes">
      ${shown.length ? shown.map((n) => `<a class="row ${n.id === openId ? 'today' : ''}" href="#/journal/pages/${n.id}"><span class="rt"><span class="rtitle">${esc(n.title)}</span><span class="rmeta">${n.area ? `<span>${esc(n.area)}</span>` : ''}<span>Edited ${formatDateShort(n.updated_at.slice(0, 10))}</span></span></span></a>`).join('') : empty(q ? 'No notes match.' : 'No notes pages yet.')}
      <form class="add" data-act="new"><input class="field" name="title" required placeholder="New page title" aria-label="New page title"><button class="btn pri">Create</button></form></section>
      <section class="panel">${cur ? `<form data-act="save" class="stack"><input class="field title" name="title" value="${esc(cur.title)}" aria-label="Title">
        <input class="field" name="area" value="${esc(cur.area)}" placeholder="Area (optional)" aria-label="Area">
        <textarea class="field" name="content" rows="18" aria-label="Note">${esc(cur.content)}</textarea>
        <div class="btns"><button class="btn pri">Save</button><button type="button" class="btn ghost" data-act="delpage">Delete page</button></div></form>` : empty('Pick a page, or create one.')}</section></div>`;
  }
  const refresh = async () => { list = await store.notes.list((x) => x.order('updated_at', { ascending: false })); draw(); };
  wire(root, {
    search(n){ q = n.value; draw(); },
    async new(f){ const n = await store.notes.add({ title: formData(f).title.trim() }); location.hash = `#/journal/pages/${n.id}`; },
    async save(f){ const v = formData(f); await store.notes.set(openId, { title: v.title.trim() || 'Untitled', area: v.area.trim(), content: v.content, updated_at: new Date().toISOString() }); toast('Saved'); await refresh(); },
    async delpage(){ await store.notes.del(openId); location.hash = '#/journal/pages'; }
  });
  await refresh();
}
