// Settings: install, notifications, theme, bringing data over from Goals, sign out.
import * as store from '../store.js';
import { esc, pill, wire, formData } from '../ui.js';
import { toast } from '../fit/utils.js';
import { isStandalone, isIos, canPromptInstall, promptInstall, pushSupported, currentSubscription, enablePush, disablePush, sendTestPush } from '../pwa.js';
import { importFromGoalsApp, importSummary } from '../importer.js';
import { garmin, garminPrefs, syncSummary, syncError } from '../fit/garmin.js';
import { todayStr } from '../fit/utils.js';
import { daysBetween } from '../lib.js';

export async function render(root){
  let cfg = {}, sub = null, devices = [], gstate = null;
  async function load(){ [cfg, sub, devices, gstate] = await Promise.all([store.settings.get(), currentSubscription().catch(() => null), store.pushSubs.list((q) => q.order('created_at')), garmin.state().catch(() => null)]); }
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Garmin: connection status, the three automatic commitments, and the key's end date.
  function garminHtml(){
    const g = garminPrefs(cfg);
    const left = g.key_expires ? daysBetween(todayStr(), g.key_expires) : null;
    const status = !gstate ? `<p>${pill('Not connected')} Nothing has synced yet. The GARMIN_API_KEY secret has to be set in Supabase.</p>`
      : gstate.last_status === 'error' ? `<p>${pill('Sync failing', 'bad')} ${esc(gstate.last_message || '')}</p>`
      : `<p>${pill('Connected', 'good')} Last synced ${gstate.last_ok_at ? when(gstate.last_ok_at) : 'never'}.</p>`;
    const history = !gstate ? '' : gstate.backfill_done ? '<p class="hint">All of your Garmin history is loaded.</p>'
      : gstate.backfill_cursor ? `<p class="hint">History is loaded back to ${new Date(gstate.backfill_cursor + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. The rest arrives over the next few hours.</p>` : '';
    const row = (on, title, meta, fields) => `<div class="row"><input type="checkbox" name="${on}" ${g[on] ? 'checked' : ''} aria-label="${esc(title)}"><span class="rt"><span class="rtitle">${title}</span><span class="rmeta">${meta}</span>
      <span class="wrapf">${fields}</span></span></div>`;
    const numf = (name, label, attrs) => `<label class="lab">${label}<input class="field gnum" type="number" name="${name}" value="${esc(g[name])}" ${attrs}></label>`;
    return `<section class="panel"><h2>Garmin</h2>${status}${history}
      <div class="btns"><button class="btn" data-act="garminsync">Sync now</button><a class="btn ghost" href="#/health/progress">Trends</a></div>
      <p class="hint">Syncs every half hour. A run on a day with a run session ticks it for you, and a weigh-in logged in Garmin fills in any day you haven't typed one.</p>
      <form data-act="garminprefs" class="stack"><p class="sub">Weekly commitments from Garmin</p>
        ${row('sleep_on', 'Sleep', 'Counts the nights you slept at least this long', numf('sleep_hours', 'Hours', 'min="4" max="12" step="0.5"') + numf('sleep_nights', 'Nights a week', 'min="1" max="7" step="1"'))}
        ${row('steps_on', 'Steps', 'Counts the days you reached this many steps', numf('steps', 'Steps', 'min="1000" max="50000" step="500"') + numf('steps_days', 'Days a week', 'min="1" max="7" step="1"'))}
        ${row('km_on', 'Running distance', "Uses the plan's weekly distance when the week is in the plan", numf('km', 'Kilometres a week otherwise', 'min="1" max="300" step="1"'))}
        <label class="lab">Garmin API key expires on<input class="field" type="date" name="key_expires" value="${esc(g.key_expires || '')}"></label>
        <p class="hint">${left == null ? 'Garmin keys last up to a year and the sync stops when one lapses. Put the date in and Today will warn you two weeks before.' : left < 0 ? 'That date has passed: create a new key in Garmin Connect and replace the secret in Supabase.' : `${left} day${left === 1 ? '' : 's'} left. Today warns you two weeks before.`}</p>
        <div class="btns"><button class="btn">Save Garmin settings</button></div></form></section>`;
  }
  const n = () => ({ morning_on: true, morning: '07:00', evening_on: true, evening: '21:00', ...(cfg.notify || {}) });

  function draw(){
    const p = n();
    const installed = isStandalone();
    const installHtml = installed ? `<p>${pill('Installed', 'good')} You're using the installed app.</p>`
      : canPromptInstall() ? '<div class="btns"><button class="btn pri" data-act="install">Install Life</button></div>'
      : isIos() ? '<ol class="steps"><li>Open this page in Safari.</li><li>Tap the Share button.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open Life from the new icon.</li></ol>'
      : '<p class="hint">Use your browser menu: <b>Install app</b> or <b>Add to Home screen</b>.</p>';
    let pushHtml;
    if (!pushSupported()) pushHtml = `<p class="hint">${isIos() && !installed ? 'On iPhone, notifications only work in the installed app. Install it first (above), open it from the icon, then come back here.' : 'This browser cannot receive notifications.'}</p>`;
    else if (Notification.permission === 'denied') pushHtml = '<p class="hint">Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.</p>';
    else pushHtml = sub ? `<p>${pill('On for this device', 'good')}</p><div class="btns"><button class="btn" data-act="test">Send a test</button><button class="btn ghost" data-act="pushoff">Turn off on this device</button></div>`
      : '<div class="btns"><button class="btn pri" data-act="pushon">Turn on notifications</button></div>';
    root.innerHTML = `<div class="cols"><div class="stack">
      <section class="panel"><h2>Install on your phone</h2><p class="hint">Opens full screen like an app, works with no signal (read-only), and is needed for notifications on iPhone.</p>${installHtml}</section>
      <section class="panel"><h2>Notifications</h2>${pushHtml}
        <form data-act="times" class="stack"><label class="row"><input type="checkbox" name="morning_on" ${p.morning_on ? 'checked' : ''}><span class="rt"><span class="rtitle">Morning brief</span><span class="rmeta">Today's session, top three, tasks due and the next event</span></span>
          <input class="field" type="time" name="morning" value="${esc(p.morning)}" aria-label="Morning brief time"></label>
          <label class="row"><input type="checkbox" name="evening_on" ${p.evening_on ? 'checked' : ''}><span class="rt"><span class="rtitle">Evening reminder</span><span class="rmeta">Only if the day isn't closed yet. Sundays add the weekly review.</span></span>
          <input class="field" type="time" name="evening" value="${esc(p.evening)}" aria-label="Evening reminder time"></label>
          <div class="btns"><button class="btn">Save times</button></div></form>
        ${devices.length ? `<p class="hint">Sending to ${devices.length} device${devices.length === 1 ? '' : 's'}: ${devices.map((d) => esc(d.device || 'device')).join(', ')}. Times are UK time.</p>` : ''}</section>
    </div><div class="stack">
      ${garminHtml()}
      <section class="panel"><h2>Bring things over from the Goals app</h2><p class="hint">Copies your goals and milestones, wishlist, notes pages and Playbook progress. Anything already copied is skipped, so it's safe to run again. The Goals app itself isn't changed.</p>
        <div class="btns"><button class="btn" data-act="import">Import from Goals</button></div></section>
      <section class="panel"><h2>Other apps</h2><div class="btns"><a class="btn" href="../goals/">Goals</a><a class="btn" href="../fitness/">Fitness</a></div>
        <p class="hint">Fitness stays in step with Life: ticks, session picks, weigh-ins and check-ins are shared.</p></section>
      <section class="panel"><h2>Account</h2><div class="btns"><button class="btn" data-act="signout">Sign out</button></div></section>
    </div></div>`;
  }
  const refresh = async () => { await load(); draw(); };
  window.addEventListener('life:installable', () => { if (root.isConnected) draw(); });
  wire(root, {
    async install(){ if (await promptInstall()) toast('Installed'); draw(); },
    async pushon(b){ b.disabled = true; try { await enablePush(); toast('Notifications on'); } catch (err) { toast(err.message); } await refresh(); },
    async pushoff(){ await disablePush(); toast('Notifications off for this device'); await refresh(); },
    async test(){ const r = await sendTestPush(); toast(r.sent ? 'Sent. It should arrive in a few seconds.' : 'Nothing sent: no devices are set up.'); },
    async times(f){
      const v = formData(f);
      await store.settings.save({ ...cfg, notify: { morning_on: !!v.morning_on, morning: v.morning || '07:00', evening_on: !!v.evening_on, evening: v.evening || '21:00' } });
      toast('Saved');
      await refresh();
    },
    async garminsync(b){
      b.disabled = true; b.textContent = 'Syncing with Garmin…';
      try { toast(syncSummary(await garmin.runSync())); } catch (err) { toast(syncError(err)); }
      await refresh();
    },
    async garminprefs(f){
      const v = formData(f), n = (k, d) => (Number(v[k]) > 0 ? Number(v[k]) : d);
      await store.settings.save({ ...cfg, garmin: {
        sleep_on: !!v.sleep_on, sleep_hours: n('sleep_hours', 7), sleep_nights: n('sleep_nights', 7),
        steps_on: !!v.steps_on, steps: n('steps', 8500), steps_days: n('steps_days', 7),
        km_on: !!v.km_on, km: n('km', 20), key_expires: v.key_expires || null } });
      toast('Garmin settings saved');
      await refresh();
    },
    async import(b){ b.disabled = true; toast(importSummary(await importFromGoalsApp())); b.disabled = false; },
    signout(){ document.getElementById('signOut').click(); }
  });
  await refresh();
}
