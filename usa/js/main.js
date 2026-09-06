import { qs, qsa, toast, friendlyError } from './utils.js';
import { db } from './db.js';
import { state, getViewCurrency, setViewCurrency, loadCore } from './state.js';
import { initRouter, renderRoute } from './router.js';
import { renderMasthead } from './views/overview.js';

function renderBunting(){
  const row = qs('#buntingRow');
  if (!row) return;
  let flags = '';
  for (let i = 0; i < 26; i++) flags += '<svg class="flag-flutter" viewBox="0 0 60 44"><use href="#usflag"></use></svg>';
  row.innerHTML = flags;
}

function renderCurrencyToggle(){
  const active = getViewCurrency();
  qsa('#currencyToggle .toggle-pair button').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.currency === active);
  });
}

function renderFxNote(){
  const note = qs('#fxNote');
  if (!note) return;
  if (state.trip && state.trip.fx_rate) {
    note.textContent = `1 GBP = ${Number(state.trip.fx_rate).toFixed(4)} USD`;
  } else {
    note.textContent = 'Rate not set';
  }
}

function renderBrandSub(){
  const sub = qs('#brandSub');
  if (!sub || !state.legs.length) return;
  sub.textContent = state.legs.map((l) => l.name).join(' · ');
}

function wireCurrencyToggle(){
  qs('#currencyToggle .toggle-pair').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-currency]');
    if (!btn) return;
    setViewCurrency(btn.dataset.currency);
  });
}

function wireFxEdit(){
  const wrap = qs('#currencyToggle');
  const btn = qs('#fxEditBtn');
  btn.addEventListener('click', () => {
    if (qs('.fx-edit-form')) return; // already open
    const current = state.trip ? state.trip.fx_rate : '';
    const form = document.createElement('span');
    form.className = 'fx-edit-form';
    form.innerHTML = `
      <input type="number" step="0.0001" min="0.0001" value="${current || ''}" aria-label="GBP to USD rate">
      <button type="button" class="fx-save">Save</button>
      <button type="button" class="fx-cancel">Cancel</button>
    `;
    btn.replaceWith(form);
    const input = qs('input', form);
    input.focus();
    input.select();

    function close(restoreBtn){
      form.replaceWith(btn);
      if (restoreBtn) wireFxEdit();
    }
    qs('.fx-cancel', form).addEventListener('click', () => close(true));
    qs('.fx-save', form).addEventListener('click', async () => {
      const val = parseFloat(input.value);
      if (!val || val <= 0) { toast('Enter a rate greater than zero'); return; }
      try {
        state.trip = await db.trips.update(state.trip.id, { fx_rate: val });
        renderFxNote();
        toast('Exchange rate updated');
        close(true);
        renderRoute();
      } catch (err) {
        toast(friendlyError(err));
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') qs('.fx-save', form).click();
      if (e.key === 'Escape') close(true);
    });
  });
}

async function boot(){
  renderBunting();
  wireCurrencyToggle();
  wireFxEdit();
  initRouter();

  window.addEventListener('usa:currencychange', () => {
    renderCurrencyToggle();
    renderRoute();
  });
  window.addEventListener('usa:tripchange', async () => {
    await loadCore();
    renderFxNote();
    renderBrandSub();
    renderMasthead();
    renderRoute();
  });

  renderCurrencyToggle();

  try {
    await loadCore();
    renderFxNote();
    renderBrandSub();
    renderMasthead();
  } catch (err) {
    toast(friendlyError(err));
  }

  await renderRoute();
}

boot();
