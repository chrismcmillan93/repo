# Life app (`/life`)

One app for goals, to-dos, lists, career, health and events, served at
`app.chris-mcmillan.co.uk/life/`. Built 2026-11-12/13 to replace `goals/` and `fitness/`
over time; **both of those are untouched and still run**. Same architecture as the other
apps here: plain HTML/CSS/JS ES modules, `@supabase/supabase-js@2` from a CDN `<script>`,
no build step, no framework.

## Data: two schemas, one sign-in

- **`life` schema** (migration `life_schema`): `goals`, `goal_steps`, `commitments`,
  `tasks`, `habits`, `habit_checks`, `journal`, `list_items`, `career_items`, `events`,
  `settings`, plus (second build) `reviews`, `review_goals`, `notes`, `playbook_progress`,
  `push_subscriptions` and the server-only `push_config`. Every table has RLS on with one policy, `user_id = auth.uid()` for all
  operations, granted to `authenticated` only (anon has nothing). No policy queries another
  table, so there is no recursion risk. `js/store.js` also scopes every query by `user_id`.
  Migrations only, same rules as the other schemas. The goal status for a dropped goal is
  `'stopped'`, not "dropped": the Supabase MCP hangs on SQL containing the word "drop".
- **`fitness` schema, read and written directly.** Health, Today's training-and-food card,
  the generated shopping list and the races in Events all use the Fitness app's own tables
  (`daily_checks`, `daily_logs`, `pick_sessions`, `plan_days`, `plan_weeks`, nutrition
  tables, `week_list_ticks`, `hevy_*`, `races`) and its `get_day_bundle()` RPC, with the same
  tick ids (`session:lift|run|rest`, `pick:weights|cardio`, `meal:<day type>:<slot>`,
  `shop:<food>`). A tick made in either app shows in the other. **Changing those ids or the
  bundle shape in `fitness/` breaks this app too** (as it already would Goals' training card).
- **`goals` schema: not used.** The old Goals app was retired (see Fresh start below); nothing here reads or writes it, and the importer is gone.
- **Sign-in** is the shared `cm-apps-auth` session (the same one the other apps on this domain use).

**One-time manual steps (not doable via MCP):** add `life` to Project Settings → Data API
→ "Exposed schemas"; add `https://app.chris-mcmillan.co.uk/life/` to Authentication → URL
Configuration → Redirect URLs (only needed to sign in *from* `/life`; an existing Goals or
Fitness session already works). Until the first is done every screen shows the setup hint.

## `js/fit/`: copies of the Fitness modules

`db.js`, `utils.js`, `nutrition.js`, `state.js`, `sessionChoices.js`, `weekLists.js` and
`analysis.js` (from `fitness/js/lifting/`) are **verbatim copies** of the Fitness app's
files (apps here don't import across app folders). `fit/supabaseClient.js` is a shim that
gives them a `fitness`-schema view of this app's single client. **If a bug is fixed or a
rule changes in `fitness/js/`, copy the file across again** (nutrition scaling especially).
Written for this app: `fit/day.js` (one day: session, picker, lift exercises, meals and
foods, weigh-in; used by Today and Health), `fit/week.js` (one week, day swaps applied),
`fit/feed.js` (below).

## How the pieces connect

- **Goal breakdown.** A goal has steps at three levels (year, quarter, month), this week's
  commitments, and today's tasks. Progress is numeric (start/current/target) or the share
  of steps done; "expected" is elapsed time between start and target date. States
  (`lib.js goalState`): stalled = no progress for 14 days; behind = 8+ points under pace.
  `last_progress_on` is stamped when a linked task is ticked, a commitment goes up, a step
  is ticked or the value changes.
- **Commitments** are per week (`week_start` = Monday) with a target count. A task can
  "count towards" a commitment: ticking it adds one.
- **Fitness feed (`fit/feed.js syncFit`).** Whenever Today, Goals or Week loads, three
  commitments for that week are created or refreshed from Fitness data (`source` =
  `fit_training`, `fit_meals`, `fit_weigh`; unique per user/week/source): sessions ticked
  against days planned or picked, days with every meal ticked, and weigh-ins. A goal with
  `auto_source = 'fitness_weight'` takes its current value from the latest weigh-in and
  owns the meals/weigh-in commitments; `'fitness_training'` owns the training one.
- **Accountability is nudges, never blocks** (Chris's choice): stalled goals, goals with no
  commitment this week, and tasks carried over 3+ times show at the top of Today. Open
  tasks past their date move to today and count a carry-over. The evening "Close the day"
  asks one line per miss (saved to `journal` as `miss`) and moves them to tomorrow.
- **Session picker decides the food.** Same rule as Fitness: Weights or Both gives lift-day
  meals, Cardio gives run-day meals (long-run day when the session is "Long run").
- **Events** are `life.events` (trip, event, renewal, birthday; birthdays repeat yearly)
  merged with Fitness `races`, soonest first.
- **Routes** are `#/<tab>/<...>`: e.g. `#/health/day/2026-12-02`, `#/health/week/<monday>`,
  `#/health/plan`, `#/health/lifts`, `#/lists/packing`, `#/goals/<id>`. Each view exports
  `render(root, params)` and gets a fresh root element, so `ui.js wire()` listeners never
  stack.
- **Theme:** colour variables only; `js/theme.js` cycles device / light / dark
  (`localStorage` `life-theme`), applied before first paint by an inline script.

## Second build (2026-11-13)

- **Review** (`views/review.js`, tables `reviews`, `review_goals`): guided week / month /
  quarter reviews. "Look back" totals for the period (commitments kept, tasks done, days
  closed, wins, every miss with its reason), then each active goal worst-first with a 1-5
  rating, a decision and a note, then reflection. Drafts save on every change; **Complete**
  applies decisions (pause → `paused`, complete → `achieved`, drop → `stopped`; adjust
  opens the goal) and journals the next focus as a `decision`. Today nudges for any
  finished week/month/quarter not yet reviewed (`dueReviews()`).
- **Playbook** (`playbookContent.js` is a verbatim copy of `goals/js/playbookContent.js`;
  never change a book `key` or reorder directives, progress is keyed on them). Progress in
  `playbook_progress` (keyed by `directive_key`). A habit-type directive can be added to
  Today's habits (`habit_id` remembers it).
- **Notes pages** (`notes`) under Journal → Notes pages.
- **Health**: Progress (weight dots + 7-day average, day-by-day food/training grid,
  streaks, adherence by week), Check-in (`fitness.plan_checkins`, one per plan week),
  "How did today go?" on every day (`fitness.daily_logs` statuses, pics, reading, notes;
  the streaks read these), swap-days (`fit/daySwap.js`, verbatim copy), and the
  @cmfitnesslog post maker in Lifts (`fit/posters.js`, verbatim copy; its fonts are
  loaded only when the post panel opens).
- **Install + offline** (`manifest.webmanifest`, `icons/`, `sw.js`, `js/pwa.js`). The
  service worker is network-first for the app's own files **and for Supabase reads**
  (GET `/rest/v1/` and the `get_day_bundle` RPC, keyed by its body), keeping the last
  answer so every screen opened before still shows offline. Writes are never cached:
  `supabaseClient.js guardedFetch` refuses any non-read while `navigator.onLine` is false
  with a plain message, and an "Offline" bar shows under the tabs. Cached data
  (`life-data` cache) is deleted on sign-out. This differs on purpose from usa/fitness,
  whose workers never touch Supabase. Bump `VERSION` in `sw.js` when adding or removing a
  shell file, and add the file to `FILES`.
- **Notifications** (Settings; Edge Function `life-push`, `supabase/functions/life-push/`):
  a morning brief (today's session, top three, tasks due, next event; Monday adds "set
  your commitments") and an evening reminder only if the day isn't closed (Sunday adds the
  weekly review). Times per user in `settings.data.notify` (UK time, defaults 07:00 /
  21:00), sent once a day each, from the chosen time up to 3 hours after.
  - `pg_cron` job `life-push-tick` posts to the function every 15 minutes with header
    `x-cron-key` = `life.push_config.cron_key` (random, generated in the migration, never
    in the repo). `push_config` is server-only: RLS on, no policies, no grants (the
    advisor's "RLS enabled, no policy" INFO for it is expected).
  - The VAPID key pair is generated by the function on first use and stored in
    `push_config.vapid`; nothing was typed in as a secret. `webpush.js` implements VAPID
    and aes128gcm with WebCrypto only (no npm), verified against the `http_ece` reference
    implementation.
  - Deployed with `verify_jwt` off: the function checks the cron key itself, or the
    caller's Supabase session (`action: 'key'` / `'test'`). Expired subscriptions (404/410)
    are deleted. The function runs as `service_role`, which was granted the `life` tables
    and `select` on `fitness.plan_days`, `pick_sessions`, `races` only.
  - iPhone: push only works in the installed Home Screen app (iOS 16.4+).

## Recurring commitments with a cadence (2026-11-13)

A commitment has a **cadence**: daily, weekly or monthly (`life.commitments.cadence`), and
can **repeat** via a rule in `life.commitment_rules` (title, goal, cadence, `per_period`,
`start_date`). Migration `life_recurring_commitments`.

- **Weekly**: N times a week, resets each Monday (`week_start` = that Monday).
- **Daily**: N a day, stored as one weekly row with `target_count = N x 7`, so "1 chapter a
  day" shows as 7 for the week and a missed day can be made up later (cap is the weekly
  total). `paceInfo()` says how far behind: only days *before* today count, so nothing is
  "behind" at 7am; "do N today" = what earlier days were short by plus today's share. Today
  nudges when 2+ behind.
- **Monthly**: N a month, **`week_start` holds the first day of the month**. It shows on
  Week, Goals and Today for every week that touches the month, with days left (amber in
  the last 7). It is **left out of the weekly kept %** (`keptPct()` ignores monthly) and
  counted separately ("1 of 2 monthly done"). Reviews list them under "Monthly commitments".
- **How repeating works**: `lib.js ensureRecurring()` creates the row for the current period
  and any missed since the rule began (up to 8 weeks / 5 months back, so a gap is a real 0,
  not a hole in the history). It runs from `weekCommitments(ws)` (used by Today, Goals,
  Week, To-dos), is remembered for 30 s, and inserts with `ignoreDuplicates` against the
  unique index `(user_id, rule_id, week_start)`, so two screens loading together can't double
  up. Always read a week's commitments through `weekCommitments()`, never `eq('week_start')`
  directly, or monthly rows and not-yet-created repeats are missed.
- **UI** (`views/shared.js`): `commitRow()`, `commitFormHtml()` (how many, every day/week/
  month, "Repeat automatically", goal) and `commitActs()` (inc/dec/delete/repeat/add), used by
  Week (the form, plus a "Repeating" panel to change the number or Stop), a goal's own page
  (goal fixed), and Today (read and tick only). Existing one-off commitments get a "Repeat"
  button. **Changing the number** applies to this period onwards (`setRuleCount`), past
  periods keep what they had. **Stopping** deletes the rule only; everything done stays
  (`commitments.rule_id` is `on delete set null`).
- Health-fed commitments (`source = fit_*`) are unchanged: weekly, one per week, no stepper.

## Garmin (2026-11-13)

Chris's own Garmin Connect data, mirrored into the `fitness` schema and read by this app.
Same shape as Hevy: Garmin stays the source, an Edge Function fills read-only tables.

- **API:** Garmin's *Personal API* (`personal.connectapi.garmin.com`): one self-made key,
  26 read-only GET endpoints, pull only (no webhooks), personal use only. The spec is at
  developer.garmin.com/gc-developer-program/personal/swagger-docs/. Not available from it:
  training readiness/status, race predictions, personal records, gear; VO2 max comes back
  empty. **Learned live, not in Garmin's docs:** the token request must not send
  `Accept: application/json` (it answers 406); weights arrive in **grams** although the
  spec says kilograms; and about 100 requests in a burst gets a 429.
- **Tables** (migration `fitness_garmin_tables`; browser can only `select` its own rows):
  `garmin_activities`, `garmin_days` (steps, resting HR, stress, Body Battery),
  `garmin_sleep` (one row per night keyed by the morning it ended; sleep and HRV are
  written separately, each touching only its own columns), `garmin_weights`,
  `garmin_autoticks`, `garmin_sync_state`. Each data table keeps Garmin's whole answer in
  `raw`, so a new field can be surfaced without fetching history again; **never
  `select('*')` these from the browser** (`fit/garmin.js` names its columns).
  `garmin_config` is server-only like `push_config` (RLS on, no policies, no grants): the
  cron key, the owner's user id, and the cached 24-hour access token. The advisor's
  "RLS enabled, no policy" INFO for it is expected.
- **Edge Function `garmin-sync`** (`supabase/functions/garmin-sync/`, `verify_jwt` off, does
  its own auth: the cron key, or the owner's session). Secret `GARMIN_API_KEY`. Each run:
  re-reads the last 4 days (Garmin revises recent days; activities deleted in Garmin are
  removed here), ticks runs, fills weigh-ins, then walks history backwards 28 days at a
  time (at most 12 chunks a run, place saved after each) until a whole chunk older than
  the first activity comes back empty. `pg_cron` job `garmin-sync-tick` runs it at :05 and
  :35 (migration `fitness_garmin_sync_cron`). One endpoint failing doesn't stop the others;
  the reason lands in `garmin_sync_state.last_message`.
- **Auto-tick.** A run on a day whose session is a run (plan types `run`, `race`,
  `hike_or_run`, `walk`, or a Cardio pick; hikes/walks/stairs count where the session is
  that kind) upserts `daily_checks` `session:run`, the same tick the apps write. Only from
  `garmin_sync_state.autotick_from` (the first sync date) onwards, and once per day:
  `garmin_autoticks` remembers the day, so unticking by hand sticks.
- **Weigh-ins.** The day's first Garmin reading is copied into `daily_logs.weight_kg` only
  where none was typed (`garmin_weights.filled_log` marks which were). A typed value is
  never overwritten.
- **In the app** (`js/fit/garmin.js`, written for this app, not a Fitness copy): Today's
  **Recovery** panel (sleep, HRV against Garmin's balanced range, resting HR against the
  7-day average, Body Battery high; hidden until the first sync); the **From Garmin** block
  on Health → Day and Today (each activity, and planned vs run distance); **trends** at the
  bottom of Health → Progress (`#/health/progress/84|182|365`); and three optional weekly
  commitments fed in `fit/feed.js` (`source` = `garmin_sleep`, `garmin_steps`, `garmin_km`;
  targets in `settings.data.garmin`; the km target is the plan week's `run_km` when the
  week is in the plan). Switching one off removes it from the current week only.
  Settings has the status card, Sync now, the targets, and the key's expiry date
  (`settings.data.garmin.key_expires`, typed in by hand because Garmin's API doesn't
  report it): Today nudges from 14 days before. `life-push` adds last night's sleep, HRV
  and resting HR to the morning brief when the watch has synced by then.
- **When the key lapses** (they last at most a year): create a new one in Garmin Connect
  web → Settings → Personal API Key, replace the `GARMIN_API_KEY` secret, update the date
  in Settings. Nothing else needs touching.
- **Tested:** the sync ran live against the real account (activities, days, nights, HRV
  and weights all landed and were checked against `raw`). The screens were only driven
  with stand-in data in Playwright, and auto-tick has not yet fired on a real planned run
  (the plan starts 2026-11-30).

## Breaks and trips (2026-11-18)

Dates you're away. **While you're in one, nothing counts against you and nothing nags.**
Add them in Settings → Breaks and trips: a name, the day you leave, the day you're back,
and optionally a countdown in Events. `js/away.js` holds all of it; `loadAway()` runs at
sign-in before the first screen. Nothing logged is ever deleted except empty generated
repeats (below).

- **Storage:** `settings.data.breaks = [{ id, name, from, until, started, settled, event_id? }]`.
  `from` = first day away (`null` = already away); `until` = the day you're back, so you're
  away on every day before it. Overlapping or back-to-back breaks are joined into one stretch
  for every check. The old single `settings.data.away = { until, applied }` (used for the
  Nov 2026 trip, written straight to the row) is migrated into the list on the next open
  (as a break named "Away" with `from: null`, which forgives everything before the return
  date) and the `away` key is removed. `life-push` understands both shapes.
- **Countdown:** with "Show a countdown in Events" ticked, a `life.events` row (`kind`
  `trip`, last day away as `end_date`) is created, kept in step when the break is edited, and
  deleted when it's removed (`event_id` links them).
- **No nudges:** Today shows one banner (with the break's name) instead of every nudge
  (stalled goals, no commitment, carried-over tasks, daily behind / monthly running out,
  review due, Garmin key expiry). `paceInfo()` returns nothing, so no "N behind" or "days
  left" pills.
- **No reviews due:** `dueReviews()` skips any week, month or quarter whose last day falls
  inside a break (`endInBreak()`; the return day counts). The Review tab says so; you can
  still start one by hand.
- **No carry-over:** `carryOver()` does nothing while away, so overdue tasks wait and
  `carried_count` doesn't climb.
- **Goals can't go stalled:** `quietDays(goal)` is the days since the last progress **minus
  the days inside breaks**, so the 14-day "stalled" rule only counts days you could have
  acted. **Target dates are never moved** (the Goals-app rule that dates don't shift silently
  still holds), so a dated goal can show "Behind" pace on return; that is the real picture.
- **No missed periods:** `ensureRecurring()` doesn't create a repeat's week or month that
  ended inside a break (`periodOver()`), and `syncFit()` doesn't create or score Health's
  automatic weekly commitments for such weeks, so the scorecard and the 8-week average don't
  fill with zeros.
- **Tidy-up, once at each end** (`resetForBreak()`; per-break flags `started` / `settled`,
  run by `reconcile()` at load and whenever the list changes): when a break is underway
  (or already over) its open tasks due before the return date move to the return date (or
  to today if that has passed), with the top-three flag and carry-over count cleared, and
  repeat-generated commitments with **nothing done** whose period ended inside that break
  are deleted (they would show as 0% weeks). Anything with progress, one-offs and Health's
  rows are left alone. A break that hasn't started yet changes nothing until it does.
- **Push notifications:** `life-push` (`awayNow()`) skips a user on any day inside a break
  (London date): no morning brief, evening reminder or Sunday review prompt. Garmin sync is
  a separate job and keeps running, so the data is there on return.
- **Removing** a break (or the whole list) brings everything back immediately from the real
  dates. `sw.js` `VERSION` is `v3` (the `js/away.js` file was added to the shell list).

## Giving up (2026-11-21)

A private tracker for things being given up (alcohol, porn, drugs, gambling, anything):
days since, best run, and a log of slips. Tab **Giving up** (`views/quit.js`), plus a small
panel on Today. Tables `life.quits` and `life.quit_slips` (migration `life_quit_tracker`).

- **Counting** is all in `js/streaks.js` (pure functions, unit-tested on their own in
  scratch, not checked in): a slip on a date restarts the current run from that date;
  the **best run**, slip count and **clean days in the last 30** are kept, so one slip never
  erases the run before it. A quit date of today shows 0 days ("day zero"). Slips before
  the quit date or in the future are ignored; several slips on one day count once for the run
  and separately as slips. Milestones are 1, 3, 7, 14, 30, 60, 90, 180, 365, 730 days; an
  optional goal in days replaces them as the progress target. The slip log has an optional
  trigger (Stress, Boredom, Tired, ...) and note; the most common trigger is shown from
  2 slips on.
- **Tone: blunt, by request** (Chris prefers harsh and to the point). Each card has a
  motivation line (`pushLine()` in `streaks.js`, bold, picked by where the current run is:
  day zero, under 7, under 30, 30+; steady for the day, changes day to day) and logging a
  slip says it straight ("10 days, thrown away. Your best run stands, so beat it. Day zero
  starts now. Do not make it two."). The slip form asks "What set it off, and what will you
  do differently?". It is harsh about the *next decision*, never about who he is: keep it
  that way. The collapsed "If it gets hard" has only a short craving tip. **No helpline
  numbers and no medical/withdrawal note**: both were added and then removed at Chris's
  request, so don't add them back.
- **Privacy (deliberate, keep it):**
  - RLS own-rows for signed-in users, anon and **service_role have no access**, so the
    notification and sync Edge Functions can't read these tables. `life-push` never mentions
    them (a test greps its source), so no push ever names a quit.
  - Each quit can be **hidden from Today** (`show_today`) or shown there under another word
    (`alias`, e.g. "Habit A"). Today never shows the real name when an alias is set.
  - `sw.js` **never caches** the `quits` / `quit_slips` requests, so nothing about them is
    kept offline on the device (the rest of the app is). Offline, the Giving up screen and
    Today's panel simply don't load.
  - Not in Journal, reviews, exports, Events or the morning brief.
- **Future start date:** the Start date can be tomorrow or later (no schema change, `started_on`
  is just a date). `streakInfo` returns `upcoming` (days until it starts) and zeros while the date
  is in the future; the card shows "Starts tomorrow / in N days" with no craving or slip buttons
  (nothing to slip against), and Today shows "Starts tomorrow" under the alias. On the start date it
  becomes day zero and counts normally. Slips are still limited to start date through today.
- **Breaks and trips don't pause it:** the counter just keeps counting real days; it has no
  nudges to pause.
- **Stop tracking** archives (kept, restorable); **Delete** needs a second confirming click
  and removes the quit and all its slips (`quit_slips.quit_id` cascades).
- `sw.js` `VERSION` is `v4` (added `js/views/quit.js` and `js/streaks.js`).

## Giving up, part two and other additions (2026-11-21)

- **Sunday verdict** (`js/verdict.js`, shown on Week and at the top of a week's review):
  `weekVerdict()` grades the share of commitments kept (A 90, B 75, C 60, D 40, else F;
  monthly commitments ignored), names the weakest commitment and the goal losing most
  ground, and gives one "Fix this" line. Final once the week is over or on Sunday,
  otherwise "So far". Away weeks show a plain away panel, empty weeks say so.
- **Craving timer + if-then plans** (`views/quit.js`): 20-minute timer; only `{id, at,
  trigger}` is kept in localStorage (`life-craving`) so it survives a reload. "I held" /
  "I slipped" write `life.quit_cravings`; slipped opens the slip form with the trigger
  filled in. If-then plans live in `quits.plans` (jsonb, one line per trigger) and show
  when that trigger is picked. Slips also record `slip_part` (time of day).
- **Slip patterns** (`streaks.js` `slipPatterns`): weekday and time-of-day bars (need 3+
  slips, a standout needs a single winner with 2+), plus Garmin sleep/HRV on slip days vs
  other days (3+ slip days, 7+ other days).
- **App lock** (`js/lock.js`): PIN hashed with PBKDF2-SHA256 (150k) in localStorage on
  this device only (`life-lock*`). Scope is the whole app or just Giving up; an
  away-minutes setting; escalating delay after 5 wrong PINs; sign-out clears it, and
  "Forgot PIN" signs out and clears offline data. **A screen lock, not encryption.**
  With the private scope Today doesn't even fetch quits while locked.
- **Biometric unlock** (`lock.js`, Settings → App lock): optional on top of the PIN, per device.
  WebAuthn platform authenticator (`userVerification: 'required'`, `rpId` = hostname); only the
  credential id is stored in the `life-lock` config (`bio`). The device does the face/finger
  match and the app only learns it succeeded, so it is still a screen lock, not encryption.
  The PIN always works; turning the lock off or signing out removes it. Tested with Chromium's
  virtual authenticator (`WebAuthn.addVirtualAuthenticator`); needs a secure context.
- **Today on a trip** (`js/trip.js`, pure `js/tripmatch.js`): shows your USA trip plan for today
  (stay, flights, items) via the signed-in session. **Thailand is deliberately not read** — that
  trip is isolated from this app (removed 2026-11-21); don't reconnect it. Panels never throw.
- **Training depth**: Edale countdown (`js/training.js`, from the plan's end date), weekly
  running miles vs plan (Garmin `garmin_activities`), plan weight targets on the Progress
  chart, and a **Niggles** tab (`life.niggles`, severity 1-5, history log, resolve, "back
  again"; `js/niggle.js` gives stop/book/watch advice and Today nudges).
- **Backup** (`js/backup.js`, Settings): downloads/shares one JSON of every life table and
  the fitness tables the app owns. Excludes push subscriptions and Hevy/Garmin mirrors.
  Giving-up tables only if "Include Giving up" is ticked. Today nudges after 30 days
  (`settings.last_backup`, falling back to `backup_started`).
- Migration `20261121150000_life_craving_niggles.sql`: `quits.plans`,
  `quit_slips.slip_part`, `quit_cravings`, `niggles`; own-row RLS, authenticated only.
  `sw.js` never caches `quit_cravings` either. `sw.js` `VERSION` is `v11`. **Updates:** there is no "update bar" in this app (that is the Thailand app's). Files are network-first so each open fetches fresh; `pwa.js` reloads once on `controllerchange`, and Settings → App version shows `BUILD` with a "Get the latest version" button (`refreshApp()`: compares `BUILD` with the server's `js/pwa.js`; if newer, asks the worker to update, re-fetches every file in `sw.js` `FILES` with `cache: 'reload'`, then reloads; if already latest it just says so. **Never unregister the worker there**: without it the reload is served from the browser's HTTP/memory cache (GitHub Pages: `max-age=600`) and comes back on the old version, which is exactly how the button "did nothing" before 2026-11-27). Bump `BUILD` in `pwa.js` and `VERSION` in `sw.js` together each release.

## Readiness, body patterns and habits vs sleep (2026-11-27)

- **Readiness** (`js/readiness.js`, pure): Today's Recovery panel opens with a score (0-100) and a
  verdict, Push / Normal / Easy. Last night's sleep, overnight HRV, resting heart rate and yesterday's
  average stress are each compared with the 28 days before (z-score against your own mean, spread
  floored so a steady baseline doesn't exaggerate; stress and resting HR count the other way). A metric
  needs 7+ baseline days, the verdict needs 2+ metrics, otherwise nothing shows. Push is average z >= 0.5,
  Easy <= -0.75. `loadRecovery(date, sessions)` now reads 28 days (the "7-day average" figures still use
  the last week only). With a hard planned session (`isHardSession`: lift, run, race, hike_or_run, not
  optional) on an Easy day the advice points at "Swap with another day" on Today. **Our own estimate,
  not Garmin's** (its readiness isn't in the Personal API), the panel says so. Thresholds are untuned guesses
  from synthetic data: tweak `readiness()` once there are real weeks to compare against.
- **Slip patterns** (`streaks.js slipPatterns(..., days)`): alongside sleep/HRV it now compares stress
  on the day before slips and resting HR on slip days with other days (`garmin_days`, read in
  `views/quit.js`; same 3+ slip days / 7+ other days rule, small-sample warning).
- **Habits and sleep** (`js/insights.js`, Health -> Progress): per habit, % done after a night at or above
  your median vs below it. Needs 14+ nights of sleep and 6+ in each half. Describes, never explains.
- Not tested against a real account, only synthetic data in Node; screens untested in a browser.
  `sw.js` `VERSION` is `v13`, `BUILD` `2026-11-27c`.

## Wrapped (2026-11-27)

`#/wrapped` (Life menu): the year as swipeable cards (CSS scroll-snap, dots, light/dark via the theme
tokens). `js/wrappedStats.js` is pure (rows in, cards out; a card only exists when there is something to
say, so a thin year is a short Wrapped), `js/views/wrapped.js` loads and draws. Year switcher: this year
and last.

- **Deliberately looks back before the fresh start (Chris chose this).** It reads `garmin_activities`,
  `garmin_days`, `garmin_sleep`, `hevy_workouts` and `hevy_sets` straight from 1 January through its own
  paged queries, *not* the floored helpers in `fit/garmin.js` / `fit/db.js` (those floor to `LIFE_START`
  and would give an almost empty year). **This is the only screen that does that**: do not move the
  bypass into the shared helpers.
- **Only device mirrors.** No tasks, goals, habits, journal or Giving up, with one exception: an opt-in
  checkbox on the screen (off by default, remembered in `localStorage` `life-wrapped-quit`) adds a single
  anonymous card, the longest current run in days across live quits, never a name. It is skipped while the
  private lock is on (`privateBlocked()`).
- Cards: activities and hours, climbing (if 100 m+), busiest month/weekday and longest active streak,
  miles run, longest run (and quickest 5 km+), Hevy sessions and favourite lift, tonnes lifted (1 t+) and
  heaviest set, average sleep and best night (needs 14+ nights), steps (14+ days), resting HR first vs last
  30 days (60+ days).
- Tested: `wrappedStats` with a synthetic year in Node (rows from the previous year are excluded), the card
  layout in Chromium at 390 px in light and dark. **Not tested:** loading real rows, or the screen inside
  the app. `sw.js` `VERSION` is `v16`, `BUILD` `2026-11-27f`. The card strip is `.wstrip`, **not** `.wrap`: `.top .wrap` is the header's container and the menu dropdown is positioned inside it, so a global `.wrap` rule with `overflow-x: auto` clipped the menu (fixed 2026-11-27).

## Load spikes, readiness history, mood, tests (2026-11-27)

- **Running-load warning** (`js/loadspike.js`, pure): the last 7 days of running km against the average of up
  to four earlier 7-day blocks. +30% warns, +50% is the amber "high" nudge on Today (under the niggle
  nudges). A block counts only if all of it is on or after the fresh-start floor (`since` = `LIFE_START`), it
  needs 2+ full blocks and a baseline of 8+ km a week, so it stays silent for the first couple of weeks
  and never reads pre-start data. Runs only. It is a nudge: the text says the plan may have asked for it.
- **Readiness history** (`readinessHistory()` in `readiness.js`, panel from `insights.js`, Health -> Progress): the
  score for every day in the span, computed on the fly from Garmin (**nothing is stored**), as a dot chart with a
  7-day line, Push / Normal / Easy counts, and how often you trained on each kind of day. It needs 7+ scored days.
- **Mood and energy** (`life.daily_mood`, migration `20261127120000_life_daily_mood.sql`, applied; one row per user
  per day, own-row RLS, authenticated only): two 1-5 tap rows on Today, tap again to clear, saved with
  `store.upsertOn('daily_mood', ..., 'user_id,mood_date')`. "Mood and sleep" on Progress compares them after
  nights at or above your median vs below (`moodLinks()` in `insightsStats.js`; 14+ days, 6+ per half).
  Included in the backup (`LIFE_TABLES`). Not private-by-design like Giving up: it is cached offline like the
  rest.
- **`insightsStats.js`** now holds the pure calculations for the habits-vs-sleep and mood-vs-sleep panels;
  `insights.js` only loads rows and draws.
- **Tests** (`life/tests/*.test.mjs`, Node's built-in runner, no package.json): `node --test "life/tests/*.test.mjs"`
  from the repo root (quote the glob; Node 22 treats a bare directory as a file). They cover the pure modules only
  (readiness, loadspike, insightsStats, streaks incl. slip patterns, wrappedStats, verdict, niggle, start).
  Anything that imports Supabase or touches the DOM can't run there. **When you add logic, put it in a pure module and
  add a test**; two bugs this month (a unit slip in the habits panel, a clashing CSS class) lived in untested code.
  The tests were mutation-checked (breaking a threshold, a unit and a verdict boundary fails them).
- `sw.js` `VERSION` is `v17`, `BUILD` `2026-11-27g`.

## Menu (2026-11-21)

Thirteen sections no longer fit a scrolling tab strip, so navigation is a **☰ menu** in the header
(`#menuBtn` opens `#tabs`, a dropdown of collapsible groups (`<details>`): Daily / Goals and growth / Life open to show their sections, the group holding the current section starts open; Giving up and Settings are single-item groups so they are plain links; the
current section's name sits next to "Life" as `#here`). `MENU` in `main.js` defines the groups; the
routing list `TABS` is unchanged. Closes on a choice, Escape or a tap outside. Tests must wait for
`#tabs a` with `state: 'attached'` because the menu is hidden until opened.

## Fresh start: Life begins 28 Nov 2026 (set 2026-11-27)

Life is a new plan that begins on **28 November 2026** (it was first set to 30 Nov and brought forward; the Edale plan itself still starts 30 Nov), with no reference to anything earlier.
It also replaced the Goals and Fitness apps (retired the same day).

- **One constant:** `LIFE_START` in `js/start.js` (and the same date in
  `supabase/functions/life-push`). Change both together.
- **Before the start:** every screen except Settings shows a "Life starts on <date>"
  holding screen with a day count; nothing is fetched or written, and `life-push` sends nothing
  (the cron call returns `before the start date`).
- **After the start:** history reads are floored to the start (`floorDate` / `floorIso`) so
  nothing earlier is shown: weigh-ins and day checks (`fit/db.js`), Hevy sets and workouts,
  Garmin ranges (`fit/garmin.js`, `training.js`, the sleep comparison), weekly check-ins (by
  `created_at`), Health's Progress chart and day/week pages, and Week can't step back before the
  week containing the start. `dueReviews()` and the Sunday evening push ignores any period starting before the start, so there is no
  review prompt for the week before. Goal and Giving up start dates can't be earlier either.
- **Existing data was archived, not deleted:** migration `20261127120000_life_fresh_start.sql`
  copied every user-data row into the private schema **`life_archive`** (RLS on, no policies, no
  grants, not exposed; readable only with the database owner's rights), then emptied the `life`
  tables. Settings keep Garmin and device prefs; `breaks`, `away`, `backup_started` and
  `last_backup` were removed. To look at the old rows: `select * from life_archive.goals` in
  the SQL editor. To delete them for good, drop the schema (ask first; it is irreversible).
- **Fitness rows before the start** (weigh-ins, Hevy, Garmin) are still in `fitness.*`, just
  never shown. The Edale plan starts on 30 Nov, so Health shows no plan days for the first two.
- **Retired apps:** `/goals/` and `/fitness/` are now redirect pages to Life (the Fitness one
  also keeps its manifest and icons and ships a service worker that clears its old caches and
  unregisters itself, so an installed home-screen icon lands in Life). The `fitness` schema, the
  Garmin/Hevy Edge Functions and their cron stay: they are Life's backend. The old app code is in
  git history before commit `1dd90dc`; its backend notes moved to `docs/fitness-backend.md`, its plan
  seed data and importers to `supabase/seed/fitness/`. "Import from Goals" and the "Other apps"
  panel are gone.
- **Testing:** the suites run against a copy of `life/` whose `start.js` says 2000-01-01
  (otherwise everything is a holding screen until the start); the gate and the floors are tested
  separately against the real file, with a fixed clock for the "after" half.

## Not built yet

(The day swap is on both Today and Health → Day: `fit/day.js` shows it in compact and full mode.)

Fitness's Block 2 history views (pre-Edale meal templates), Goals' search and the old
Goals reviews archive (new reviews start fresh here), and offline *writing* (offline is read-only by design).

## Testing

Pure logic has checked-in unit tests (`life/tests`, see above). For screens, no browser test files are checked in. Approach used: serve the repo with `python3 -m http.server`,
drive Chromium with Playwright, seed `localStorage` `cm-apps-auth` with a fake session,
and answer `*.supabase.co` requests from an in-memory PostgREST stand-in built from
`fitness/data/*.json` (the CDN script is served from a local `npm` copy). Offline: register the service worker on localhost, set
`PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` (or the worker's own fetches bypass the
mock), visit screens, then `context.setOffline(true)` and reload. Headless Chromium always
reports `Notification.permission` as `denied`; override it in an init script to test the
Settings flow. Installability: CDP `Page.getInstallabilityErrors` returned none. **The mock
does not enforce RLS or run the real `get_day_bundle()`**; `life-push` was exercised live
(cron key accepted, wrong key 403, no session 401) but no real device has subscribed yet.
