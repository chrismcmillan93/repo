// The 7 days of the week containing state.currentDate, at a glance, plus an
// adherence summary for that week.
import { qs, qsa, escapeHtml, startOfWeek, endOfWeek, dateRange, formatDayLabel,
  formatDateShort, dayTypeLabel, statusLabel, todayStr } from '../utils.js';
import { db } from '../db.js';
import { state } from '../state.js';
import { renderRoute } from '../router.js';

function dayTypeFromSession(sessionType){
  return sessionType === 'upper' || sessionType === 'lower' ? 'lift' : sessionType === 'run' ? 'run' : sessionType === 'rest' ? 'rest' : null;
}

function statusDotHtml(status){
  if (!status) return '<span class="status-dot status-dot-none" title="Not logged"></span>';
  return `<span class="status-dot status-dot-${status}" title="${escapeHtml(statusLabel(status))}"></span>`;
}

export async function render(main){
  const weekStart = startOfWeek(state.currentDate);
  const weekEnd = endOfWeek(state.currentDate);
  const days = dateRange(weekStart, weekEnd);
  const today = todayStr();

  const block = await db.blocks.getCurrent(weekStart).catch(() => null) || await db.blocks.getCurrent(weekEnd).catch(() => null);
  const sessions = block ? await db.sessionTemplates.list(block.id) : [];
  const logs = state.session ? await db.dailyLogs.listRange(state.session.user.id, weekStart, weekEnd) : [];
  const logByDate = Object.fromEntries(logs.map((l) => [l.log_date, l]));
  const weekRow = block ? (await db.blockWeeks.list(block.id)).find((w) => weekStart >= w.start_date && weekStart <= w.end_date) : null;

  function sessionFor(dateStr, dow){
    const override = sessions.find((s) => s.day_of_week === dow && s.week_number === (weekRow ? weekRow.week_number : null));
    return override || sessions.find((s) => s.day_of_week === dow && s.week_number === null);
  }

  const rows = days.map((d, i) => {
    const dow = i + 1;
    const session = block ? sessionFor(d, dow) : null;
    const dayType = session ? dayTypeFromSession(session.session_type) : null;
    const log = logByDate[d];
    const isToday = d === today;
    return `
      <li class="week-day-row ${isToday ? 'is-today' : ''}" data-date="${d}">
        <button type="button" class="week-day-btn">
          <span class="week-day-name">${escapeHtml(formatDayLabel(d))}</span>
          <span class="week-day-date">${escapeHtml(formatDateShort(d))}</span>
          <span class="week-day-session">${session ? escapeHtml(session.title) : (block ? '—' : 'Outside block')}</span>
          <span class="week-day-dots">
            ${statusDotHtml(log ? log.nutrition_status : null)}
            ${statusDotHtml(log ? log.training_status : null)}
          </span>
        </button>
      </li>`;
  }).join('');

  const daysLogged = days.filter((d) => logByDate[d] && (logByDate[d].nutrition_status || logByDate[d].training_status)).length;
  const count = (key, val) => days.filter((d) => logByDate[d] && logByDate[d][key] === val).length;

  main.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">${weekRow ? `Week ${weekRow.week_number} of 8` : 'This week'}</h2>
      <ul class="week-day-list">${rows}</ul>
    </section>
    <section class="panel">
      <h2 class="panel-title">Adherence this week</h2>
      <div class="adherence-grid">
        <div class="adherence-stat"><span class="adherence-num">${daysLogged}/7</span><span class="adherence-label">days logged</span></div>
        <div class="adherence-stat"><span class="adherence-num">${count('nutrition_status', 'yes')}/${count('nutrition_status', 'partial')}/${count('nutrition_status', 'no')}</span><span class="adherence-label">nutrition yes/partial/no</span></div>
        <div class="adherence-stat"><span class="adherence-num">${count('training_status', 'yes')}/${count('training_status', 'partial')}/${count('training_status', 'no')}</span><span class="adherence-label">training yes/partial/no</span></div>
      </div>
    </section>
  `;

  qsa('.week-day-btn', main).forEach((btn) => {
    btn.addEventListener('click', () => {
      const date = btn.closest('.week-day-row').dataset.date;
      state.currentDate = date;
      if (window.location.hash === '#/today') {
        renderRoute();
      } else {
        window.location.hash = '#/today';
      }
    });
  });
}
