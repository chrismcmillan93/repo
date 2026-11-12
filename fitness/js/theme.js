// Light / dark theme. With nothing saved the app follows the device
// (prefers-color-scheme, handled in CSS); tapping the toggle saves an explicit
// choice in localStorage ('fit-theme' = 'light' | 'dark'). The inline script in
// index.html applies a saved choice before first paint so there is no flash.
const KEY = 'fit-theme';
const META_COLOR = { dark: '#11151c', light: '#f5f3ee' };

function saved(){
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch (_) { return null; }
}

function systemTheme(){
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function effectiveTheme(){
  return saved() || systemTheme();
}

function apply(){
  const explicit = saved();
  if (explicit) document.documentElement.dataset.theme = explicit;
  else delete document.documentElement.dataset.theme;
  const theme = effectiveTheme();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLOR[theme]);
  const btn = document.getElementById('themeBtn');
  if (btn) {
    // The button shows what tapping it switches TO.
    btn.textContent = theme === 'light' ? '🌙' : '☀️';
    btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    btn.title = theme === 'light' ? 'Dark mode' : 'Light mode';
  }
}

export function initTheme(){
  apply();
  const btn = document.getElementById('themeBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = effectiveTheme() === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(KEY, next); } catch (_) { /* choice just won't persist */ }
      apply();
    });
  }
  // Follow the device while no explicit choice has been made.
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => { if (!saved()) apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }
}
