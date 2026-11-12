// Settings: install, notifications, theme, bringing data over from Goals, sign out.
import * as store from '../store.js';
import { esc, pill, wire, formData } from '../ui.js';
import { toast } from '../fit/utils.js';
import { isStandalone, isIos, canPromptInstall, promptInstall, pushSupported, currentSubscription, enablePush, disablePush, sendTestPush } from '../pwa.js';
import { importFromGoalsApp, importSummary } from '../importer.js';

export async function render(root){
  let cfg = {}, sub = null, devices = [];
  async function load(){ [cfg, sub, devices] = await Promise.all([store.settings.get(), currentSubscription().catch(() => null), store.pushSubs.list((q) => q.order('created_at'))]); }
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
    async import(b){ b.disabled = true; toast(importSummary(await importFromGoalsApp())); b.disabled = false; },
    signout(){ document.getElementById('signOut').click(); }
  });
  await refresh();
}
