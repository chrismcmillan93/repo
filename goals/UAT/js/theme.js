// Theme switching: System (default, follows the OS), Light, Dark, Sepia,
// Slate. Persisted per-device in localStorage — see index.html for the
// tiny inline script that applies a stored choice before first paint, so
// there's no flash of the wrong theme on load.

const STORAGE_KEY = 'goals-theme';
const THEMES = ['light', 'dark', 'sepia', 'slate'];

export function getStoredTheme() {
  try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
}

export function applyTheme(theme) {
  if (theme && THEMES.includes(theme)) {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function setTheme(theme) {
  try {
    if (theme && THEMES.includes(theme)) localStorage.setItem(STORAGE_KEY, theme);
    else localStorage.removeItem(STORAGE_KEY);
  } catch (e) { /* localStorage unavailable (private mode etc.) — theme just won't persist */ }
  applyTheme(theme);
}

/** Wires up a <select> with options value="" (System)/light/dark/sepia/slate. */
export function bindThemePicker(selectEl) {
  if (!selectEl) return;
  selectEl.value = getStoredTheme() || '';
  selectEl.addEventListener('change', () => setTheme(selectEl.value || null));
}
