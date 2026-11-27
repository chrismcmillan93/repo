// Money: pots (a savings goal, or money put aside for an upcoming bill), this month's transfers, and regular payments.
// Three tabs: Overview, Pots, Payments (#/money, #/money/pots, #/money/payments). It does not track spending and never reads
// a bank: you move money in your banking app and tap "Moved". All the rules and maths are in money.js (pure, tested).
// Private like Giving up: covered by the private app lock, never cached offline, backed up only with "Include Giving up and Money".
import * as store from '../store.js';
import { esc, pill, wire, formData, empty, options, bar } from '../ui.js';
import { todayStr, formatDateShort, toast } from '../fit/utils.js';
import { addDays, rollDue, regularMonthly, dueSoon, potBalance, movedThisMonth, potPlan, transferChecklist, leftOver, ordinal, gbp, shortDate,
  cleanPot, cleanPayment, cleanDeposit, cleanMoneySettings, CADENCE_LABEL } from '../money.js';

const gbp0 = (n) => gbp(Math.round(n));

// What Today needs: the pots, deposits, payments and your money settings. Soft-failing, so Money can never break Today.
export async function loadMoneySummary(){
  const [pots, deposits, payments, cfg] = await Promise.all([store.moneyPots.list(), store.moneyDeposits.list(), store.moneyPayments.list((q) => q.eq('active', true)), store.settings.get().catch(() => ({}))]);
  return { pots, deposits, payments, settings: cleanMoneySettings((cfg && cfg.money) || {}) };
}

// Today's two money nudges (plain text; the caller escapes it): payments going out in the next 3 days, and, from pay day on,
// the pot transfers not yet moved this month.
export function moneyNudges(d, today){
  const out = [];
  const soon = dueSoon(d.payments, today, 3);
  if (soon.length) out.push(`Going out soon: ${soon.slice(0, 3).map((p) => `${p.title} ${gbp(p.amount)} (${p.due === today ? 'today' : p.due === addDays(today, 1) ? 'tomorrow' : shortDate(p.due)})`).join(', ')}${soon.length > 3 ? `, +${soon.length - 3} more` : ''}.`);
  const cl = transferChecklist(d.pots, d.deposits, today, d.settings.payday);
  if (Number(today.slice(8, 10)) >= d.settings.payday && cl.toMove > 0) { const n = cl.items.filter((i) => !i.done).length; out.push(`Pot money to move: ${gbp(cl.toMove)} across ${n} pot${n === 1 ? '' : 's'}.`); }
  return out;
}

const TABS = [['overview', 'Overview'], ['pots', 'Pots'], ['payments', 'Payments']];

export async function render(root, params){
  const tab = TABS.some((t) => t[0] === params[0]) ? params[0] : 'overview';
  const today = todayStr();
  let pots = [], deposits = [], payments = [], goals = [], settings = cleanMoneySettings({}), cfg = {};
  let open = null, confirmDelete = null; // open = { id, what: 'add' | 'history' | 'edit' }

  async function load(){
    [pots, deposits, payments, goals, cfg] = await Promise.all([
      store.moneyPots.list((q) => q.order('sort_order').order('created_at')), store.moneyDeposits.list((q) => q.order('deposited_on', { ascending: false }).order('created_at', { ascending: false })),
      store.moneyPayments.list((q) => q.eq('active', true).order('created_at')), store.goals.list((q) => q.neq('status', 'stopped')).catch(() => []), store.settings.get().catch(() => ({}))]);
    settings = cleanMoneySettings((cfg && cfg.money) || {});
  }

  const bal = (p) => potBalance(deposits, p.id);
  const planOf = (p) => potPlan(p, bal(p), today, settings.payday, movedThisMonth(deposits, p.id, today));
  const statusPill = (pl) => (pl.status === 'done' ? pill('Done', 'good') : pl.status === 'ontrack' ? pill('On track', 'good') : pl.status === 'short' ? pill(pl.overdue ? 'Date passed' : `${gbp(pl.short)} short`, 'warn') : '');
  const goalOf = (p) => goals.find((g) => g.id === p.goal_id);
  const tabsHtml = `<div class="seg">${TABS.map(([k, l]) => `<a class="${tab === k ? 'on' : ''}" href="#/money${k === 'overview' ? '' : `/${k}`}">${l}</a>`).join('')}</div>`;

  // ---------- Overview ----------
  function overview(){
    const regular = regularMonthly(payments), cl = transferChecklist(pots, deposits, today, settings.payday), left = leftOver(settings.income, regular, cl.total);
    const month = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
    const soon = dueSoon(payments, today, 14);
    return `<section class="panel"><h2>${month} <small>Pay day is the ${ordinal(settings.payday)}</small></h2>
        <div class="stats"><div><b class="big">${gbp0(regular)}</b><span>regular payments</span></div><div><b class="big">${gbp0(cl.total)}</b><span>to move into pots</span></div>
          ${left != null ? `<div><b class="big">${gbp0(left)}</b><span>left of your ${gbp0(settings.income)}</span></div>` : ''}</div>
        <p class="hint">${left != null ? 'Left = your monthly income minus regular payments minus pot transfers. ' : 'Set your monthly income below to see what is left after those. '}Nothing here reads your bank, so it is only as good as the numbers you keep up to date.</p></section>
      <section class="panel"><h2>Move this month's pot money <small>${cl.items.length ? `${gbp(cl.toMove)} still to move` : ''}</small></h2>
        ${cl.items.length ? cl.items.map((i) => `<div class="row"><span class="rt"><span class="rtitle">${esc(i.pot.name)}</span><span class="rmeta">${pill(i.pot.kind === 'saving' ? 'Savings goal' : 'Upcoming bill', i.pot.kind === 'saving' ? 'goal' : '')}${i.moved > 0 && !i.done ? `<span>${gbp(i.moved)} moved so far</span>` : ''}</span></span>
          ${i.done ? '<button class="btn sm" disabled>Moved ✓</button>' : `<button class="btn sm" data-act="moved" data-id="${i.pot.id}">Moved ${gbp(i.amount)}</button>`}</div>`).join('') : empty('No pots to fill yet. Add one under Pots.')}
        <p class="hint">Tap when you have made the transfer in your banking app. It adds that amount to the pot.</p></section>
      <section class="panel"><h2>Going out soon <small>Next 14 days</small></h2>
        ${soon.length ? soon.map((p) => `<div class="row"><span class="rt"><span class="rtitle">${esc(p.title)}</span><span class="rmeta"><span>${formatDateShort(p.due)}</span></span></span><span class="right">${gbp(p.amount)}</span></div>`).join('') : empty('Nothing due in the next two weeks.')}</section>
      <section class="panel"><h2>Pots <small>Where each one stands</small></h2>
        ${pots.length ? pots.map((p) => { const pl = planOf(p); return `<div class="row"><span class="rt"><span class="rtitle">${esc(p.name)}</span><span class="rmeta"><span>${gbp(pl.balance)} of ${gbp(pl.target)}</span>${statusPill(pl)}</span>${bar(Math.min(100, Math.round(100 * pl.balance / pl.target)), null, 'good')}</span></div>`; }).join('') : empty('No pots yet.')}</section>
      <section class="panel"><h2>Money settings</h2>
        <form class="add wrapf" data-act="msettings"><label class="lab">Monthly income (£, optional)<input class="field" style="width:9em" name="income" inputmode="decimal" value="${settings.income ?? ''}" placeholder="e.g. 2400"></label>
          <label class="lab">Pay day (1 to 28)<input class="field" style="width:6em" name="payday" type="number" min="1" max="28" value="${settings.payday}"></label><button class="btn">Save</button></form>
        <p class="hint">Pay day is the day you move money into pots. Your income is only used to work out what is left; leave it blank to hide that.</p></section>`;
  }

  // ---------- Pots ----------
  function potCard(p){
    const pl = planOf(p), g = goalOf(p), moved = movedThisMonth(deposits, p.id, today), done = pl.planned > 0 && moved >= pl.planned - 0.005;
    const line = pl.status === 'done' ? `${pill('Done', 'good')} Fully funded.`
      : pl.status === 'nodate' ? `No date set, so there is nothing to plan towards.${pl.planned ? ` You move ${gbp(pl.planned)} a month.` : ''} Add a date under Edit.`
      : pl.status === 'short' ? (pl.overdue ? `${pill('Date passed', 'warn')} ${gbp(pl.needed)} still needed.` : `${pill(`${gbp(pl.short)} short`, 'warn')} At ${gbp(pl.planned)} a month you reach <b>${gbp(pl.projected)}</b> by ${shortDate(p.target_date)} (${pl.left} transfer${pl.left === 1 ? '' : 's'} left). <b>${gbp(pl.requiredMonthly)} a month</b> reaches ${gbp(pl.target)}.`)
      : `${pill('On track', 'good')} Put aside <b>${gbp(pl.planned)}</b> a month (${pl.left} transfer${pl.left === 1 ? '' : 's'} left).`;
    const mine = deposits.filter((d) => d.pot_id === p.id);
    const panel = !open || open.id !== p.id ? '' : open.what === 'add'
      ? `<form class="add wrapf" data-act="deposit" data-id="${p.id}"><label class="lab">Amount (£)<input class="field" style="width:8em" name="amount" inputmode="decimal" required placeholder="e.g. 50"></label><input class="field" style="flex:1 1 140px" name="note" maxlength="120" placeholder="Note (optional)" aria-label="Note"><button class="btn pri">Add</button></form><p class="hint">Use a minus to take money out, like -100.</p>`
      : open.what === 'history'
        ? (mine.length ? mine.slice(0, 12).map((d) => `<div class="row"><span class="rt"><span class="rtitle">${gbp(d.amount)}</span><span class="rmeta"><span>${formatDateShort(d.deposited_on)}</span>${d.note ? `<span>${esc(d.note)}</span>` : ''}</span></span><button class="btn sm ghost" data-act="depdel" data-id="${d.id}" data-pot="${p.id}" aria-label="Delete this entry">×</button></div>`).join('') : empty('Nothing moved in yet.'))
        : `<form class="add wrapf" data-act="potsave" data-id="${p.id}"><input class="field" style="flex:1 1 100%" name="name" required maxlength="80" value="${esc(p.name)}" aria-label="Name">
            <label class="lab">Amount needed (£)<input class="field" style="width:8em" name="target" inputmode="decimal" value="${p.target}" required></label><label class="lab">By<input class="field" type="date" name="date" value="${p.target_date || ''}"></label>
            <label class="lab">Monthly amount (£)<input class="field" style="width:8em" name="monthly" inputmode="decimal" value="${p.monthly_amount ?? ''}" placeholder="${pl.suggested ? `suggested ${pl.suggested}` : 'blank = suggested'}"></label>
            <select class="field" name="goal" aria-label="Linked goal">${options(goals.map((x) => [x.id, x.title]), p.goal_id, 'No linked goal')}</select><select class="field" name="kind" aria-label="Type">${options([['saving', 'Savings goal'], ['bill', 'Upcoming bill']], p.kind)}</select><button class="btn pri">Save</button></form>
          ${confirmDelete === p.id ? `<div class="btns"><span class="hint">Delete this pot and all its history?</span><button class="btn sm" data-act="potdelyes" data-id="${p.id}">Yes, delete</button><button class="btn sm ghost" data-act="potdelno">Keep</button></div>` : `<div class="btns"><button class="btn sm ghost" data-act="potdelask" data-id="${p.id}">Delete this pot</button></div>`}`;
    const t = (what, label) => `<button class="btn sm ${open && open.id === p.id && open.what === what ? '' : 'ghost'}" data-act="panel" data-id="${p.id}" data-what="${what}">${label}</button>`;
    return `<div class="stack"><div class="row"><span class="rt"><span class="rtitle">${esc(p.name)}</span><span class="rmeta">${pill(p.kind === 'saving' ? 'Savings goal' : 'Upcoming bill', p.kind === 'saving' ? 'goal' : '')}${p.target_date ? `<span>by ${shortDate(p.target_date)} ${p.target_date.slice(0, 4)}</span>` : ''}${g ? pill('Linked to your goal', 'goal') : ''}</span></span><span class="right"><b>${gbp(pl.balance)}</b> of ${gbp(pl.target)}</span></div>
      ${bar(Math.min(100, Math.round(100 * pl.balance / pl.target)), null, 'good')}<p>${line}</p>
      <div class="btns">${pl.planned > 0 && pl.status !== 'done' ? (done ? '<button class="btn sm" disabled>Moved ✓</button>' : `<button class="btn sm pri" data-act="moved" data-id="${p.id}">Moved ${gbp(pl.planned)}</button>`) : ''}${t('add', '+ Add money')}${t('history', 'History')}${t('edit', 'Edit')}</div>${panel}</div>`;
  }

  function potsTab(){
    return `<section class="panel"><h2>Pots <small>Money you are putting aside</small></h2>
        ${pots.length ? pots.map(potCard).join('') : empty('No pots yet. Add one below: a savings goal, or an upcoming bill you want to be ready for.')}
        <form class="add wrapf" data-act="addpot"><input class="field" style="flex:1 1 100%" name="name" required maxlength="80" placeholder="Pot name, e.g. Christmas" aria-label="Pot name">
          <select class="field" name="kind" aria-label="Type">${options([['bill', 'Upcoming bill'], ['saving', 'Savings goal']])}</select>
          <label class="lab">Amount needed (£)<input class="field" style="width:8em" name="target" inputmode="decimal" required></label><label class="lab">By<input class="field" type="date" name="date"></label>
          <label class="lab">Already saved (£)<input class="field" style="width:8em" name="saved" inputmode="decimal" placeholder="optional"></label>
          <select class="field" name="goal" aria-label="Link to a goal">${options(goals.map((x) => [x.id, x.title]), null, 'Link to a goal (optional)')}</select><button class="btn pri">Add pot</button></form>
        <p class="hint">For an upcoming bill the app works out the monthly amount for you: what is still needed, divided by the pay days left before it is due. Adding money to a pot that is linked to a goal updates that goal's progress.</p></section>`;
  }

  // ---------- Payments ----------
  function paymentsTab(){
    const rolled = payments.map((p) => ({ ...p, due: rollDue(p.next_due, p.cadence, today) }));
    const potOf = (p) => pots.find((x) => x.id === p.pot_id);
    const when = (p) => (p.cadence === 'monthly' ? `${ordinal(Number(p.next_due.slice(8, 10)))} of the month` : p.cadence === 'weekly' ? `every ${new Date(`${p.next_due}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}` : `next ${formatDateShort(p.due)} ${p.due.slice(0, 4)}`);
    const row = (p) => { const pot = potOf(p), late = p.cadence === 'one_off' && p.due < today;
      const cover = pot ? pill(`Covered by the ${pot.name} pot`, 'good') : (p.cadence === 'yearly' || p.cadence === 'one_off') ? `${pill('No pot yet', 'warn')}<button class="btn sm" data-act="makepot" data-id="${p.id}">Make a pot</button>` : '';
      return `<div class="row"><span class="rt"><span class="rtitle">${esc(p.title)}</span><span class="rmeta"><span>${esc(when(p))}</span>${late ? pill('Past', '') : ''}${cover}</span></span><span class="right">${gbp(p.amount)}</span><button class="btn sm ghost" data-act="delpay" data-id="${p.id}" aria-label="Delete this payment">×</button></div>`; };
    const group = (c, title) => { const list = rolled.filter((p) => p.cadence === c).sort((a, b) => (c === 'monthly' ? a.next_due.slice(8).localeCompare(b.next_due.slice(8)) : a.due.localeCompare(b.due)) || a.title.localeCompare(b.title)); return list.length ? `<p class="sub">${title}</p>${list.map(row).join('')}` : ''; };
    return `<section class="panel"><h2>Regular payments <small>${gbp(regularMonthly(payments))} a month goes out</small></h2>
        ${payments.length ? group('monthly', 'Every month') + group('weekly', 'Every week') + group('yearly', 'Every year') + group('one_off', 'One-off') : empty('No payments yet. Add the ones that go out on a schedule: rent, phone, insurance, subscriptions.')}
        <form class="add wrapf" data-act="addpay"><input class="field" style="flex:1 1 100%" name="title" required maxlength="80" placeholder="Payment, e.g. Home insurance" aria-label="Payment">
          <label class="lab">£<input class="field" style="width:7em" name="amount" inputmode="decimal" required></label>
          <select class="field" name="cadence" aria-label="How often">${options(Object.entries(CADENCE_LABEL).map(([k, v]) => [k, v.toLowerCase()]), 'monthly')}</select>
          <label class="lab">Next due<input class="field" type="date" name="next_due" required value="${today}"></label>
          <select class="field" name="pot" aria-label="Covered by a pot">${options(pots.map((x) => [x.id, x.name]), null, 'Covered by a pot? (optional)')}</select><button class="btn pri">Add payment</button></form>
        <p class="hint">Monthly and weekly payments make up the total above. Yearly and one-off ones are meant to be covered by a pot. Anything due soon shows on Today and in the morning notification, and yearly and one-off ones count down in Events.</p></section>`;
  }

  const draw = () => { root.innerHTML = tabsHtml + (tab === 'pots' ? potsTab() : tab === 'payments' ? paymentsTab() : overview()); };
  const refresh = async () => { await load(); draw(); };

  // After money goes in or out of a pot that is linked to a goal, the goal follows: its number (for a numeric goal) and "last progress".
  async function syncGoal(pot, newBalance){
    if (!pot.goal_id) return;
    const g = goals.find((x) => x.id === pot.goal_id), patch = { last_progress_on: today };
    if (g && g.measure === 'numeric') patch.current_value = newBalance;
    await store.goals.set(pot.goal_id, patch);
  }
  async function putIn(pot, amount, note){
    await store.moneyDeposits.add({ pot_id: pot.id, amount, deposited_on: today, note });
    await syncGoal(pot, potBalance(deposits, pot.id) + amount);
  }

  wire(root, {
    async moved(n){
      const pot = pots.find((p) => p.id === n.dataset.id), item = transferChecklist(pots, deposits, today, settings.payday).items.find((i) => i.pot.id === n.dataset.id);
      if (!pot || !item) return;
      const amount = Math.max(0.01, Math.round((item.amount - Math.min(item.moved, item.amount)) * 100) / 100);
      await putIn(pot, amount, 'Moved');
      toast(`${gbp(amount)} added to ${pot.name}.`);
      await refresh();
    },
    panel(n){ open = open && open.id === n.dataset.id && open.what === n.dataset.what ? null : { id: n.dataset.id, what: n.dataset.what }; confirmDelete = null; draw(); },
    async deposit(f){
      const pot = pots.find((p) => p.id === f.dataset.id), row = cleanDeposit(formData(f));
      if (!pot || !row) { toast('Type an amount, like 50 or -100.'); return; }
      await putIn(pot, row.amount, row.note);
      toast(`${gbp(row.amount)} ${row.amount < 0 ? 'taken out of' : 'added to'} ${pot.name}.`);
      await refresh();
    },
    async depdel(n){
      const pot = pots.find((p) => p.id === n.dataset.pot), d = deposits.find((x) => x.id === n.dataset.id);
      await store.moneyDeposits.del(n.dataset.id);
      if (pot && d) await syncGoal(pot, potBalance(deposits, pot.id) - Number(d.amount));
      await refresh();
    },
    async addpot(f){
      const v = formData(f), c = cleanPot(v);
      if (!c) { toast('Give the pot a name and an amount.'); return; }
      const pot = await store.moneyPots.add(c.row);
      if (c.saved > 0) await putIn(pot, c.saved, 'Opening balance');
      toast('Pot added.');
      await refresh();
    },
    async potsave(f){
      const v = formData(f), c = cleanPot(v);
      if (!c) { toast('A pot needs a name and an amount.'); return; }
      await store.moneyPots.set(f.dataset.id, c.row);
      open = null;
      toast('Saved.');
      await refresh();
    },
    potdelask(n){ confirmDelete = n.dataset.id; draw(); },
    potdelno(){ confirmDelete = null; draw(); },
    async potdelyes(n){ await store.moneyPots.del(n.dataset.id); confirmDelete = null; open = null; toast('Pot deleted.'); await refresh(); },
    async addpay(f){
      const row = cleanPayment(formData(f));
      if (!row) { toast('A payment needs a name, an amount and a date.'); return; }
      await store.moneyPayments.add(row);
      toast('Payment added.');
      await refresh();
    },
    async delpay(n){ await store.moneyPayments.del(n.dataset.id); await refresh(); },
    async makepot(n){
      const p = payments.find((x) => x.id === n.dataset.id);
      if (!p) return;
      const pot = await store.moneyPots.add({ name: p.title, kind: 'bill', target: p.amount, target_date: rollDue(p.next_due, p.cadence, today), goal_id: null, monthly_amount: null, sort_order: pots.length });
      await store.moneyPayments.set(p.id, { pot_id: pot.id });
      toast(`Pot made for ${p.title}. See it under Pots.`);
      await refresh();
    },
    async msettings(f){
      const m = cleanMoneySettings(formData(f));
      await store.settings.save({ ...cfg, money: m });
      toast('Saved.');
      await refresh();
    }
  });
  await refresh();
}
