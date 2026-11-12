// Small rendering and event helpers shared by every view.
import { escapeHtml, toast } from './fit/utils.js';

export const esc = escapeHtml;

// pct fill, optional "where you should be" marker, optional colour class.
export function bar(pct, exp, cls){
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="bar ${cls || ''}"><span style="width:${p}%"></span>${exp != null ? `<i style="left:${Math.max(0, Math.min(100, exp))}%" title="Where you should be by today"></i>` : ''}</div>`;
}

export function pill(text, cls){
  return `<span class="pill ${cls || ''}">${esc(text)}</span>`;
}

export function empty(text){
  return `<p class="hint">${esc(text)}</p>`;
}

export function options(list, selected, blank){
  return (blank != null ? `<option value="">${esc(blank)}</option>` : '')
    + list.map(([v, label]) => `<option value="${esc(v)}" ${String(selected ?? '') === String(v) ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

// One delegated listener set per view root. Buttons/links fire on click,
// inputs/selects on change, forms on submit; handler = acts[data-act].
export function wire(el, acts){
  async function run(node, e){
    const fn = acts[node.dataset.act];
    if (!fn) return;
    try { await fn(node, e); } catch (err) { console.error(err); toast(err.message || 'Something went wrong'); }
  }
  el.addEventListener('click', (e) => {
    const n = e.target.closest('[data-act]');
    if (n && !n.matches('input, select, textarea, form')) run(n, e);
  });
  el.addEventListener('change', (e) => {
    const n = e.target.closest('input[data-act], select[data-act]');
    if (n) run(n, e);
  });
  el.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-act]');
    if (f) { e.preventDefault(); run(f, e); }
  });
}

export function formData(form){
  return Object.fromEntries(new FormData(form).entries());
}

export function money(n){
  return '£' + Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 });
}
