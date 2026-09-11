// Shared helpers: DOM shortcuts, formatting, toasts. Ported from the money/
// rating/map-link helpers in the live thailand/index.html.

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function fmtGBP(n) { return '£' + Number(n || 0).toFixed(2); }
export function fmtTHBNum(n) { return Math.round(n || 0).toLocaleString('en-GB'); }
export function fmtCount(n) {
  if (n == null) return '';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

// item.cost_thb is null when nobody's entered a real quote — fall back to the
// trip's saved thb_rate, same as the live app's thbFor()/isThbApprox().
export function thbFor(item, trip) {
  if (item.cost_thb != null) return Number(item.cost_thb);
  const rate = trip && trip.thb_rate ? Number(trip.thb_rate) : 45;
  return Math.round((Number(item.cost_gbp || 0) * rate) / 10) * 10;
}
export function isThbApprox(item) { return item.cost_thb == null; }

export function costLine(item, trip) {
  if (!item.cost_gbp || item.cost_gbp <= 0) return 'Free';
  const approx = isThbApprox(item) ? '≈' : '';
  return fmtGBP(item.cost_gbp) + 'pp · ' + approx + '฿' + fmtTHBNum(thbFor(item, trip)) + 'pp';
}

export function mapUrlByText(q) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q); }
export function mapUrlForItem(item) {
  if (item.place_id) {
    const q = encodeURIComponent(item.title || item.place || 'place');
    return 'https://www.google.com/maps/search/?api=1&query=' + q + '&query_place_id=' + item.place_id;
  }
  return mapUrlByText(item.place);
}

export function tagsRowHtml(tags) {
  if (!tags || !tags.length) return '';
  return '<div class="tags-row">' + tags.map((t) => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>';
}

export function ratingAndLinkHtml(item) {
  const parts = [];
  if (item.rating != null) {
    parts.push('<span class="rating">★ ' + Number(item.rating).toFixed(1) +
      (item.rating_count != null ? ' (' + fmtCount(item.rating_count) + ')' : '') + '</span>');
  }
  if (item.place || item.place_id) {
    parts.push('<a class="map-link" href="' + mapUrlForItem(item) + '" target="_blank" rel="noopener noreferrer">📍 Map</a>');
  }
  return parts.join('');
}

export function reservationBadgeHtml(item) {
  return item.needs_reservation ? '<span class="badge" style="background:var(--purple);">📅 Reservation needed</span>' : '';
}

export const CATEGORY_COLORS = {
  Culture: '#8FB0AC', Food: '#E8A33D', Bar: '#F0654A', Rooftop: '#7FB3D9',
  Activity: '#6FBF8C', Coffee: '#C9975B', Training: '#D9764A', Other: '#B7C4C2'
};

export const URGENCY_COLOR = { high: '#F0654A', medium: '#E8A33D', low: '#6FBF8C' };
export const URGENCY_RANK = { high: 0, medium: 1, low: 2 };

let toastTimer = null;
export function toast(message) {
  const host = qs('#toast-host');
  if (!host) return;
  host.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 200);
  }, 2600);
}

export function friendlyError(err) {
  if (!err) return 'Something went wrong.';
  return err.message || String(err);
}
