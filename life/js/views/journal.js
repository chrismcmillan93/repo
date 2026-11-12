// Journal: reasons for misses and day closes from the evening review, plus your
// own notes and a decision log.
import * as store from '../store.js';
import { esc, pill, wire, formData, empty, options } from '../ui.js';
import { todayStr, addDays, formatDateShort } from '../fit/utils.js';

const LABEL = { note: ['Note', ''], miss: ['Missed', 'warn'], decision: ['Decision', 'goal'], close: ['Day closed', 'good'] };

export async function render(root){
  let rows = [];
  function draw(){
    const list = (kinds, hint) => { const r = rows.filter((x) => kinds.includes(x.kind));
      return r.length ? r.map((j) => `<div class="row"><span class="rt"><span class="rtitle">${esc(j.body)}</span><span class="rmeta">${pill(LABEL[j.kind][0], LABEL[j.kind][1])}<span>${formatDateShort(j.entry_date)}</span></span></span><button class="btn sm ghost" data-act="del" data-id="${j.id}" aria-label="Delete">×</button></div>`).join('') : empty(hint); };
    const misses = rows.filter((x) => x.kind === 'miss' && x.entry_date >= addDays(todayStr(), -28)).length;
    root.innerHTML = `<section class="panel"><h2>Write something down</h2><form class="add wrapf" data-act="add"><input class="field" name="body" required placeholder="A note, or a decision and why you made it" aria-label="Entry">
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
