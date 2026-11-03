// A small month calendar, rendered inline (not a floating popover, which is
// awkward on a phone). Tap any day to jump to the week containing it, instead
// of paging week by week. Days outside [minDate, maxDate] are greyed out and
// not tappable; days inside the training plan are tinted so you can see where
// the plan sits; the currently shown week is highlighted.
import { escapeHtml, parseLocalDate, toDateInputValue, addDays, startOfWeek, todayStr } from './utils.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthStart(dateStr){
  return `${dateStr.slice(0, 7)}-01`;
}

function addMonths(monthStartStr, n){
  const d = parseLocalDate(monthStartStr);
  d.setMonth(d.getMonth() + n, 1);
  return toDateInputValue(d);
}

// container: the element to render into. options:
//   selectedDate, minDate, maxDate, planStart, planEnd, onPick(dateStr)
export function mountCalendar(container, options){
  const { selectedDate, minDate, maxDate, planStart, planEnd, onPick } = options;
  const today = todayStr();
  const selWeekStart = startOfWeek(selectedDate);
  // Open on the month most of the shown week falls in (its Thursday).
  let view = monthStart(addDays(selWeekStart, 3));

  function inBounds(d){
    return (!minDate || d >= minDate) && (!maxDate || d <= maxDate);
  }

  function draw(){
    const first = parseLocalDate(view);
    const label = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const gridStart = startOfWeek(view);
    const lastOfMonth = addDays(addMonths(view, 1), -1);
    const cells = [];
    for (let d = gridStart; d <= addDays(startOfWeek(lastOfMonth), 6); d = addDays(d, 1)) {
      const inMonth = d.slice(0, 7) === view.slice(0, 7);
      const ok = inBounds(d);
      const classes = ['cal-day'];
      if (!inMonth) classes.push('is-out');
      if (d === today) classes.push('is-today');
      if (startOfWeek(d) === selWeekStart) classes.push('is-sel-week');
      if (planStart && d >= planStart && d <= planEnd) classes.push('in-plan');
      cells.push(`<button type="button" class="${classes.join(' ')}" data-date="${d}" ${ok ? '' : 'disabled'} aria-label="${escapeHtml(d)}">${Number(d.slice(8))}</button>`);
    }
    const prev = addMonths(view, -1);
    const next = addMonths(view, 1);
    const canPrev = !minDate || monthStart(minDate) <= prev;
    const canNext = !maxDate || next <= monthStart(maxDate);
    container.innerHTML = `
      <div class="cal-head">
        <button type="button" class="date-nav-btn cal-nav" data-cal="prev" ${canPrev ? '' : 'disabled'} aria-label="Previous month">‹</button>
        <div class="cal-title">${escapeHtml(label)}</div>
        <button type="button" class="date-nav-btn cal-nav" data-cal="next" ${canNext ? '' : 'disabled'} aria-label="Next month">›</button>
      </div>
      <div class="cal-grid cal-weekdays">${WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
      <p class="cal-legend"><span class="cal-key in-plan"></span> training plan <span class="cal-key is-sel-week"></span> shown week</p>`;
    container.querySelectorAll('[data-cal]').forEach((b) => b.addEventListener('click', () => {
      view = addMonths(view, b.dataset.cal === 'prev' ? -1 : 1);
      draw();
    }));
    container.querySelectorAll('.cal-day:not([disabled])').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.date)));
  }
  draw();
}
