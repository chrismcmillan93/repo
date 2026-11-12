# Life app (`/life`)

One app for goals, to-dos, lists, career, health and events, served at
`app.chris-mcmillan.co.uk/life/`. Built 2026-11-12/13 to replace `goals/` and `fitness/`
over time; **both of those are untouched and still run**. Same architecture as the other
apps here: plain HTML/CSS/JS ES modules, `@supabase/supabase-js@2` from a CDN `<script>`,
no build step, no framework.

## Data: two schemas, one sign-in

- **`life` schema** (migration `life_schema`): `goals`, `goal_steps`, `commitments`,
  `tasks`, `habits`, `habit_checks`, `journal`, `list_items`, `career_items`, `events`,
  `settings`. Every table has RLS on with one policy, `user_id = auth.uid()` for all
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

## Not built yet

No install-to-home-screen or offline support (no manifest or service worker), no push
notifications (needs a scheduled Edge Function), no weekly/monthly guided review flow, no
Playbook, notes pages or wishlist import from Goals, no Fitness Progress/Check-in/posters
screens, no day-swap control (swaps made in Fitness are respected), and Hevy still syncs
through the existing `hevy-sync` Edge Function.

## Testing

No test files are checked in. Approach used: serve the repo with `python3 -m http.server`,
drive Chromium with Playwright, seed `localStorage` `cm-apps-auth` with a fake session,
and answer `*.supabase.co` requests from an in-memory PostgREST stand-in built from
`fitness/data/*.json` (the CDN script is served from a local `npm` copy). **The mock does
not enforce RLS or run the real `get_day_bundle()`**: not yet tested against the live
database or a real account.
