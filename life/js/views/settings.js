// Settings: install, notifications, theme, bringing data over from Goals, sign out.
import * as store from '../store.js';
import { esc, pill, wire, formData, options } from '../ui.js';
import { toast } from '../fit/utils.js';
import { isStandalone, isIos, canPromptInstall, promptInstall, pushSupported, currentSubscription, enablePush, disablePush, sendTestPush, BUILD, refreshApp } from '../pwa.js';
import { garmin, garminPrefs, syncSummary, syncError } from '../fit/garmin.js';
import { todayStr, addDays, formatDateShort } from '../fit/utils.js';
import { breakList, addBreak, updateBreak, removeBreak } from '../away.js';
import { lockConfig, setPin, turnOff, lockNow, biometricSupported, biometricOn, enableBiometric, disableBiometric } from '../lock.js';
import { buildBackup, saveBackup } from '../backup.js';
import { daysBetween } from '../lib.js';

export async function render(root){
  let cfg = {}, sub = null, devices = [], gstate = null, editing = null;
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

  function versionPanel(){
    return `<section class="panel"><h2>App version ${pill(BUILD, '')}</h2>
      <p class="hint">The app checks for a new version every time you open it. If this build number looks old, this clears the saved copy and loads the latest. Your data and sign-in stay.</p>
      <div class="btns"><button class="btn" data-act="refreshapp">Get the latest version</button></div></section>`;
  }

  function backupPanel(){
    const last = cfg.last_backup;
    const days = last ? daysBetween(last, todayStr()) : null;
    return `<section class="panel"><h2>Back up your data ${last ? pill(`${days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} ago`}`, days > 30 ? 'warn' : 'good') : pill('Never', 'warn')}</h2>
      <p class="hint">One file with your goals, tasks, commitments, journal, lists, career, events, notes, reviews, niggles and your own Fitness records. It is made on this device and goes nowhere until you save it. Hevy and Garmin data aren't included (they re-sync), and neither are your sign-in or notification keys. The file isn't encrypted, so keep it somewhere safe.</p>
      <label class="check"><input type="checkbox" id="backupPrivate"> Include Giving up (private; anyone with the file can read it)</label>
      <div class="btns"><button class="btn pri" data-act="backup">Download a backup</button></div></section>`;
  }

  let bioOk = false;
  biometricSupported().then((ok) => { if (ok !== bioOk) { bioOk = ok; if (root.isConnected) draw(); } });
  function lockPanel(){
    const cfg = lockConfig();
    if (cfg) return `<section class="panel"><h2>App lock ${pill('On', 'good')}</h2>
      <p class="hint">A PIN on this device. It covers ${cfg.scope === 'app' ? 'the whole app' : 'only Giving up'} ${cfg.minutes ? `once you've been away for ${cfg.minutes} minute${cfg.minutes === 1 ? '' : 's'}` : 'as soon as you leave it'}. It stops casual glances at an unlocked phone. It is not encryption.</p>
      <div class="btns"><button class="btn" data-act="locknow">Lock now</button>${bioOk ? (biometricOn() ? '<button class="btn" data-act="biooff">Remove Face ID / fingerprint</button>' : '<button class="btn" data-act="bioon">Add Face ID / fingerprint</button>') : ''}</div>
      ${biometricOn() ? '<p class="hint">Face ID / fingerprint unlock is on for this device. Your PIN always still works.</p>' : bioOk ? '<p class="hint">You can also unlock with Face ID or your fingerprint. The PIN stays as the backup.</p>' : ''}
      <form class="add wrapf" data-act="lockoff"><label class="lab">Your PIN, to turn it off<input class="field" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" required></label><button class="btn">Turn off</button></form></section>`;
    return `<section class="panel"><h2>App lock</h2>
      <p class="hint">Put a PIN on this device so nobody can browse the app (or just Giving up) on your unlocked phone. It is per device: set it on each one. If you forget it, signing out clears it.</p>
      <form class="stack" data-act="lockon"><div class="wrapf"><label class="lab">PIN (4 to 8 digits)<input class="field" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" autocomplete="off" required></label>
        <label class="lab">Again<input class="field" name="pin2" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" autocomplete="off" required></label></div>
        <div class="wrapf"><label class="lab">Covers<select class="field" name="scope">${options([['app', 'The whole app'], ['private', 'Only Giving up']], 'app')}</select></label>
          <label class="lab">Locks<select class="field" name="minutes">${options([['0', 'As soon as I leave'], ['1', 'After 1 minute away'], ['5', 'After 5 minutes away'], ['15', 'After 15 minutes away']], '1')}</select></label></div>
        <div class="btns"><button class="btn pri">Turn on</button></div></form></section>`;
  }

  function breaksPanel(){
    const today = todayStr();
    const stage = (b) => ((b.from || '0000-01-01') <= today && today < b.until ? 0 : b.until <= today ? 2 : 1); // now, then coming up, then done
    const items = [...breakList()].sort((a, b) => stage(a) - stage(b) || ((a.from || '') < (b.from || '') ? -1 : 1));
    const status = (b) => {
      const from = b.from || '0000-01-01';
      if (from <= today && today < b.until) return pill('Away now', 'good');
      if (from > today) { const n = daysBetween(today, from); return pill(`In ${n} day${n === 1 ? '' : 's'}`, 'goal'); }
      return pill('Done');
    };
    const when = (b) => (b.from ? `Leaves ${formatDateShort(b.from)} · back ${formatDateShort(b.until)}` : `Back ${formatDateShort(b.until)}`);
    const cur = editing ? items.find((b) => b.id === editing) : null;
    const rows = items.map((b) => `<div class="row"><span class="rt"><span class="rtitle">${esc(b.name)}</span><span class="rmeta">${status(b)}<span>${when(b)}</span>${b.event_id ? pill('In Events') : ''}</span></span>
      <span class="step"><button class="btn sm ghost" data-act="breakedit" data-id="${b.id}">Edit</button><button class="btn sm ghost" data-act="breakremove" data-id="${b.id}" aria-label="Remove ${esc(b.name)}">×</button></span></div>`).join('');
    return `<section class="panel"><h2>Breaks and trips <small>${items.length ? `${items.length} added` : ''}</small></h2>
      <p class="hint">Going away or taking time off? Add the dates. While you're away there are no reminders, review prompts or nudges, overdue tasks wait for you, and nothing counts as missed. Everything is back to normal on the day you return. Nothing you've logged is deleted.</p>
      ${rows || '<p class="hint">Nothing added yet.</p>'}
      <p class="sub">${cur ? `Edit ${esc(cur.name)}` : 'Add a break or trip'}</p>
      <form class="stack" data-act="breaksave" data-id="${cur ? cur.id : ''}">
        <div class="wrapf"><label class="lab" style="flex:1 1 150px">Name<input class="field" name="name" required value="${cur ? esc(cur.name) : ''}" placeholder="e.g. USA trip"></label>
          <label class="lab">Leaving<input class="field" type="date" name="from" required value="${cur ? cur.from || today : today}"></label>
          <label class="lab">Back on<input class="field" type="date" name="until" required value="${cur ? cur.until : ''}"></label></div>
        <label class="check"><input type="checkbox" name="countdown" ${cur ? (cur.event_id ? 'checked' : '') : 'checked'}> Show a countdown in Events</label>
        <div class="btns"><button class="btn pri">${cur ? 'Save changes' : 'Add'}</button>${cur ? '<button type="button" class="btn" data-act="breakcancel">Cancel</button>' : ''}</div></form></section>`;
  }

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
      ${versionPanel()}
      ${backupPanel()}
      ${lockPanel()}
      ${breaksPanel()}
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
    async breaksave(f){
      const v = formData(f), input = { name: v.name, from: v.from, until: v.until, countdown: !!v.countdown };
      if (f.dataset.id) await updateBreak(f.dataset.id, input); else await addBreak(input);
      toast(f.dataset.id ? 'Saved' : `Added. Reminders and nudges pause from ${formatDateShort(v.from)} until ${formatDateShort(v.until)}.`);
      editing = null;
      await refresh();
    },
    async lockon(f){
      const v = formData(f);
      if (v.pin !== v.pin2) { toast('The two PINs do not match.'); return; }
      await setPin(v.pin, v.scope, v.minutes);
      toast('Lock on. It applies from the next time you leave the app.');
      draw();
    },
    async lockoff(f){
      const r = await turnOff(formData(f).pin);
      toast(r.ok ? 'Lock off' : r.wait ? `Too many wrong tries. Wait ${r.wait} seconds.` : 'Wrong PIN.');
      draw();
    },
    locknow(){ lockNow(); },
    async bioon(b){ b.disabled = true; try { await enableBiometric(); toast('Face ID / fingerprint added'); } catch (err) { toast(err.message); } draw(); },
    biooff(){ disableBiometric(); toast('Removed. The PIN still works.'); draw(); },
    refreshapp(b){ b.disabled = true; b.textContent = 'Refreshing…'; refreshApp(); },
    async backup(b){
      b.disabled = true; b.textContent = 'Collecting everything…';
      try {
        const { backup, rows } = await buildBackup({ includePrivate: root.querySelector('#backupPrivate').checked });
        const how = await saveBackup(backup);
        if (how !== 'cancelled') {
          cfg = { ...cfg, last_backup: todayStr() };
          await store.settings.save(cfg);
          toast(how === 'shared' ? `Backup of ${rows} records ready to save.` : `Backup of ${rows} records downloaded.`);
        }
      } catch (err) { toast(`Backup failed: ${err.message}`); }
      draw();
    },
    breakedit(n){ editing = n.dataset.id; draw(); },
    breakcancel(){ editing = null; draw(); },
    async breakremove(n){ await removeBreak(n.dataset.id); toast('Removed'); if (editing === n.dataset.id) editing = null; await refresh(); },
    signout(){ document.getElementById('signOut').click(); }
  });
  await refresh();
}
