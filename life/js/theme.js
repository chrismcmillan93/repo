// Light / dark / follow-the-device. With nothing saved the app follows the
// device; the header button saves an explicit choice per device. index.html
// applies a saved choice before first paint so there is no flash.
const KEY = 'life-theme';
const ORDER = ['system', 'light', 'dark'];
const LABEL = { system: 'Theme: device', light: 'Theme: light', dark: 'Theme: dark' };

function saved(){
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch (_) { return 'system'; }
}

function apply(choice){
  if (choice === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', choice);
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#172022' : '#FFFFFF');
}

export function initTheme(button){
  let choice = saved();
  const paint = () => { apply(choice); button.textContent = LABEL[choice]; };
  button.addEventListener('click', () => {
    choice = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    try { if (choice === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, choice); } catch (_) { /* not saved, still applied */ }
    paint();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);
  paint();
}
