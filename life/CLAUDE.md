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
- **`goals` schema, read-only**, only for the "Import from the Goals app" button on Goals
  (`store.goalsApp`): copies active goals and their milestones into `life.goals` /
  `life.goal_steps`, skipping any already imported (`source_goal_id`). Run it again any time.
- **Sign-in** is the shared `cm-apps-auth` session (same as Goals and Fitness): signed in
  to one, signed in to all.

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
- **Importer** (`importer.js`, Settings and Goals tabs): goals + milestones, wishlist
  (`list_items.source_id`), notes pages (`notes.source_id`) and Playbook progress from the
  Goals app. Idempotent: skips anything already copied.
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

## Not built yet

Fitness's Block 2 history views (pre-Edale meal templates), Goals' search and the old
Goals reviews archive (new reviews start fresh here), a day-swap control on Today (it's on
Health → Day), and offline *writing* (offline is read-only by design).

## Testing

No test files are checked in. Approach used: serve the repo with `python3 -m http.server`,
drive Chromium with Playwright, seed `localStorage` `cm-apps-auth` with a fake session,
and answer `*.supabase.co` requests from an in-memory PostgREST stand-in built from
`fitness/data/*.json` (the CDN script is served from a local `npm` copy). Offline: register the service worker on localhost, set
`PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` (or the worker's own fetches bypass the
mock), visit screens, then `context.setOffline(true)` and reload. Headless Chromium always
reports `Notification.permission` as `denied`; override it in an init script to test the
Settings flow. Installability: CDP `Page.getInstallabilityErrors` returned none. **The mock
does not enforce RLS or run the real `get_day_bundle()`**; `life-push` was exercised live
(cron key accepted, wrong key 403, no session 401) but no real device has subscribed yet.
