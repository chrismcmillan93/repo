// Lists -> Books: books to read or listen to. Mounted by lists.js into its own host element (it has its own state and
// handlers). Rules and wording live in books.js (pure, tested). A book is a Book or an Audiobook; finishing a book asks
// for a star rating and, if it is linked to a goal, ticks progress on that goal (and can mark it achieved).
import * as store from '../store.js';
import { esc, pill, wire, formData, empty, options } from '../ui.js';
import { todayStr, formatDateShort, toast } from '../fit/utils.js';
import { touchGoal } from '../lib.js';
import { PILLARS } from '../playbookContent.js';
import { cleanBook, advance, groupBooks, counts, playbookSuggestions, stageLabel, finishedLine, MAX_TITLE, MAX_AUTHOR } from '../books.js';

export async function mountBooks(host){
  let books = [], goals = [], filter = null, finishing = null;
  const today = todayStr();

  async function load(){
    books = await store.books.list((q) => q.order('created_at'));
    goals = await store.goals.list((q) => q.eq('status', 'active').order('created_at')).catch(() => []);
  }

  const goalOf = (b) => goals.find((g) => g.id === b.goal_id);
  const row = (b) => {
    const g = goalOf(b);
    const meta = [b.author ? `<span>${esc(b.author)}</span>` : '', b.format === 'audio' ? pill('Audiobook', 'warn') : '', b.playbook_key ? pill('Playbook', 'goal') : '',
      g ? pill(`Goal: ${g.title}`, 'goal') : '', b.status === 'read' ? `<span>${esc(finishedLine(b, formatDateShort))}</span>` : ''].join('');
    const cls = b.status === 'reading' ? 'goal' : b.status === 'read' ? 'good' : '';
    const panel = finishing === b.id ? `<div class="stack"><p class="sub">How was it? Tap a rating to finish it.</p>
        <div class="seg sm">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-act="finish" data-id="${b.id}" data-r="${n}">${'★'.repeat(n)}</button>`).join('')}<button type="button" data-act="finish" data-id="${b.id}" data-r="">Finish without rating</button><button type="button" data-act="finishcancel">Cancel</button></div>
        ${g ? `<label class="check"><input type="checkbox" id="achieve"> Also mark the goal “${esc(g.title)}” as achieved</label>` : ''}</div>` : '';
    return `<div class="row ${b.status === 'read' ? 'done' : ''}"><span class="rt"><span class="rtitle">${esc(b.title)}</span><span class="rmeta">${meta}</span></span>
      <button class="btn sm" data-act="stage" data-id="${b.id}" title="Move to the next stage">${pill(stageLabel(b.status, b.format), cls)}</button><button class="btn sm ghost" data-act="del" data-id="${b.id}" aria-label="Delete this book">×</button></div>${panel}`;
  };

  function draw(){
    const g = groupBooks(books), c = counts(books);
    if (!filter) filter = c.now ? 'now' : c.upNext ? 'up' : c.finished ? 'finished' : 'now';
    const sec = (title, list) => (list.length ? `<p class="sub">${title}</p>${list.map(row).join('')}` : '');
    const body = {
      now: sec('Reading', g.reading) + sec('Listening', g.listening),
      up: sec('Up next', g.upNext),
      finished: sec('Finished', g.finished),
      all: sec('Reading', g.reading) + sec('Listening', g.listening) + sec('Up next', g.upNext) + sec('Finished', g.finished)
    }[filter];
    const none = { now: 'Nothing on at the moment. Move a book up from Up next.', up: 'Nothing queued. Add a book or audiobook below.', finished: 'No finished books yet.', all: 'No books yet. Add one below.' }[filter];
    const sugg = playbookSuggestions(PILLARS, books);
    const tabs = [['now', `Now (${c.now})`], ['up', `Up next (${c.upNext})`], ['finished', `Finished (${c.finished})`], ['all', 'All']];
    host.innerHTML = `<section class="panel"><h2>Books <small>${c.now} on now · ${c.upNext} up next · ${c.finished} finished</small></h2>
        <div class="seg">${tabs.map(([k, l]) => `<button type="button" class="${filter === k ? 'on' : ''}" data-act="filter" data-id="${k}">${l}</button>`).join('')}</div>
        ${body || empty(none)}
        <form class="add wrapf" data-act="add"><input class="field" style="flex:1 1 100%" name="title" required maxlength="${MAX_TITLE}" placeholder="Title" aria-label="Title">
          <input class="field" style="flex:1 1 160px" name="author" maxlength="${MAX_AUTHOR}" placeholder="Author" aria-label="Author">
          <select class="field" name="format" aria-label="Format">${options([['book', 'Book'], ['audio', 'Audiobook']])}</select>
          <select class="field" name="status" aria-label="Stage">${options([['to_read', 'Up next'], ['reading', 'Now']])}</select>
          <select class="field" name="goal" aria-label="For a goal">${options(goals.map((x) => [x.id, x.title]), null, 'For a goal (optional)')}</select><button class="btn pri">Add</button></form>
        <p class="hint">Pick Book or Audiobook when you add it. Tap the stage to move on: up next, then reading (or listening), then finished (read or listened). Finishing asks for a star rating and ticks progress on a linked goal.</p></section>
      ${sugg.length ? `<section class="panel"><h2>From your Playbook <small>One tap to add</small></h2>${sugg.slice(0, 6).map((s) => `<div class="row"><span class="rt"><span class="rtitle">${esc(s.title)}</span><span class="rmeta"><span>${esc(s.author)}</span>${pill('Playbook', 'goal')}</span></span><button class="btn sm" data-act="addpb" data-key="${esc(s.key)}" data-fmt="book">+ Book</button><button class="btn sm" data-act="addpb" data-key="${esc(s.key)}" data-fmt="audio">+ Audio</button></div>`).join('')}
        ${sugg.length > 6 ? `<p class="hint">${sugg.length - 6} more Playbook books. They appear here as you add these.</p>` : ''}</section>` : ''}`;
  }

  const refresh = async () => { await load(); draw(); };
  wire(host, {
    filter(n){ filter = n.dataset.id; finishing = null; draw(); },
    async add(f){
      const row = cleanBook(formData(f));
      if (!row) { toast('Give the book a title.'); return; }
      await store.books.add({ ...row, started_on: row.status === 'reading' ? today : null });
      toast(row.format === 'audio' ? 'Audiobook added.' : 'Book added.');
      await refresh();
    },
    async addpb(n){
      const s = playbookSuggestions(PILLARS, books).find((x) => x.key === n.dataset.key);
      if (!s) return;
      await store.books.add({ ...cleanBook({ title: s.title, author: s.author, format: n.dataset.fmt, status: 'to_read', playbook_key: s.key }) });
      await refresh();
    },
    async stage(n){
      const b = books.find((x) => x.id === n.dataset.id);
      if (!b) return;
      if (b.status === 'reading') { finishing = b.id; draw(); return; }
      await store.books.set(b.id, advance(b, today));
      finishing = null;
      await refresh();
    },
    finishcancel(){ finishing = null; draw(); },
    async finish(n){
      const b = books.find((x) => x.id === n.dataset.id);
      if (!b) return;
      const achieve = !!host.querySelector('#achieve') && host.querySelector('#achieve').checked;
      await store.books.set(b.id, advance(b, today, n.dataset.r));
      let msg = b.format === 'audio' ? 'Finished listening. Nice.' : 'Finished. Nice.';
      if (b.goal_id && goalOf(b)) {
        if (achieve) { await store.goals.set(b.goal_id, { status: 'achieved', last_progress_on: today }); msg += ' Goal marked achieved.'; }
        else { await touchGoal(b.goal_id); msg += ' Goal progress ticked.'; }
      }
      finishing = null;
      toast(msg);
      await refresh();
    },
    async del(n){ await store.books.del(n.dataset.id); finishing = null; await refresh(); }
  });
  await refresh();
}
