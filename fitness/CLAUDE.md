# Fitness log (`/fitness`)

A single-traveller — well, single-*athlete* — training log, replacing a spreadsheet.
Answers one question at 05:30: what to eat today, what training to do today, and did
yesterday actually happen. Lives entirely under `fitness/`, served at
`app.chris-mcmillan.co.uk/fitness/`. Same "no build step" architecture as `usa/` and
`goals/`: plain HTML/CSS/JS ES modules, `@supabase/supabase-js@2` from a CDN
`<script>` tag, no bundler, no framework.

**Branch:** all work for this app lives on `beta` until Chris says otherwise. Nothing
here merges to `main` on its own.

## Supabase

Project **`dashboards-new`**, ref **`bcrmbuiuekklpocpllpw`**, region eu-west-1 — the
same project as `usa`, `goals` and `thailand_uat`. This app's schema is **`fitness`**
(lowercase). Never touch `public`, `usa`, `goals`, or `thailand_uat` — they belong to
other apps in this repo.

**Migrations only.** All DDL goes through `supabase/migrations/`, applied with the
Supabase MCP `apply_migration` tool. `execute_sql` is for reads and one-off checks
only. RLS is enabled on every table at creation time — see below for the exact shape.
Ran `get_advisors` (security + performance) after every DDL change; the only
remaining findings are: two Phase 2 stub tables correctly flagged as "RLS enabled, no
policy" (intentional, see Phase 2 section below), pre-existing findings in `usa`/
`public` schemas from other apps (out of scope here), and the project-wide "leaked
password protection disabled" note, which affects every app on this project and
wasn't touched since it's not this app's call to make alone.

**One-time manual step (not doable via any MCP tool available to Claude):** the
`fitness` schema must be added to Supabase Dashboard → Project Settings → Data API →
"Exposed schemas" (a comma-separated list — `usa` and `goals` are already in there).
Without this, every PostgREST call scoped to `db: { schema: 'fitness' }` 404s.
**Steps:** open the project in the Supabase dashboard → Project Settings → Data API →
find the "Exposed schemas" field → add `fitness` to the comma-separated list (keep
the existing entries) → Save.

**Auth redirect URL to whitelist:** Authentication → URL Configuration → Redirect URLs
→ add `https://app.chris-mcmillan.co.uk/fitness/` (exact match, trailing slash, same
pattern as the other apps in this project). Auth → Providers → Email should already be
on with Confirm email / magic link enabled by default for a new Supabase project; no
extra toggle needed for this app specifically.

**Chris's `user_id`:** not yet captured. No auth user exists on `dashboards-new` for
this app yet — the brief's own "assume no auth user exists here yet" is still true as
of this build. Once Chris signs in for the first time, run:

```sql
select id, email from auth.users where email = 'info@chris-mcmillan.co.uk';
```

and paste the `id` here so future sessions can seed/query against it directly instead
of looking it up each time.

## Schema

**Plan tables** (read-mostly, edited by hand via SQL — no app UI writes to these):
`blocks`, `block_weeks`, `week_targets`, `meal_templates`, `session_templates`,
`session_exercises`, `run_plan`, `rules`. RLS: `select` for any `authenticated` user,
no write policy at all (writes go through `execute_sql`/the dashboard directly).

Two deviations from the brief's suggested shape, both to support more than one block
ever existing without a schema change later:
- **`meal_templates` and `session_templates` both got a `block_id`** (the brief's
  shape didn't have one). Without it, a future block with a different split or menu
  would have nowhere to attach its own rows.
- **`session_templates` also got a nullable `week_number`** override, the same
  pattern the brief already specified for `meal_templates` (null = the block's
  standing default for that `day_of_week`, a specific week number overrides it for
  that week only). This exists for exactly one case today: **week 8's Sunday is race
  day, not the standing "rest or easy hike"** — there's a `session_templates` row for
  `(block, day_of_week=7, week_number=8)` with `session_type='run'` that
  `get_day_bundle()` prefers over the generic Sunday row. Without this, day 56 of the
  block would show "Rest or easy hike" instead of the race.
- `rules` deliberately has **no `block_id`** — standing rules apply across every
  block, not just this one.
- `session_exercises.order_num` and `rules.order_num` are named `order_num`, not
  `order` — `order` is a reserved word in SQL.

**Logging tables** (what the app writes to): `daily_logs`, `daily_checks`,
`weekly_checkins`. RLS: full CRUD, strictly `user_id = (select auth.uid())`. Built
straight to real per-user ownership from day one — unlike `usa`'s history, this app
never had a transitional "anon full access" phase, so the `anon` key was never
granted schema usage at all.

`daily_checks` got an `updated_at` column + trigger the brief didn't ask for — cheap,
consistent with `daily_logs`, and useful if a future screen wants to show when
something was last ticked.

**Phase 2 stub tables**: `runner_profiles`, `generated_run_plans`. Schema only, per
the brief. RLS is enabled with **no policies at all** — not even a read policy —
since there's no public-facing form yet to decide sensible access rules for; this
shows up in `get_advisors` as an expected "RLS enabled, no policy exists" finding.
See "Phase 2" below for the intended shape once that lands.

**`fitness.get_day_bundle(p_date date) returns jsonb`** — the one-round-trip helper
for the Today screen. Given a date, works out which block/week it falls in, derives
the day type from that day's `session_templates` row (`upper`/`lower` → `lift`,
`run` → `run`, `rest` → `rest` — including the week-8-Sunday override above), then
returns that week's nutrition target, the day's meals (respecting the same
null-vs-specific-week-number override rule as sessions), the session with its
exercises, today's run prescription if the day type is `run`, the standing rules, and
the signed-in user's own `daily_logs`/`daily_checks` state for that date — all in one
call instead of six-plus sequential queries. Runs `security invoker` (the default),
not `security definer`: nothing here needs to cross an RLS boundary the way
`usa.trip_has_shared_leg` does, since none of these tables' policies query each other
back in a cycle, so there's no need for a definer function's RLS-bypass trick.

Nothing else in the app needed a dedicated RPC — the Plan/Progress/Week/Check-in
screens each fetch a handful of small, whole tables (8 weeks, ~24 targets, ~15 meal
rows, 8 sessions, 11 exercises, 25 run-plan rows, 6 rules — nothing here is large)
and join them client-side, which is simpler than adding more bespoke functions for
data this size.

## Seed data — Block 2, Continued Cut

Transcribed from the brief exactly, with these interpretive additions (nothing here
was specified, so these are this build's own calls):
- `block_weeks.focus` set to `'Down week'` for week 4 and `'Race week — 10K on the
  Sunday, 11:10am start'` for week 8; every other week's focus is `null`.
- Nutrition targets are the brief's own placeholder (2,080 kcal / 200g protein for
  lift days, 1,750 / 175g for run and rest days), seeded individually per week (24
  rows: 8 weeks × 3 day types) so any single week is editable later without touching
  the rest — this is what the brief asked for, not an addition.

**To update the nutrition targets once Chris has weighed in** (adjust the numbers,
run once per day_type/week combination that needs to change — or drop the `and
week_number = ...` clause to apply the same new numbers to every remaining week):

```sql
update fitness.week_targets
set kcal_target = 2000, protein_floor_g = 190      -- new numbers
where block_id = (select id from fitness.blocks where name = 'Block 2 — Continued Cut')
  and day_type = 'lift'                             -- 'lift' | 'run' | 'rest'
  and week_number >= 3;                             -- or a specific week_number = 3
```

## Training is tracked per session, not per exercise

Lift days (`upper`/`lower`) show a single "Mark session done" tick — `item_id`
`session:${session_type}`, the same shape run and rest days already used
(`session:run`, `session:rest`). This app tracks "did the session happen", not
set-by-set completion — it isn't a workout tracker. (Earlier drafts of this build
ticked each exercise individually with `item_id`s like `exercise:upper:1`; that
scheme is gone — nothing in production ever wrote one of those rows, so there was
nothing to migrate.)

**Today shows no exercise detail at all now** — just the session title, its summary,
and the one tick. The individual `session_exercises` briefly appeared as a plain
reference list under the tick (name + prescription, no checkbox) but were removed
outright: Chris doesn't want to see them on the daily screen, high-level is enough.
`session_exercises` is still seeded and still queried by `get_day_bundle()` (cheap,
and Plan still reads it directly itself), it's just not rendered by `today.js`
anymore. **Plan's "Training split" section still lists exercises** (name +
prescription) as the one place meant to document the full written prescription —
that wasn't touched, since the request was specifically about the daily view, not
the block-level reference. Worth confirming with Chris if he'd rather that gone too.

## Progress: day-by-day history and streaks

Progress has a calendar-style "Day by day" grid (Monday-start, one column per
weekday, one row per week of the block) alongside the existing weight chart and
weekly adherence bars. Each day is one chip split top/bottom — nutrition on top,
training on the bottom — coloured sage/amber/rust/muted for yes/partial/no/not
logged, so which specific days were and weren't stuck to is visible at a glance
rather than only as a weekly proportion. Tapping a day jumps to Today for that
date, same interaction as the Week screen's day tiles. Days outside the block, or
after today, render as empty unclickable placeholders (padding to a full week at
each end, not real data).

**Streaks are per-category and mean "stuck to", not "logged something."** Two
separate counters — nutrition and training — each count consecutive days ending
today with that field exactly `'yes'`; a `'partial'`, a `'no'`, or a day with no log
at all breaks it. This replaced an earlier single combined streak that counted a day
if *either* field was set to anything, which conflated "I logged" with "I stuck to
it" — not what a streak should mean here. The separate `days logged` count (any
status set, either field) is kept alongside them for the "did I even engage today"
signal, which is a different, still-useful question from either streak.

**Edge case this surfaced and fixed:** the whole Progress screen computes an
`endDate` capped at today so the grid/chart never pad into the future. That capping
only handled *today past the block's end* — viewing Progress on or before the
block's own first day (`todayStr() < block.start_date`, which is literally true
during this build, one day before Block 2 starts) produced an *inverted* range
(`endDate < startDate`), which silently made every date range in the screen empty.
Fixed by also flooring `endDate` at `block.start_date`.

## A real bug: "can't see any of the plan"

First live report from Chris. Root cause: he opened the app on Sunday 13 Sep, the day
*before* Block 2 starts (Monday 14 Sep). Today's `▶` (next day) button was capped at
`endOfWeek(todayStr())` — the end of the *current real-world calendar week* — so that
Sunday, being the last day of its own week, meant `▶` was already disabled at the
point of first load. There was no way to click forward into Monday, where the actual
content lives — from his side this looked exactly like "the plan" not existing at
all, not like a navigation limit.

Fixed by dropping the "current week" ceiling entirely: Today's date nav is now
bounded only by the block's own `start_date`/`end_date`, scrolling freely through the
whole block in both directions. This also directly satisfies the follow-up request
("scroll through the days, previous and upcoming") — the two were really the same
ask. Along with this, `state.currentBlock` (used only for these nav bounds) is now
populated via `db.blocks.getLatest()` instead of `db.blocks.getCurrent(state.currentDate)`
— the latter returns `null` whenever the *viewed* date happens to fall outside the
block, which is exactly the day this bug was reported on, so the bounds were silently
unset (`!minDate` / `!maxDate` both true) rather than correctly tied to the real block.

## Week: shows food and training, and pages through the block

Originally Week only showed each day's session *title* and a same-day adherence dot
— no calorie/protein target, no run distance, and no way to look at any week except
whichever one `state.currentDate` happened to be in. Reworked per request ("see a
week view of food and training plus scroll through the days") to show, per day: the
training line (session title, with the actual distance appended for a run day rather
than just "Run — easy" with no number) and the food line (that day type's
`kcal_target`/`protein_floor_g` for the specific week being viewed, not a generic
figure). Added its own prev/next week nav (same `.date-nav` markup/styling Today
uses), bounded to the block's start/end the same way Today's day nav is. Tapping a
day still opens it in Today, unchanged.

Session/target/run lookups are only attempted for a date that's actually
`>= block.start_date && <= block.end_date` (`inBlock()`) — paging Week to a week
that straddles or sits outside the block no longer risks matching the wrong week's
override rows or a stray `week_number: null` fallback for a day that isn't really in
the block at all.

**Follow-up: the food line (just kcal/protein) wasn't enough — "I should be able to
see my meals planned out too."** Each day now also lists the actual `meal_templates`
rows for that day type underneath the tappable summary (time + name, e.g. "07:30 6
eggs + 2 bananas") — read-only, no ticking, since Today already owns that. Kept the
kcal/protein line too rather than replacing it; it's still the faster thing to scan.
`mealsForDay()` applies the same "a week-specific row beats the generic
`week_number: null` one for the same `slot_order`" precedence `get_day_bundle()`
already uses for Today, even though nothing in the seed data actually exercises an
override yet. This makes Week considerably longer (7 days × up to 5 meals each) —
accepted tradeoff for a personal reference screen; scrolling is fine here.

## Plan's Training split now resolves sessions, not lists raw rows

Original version rendered the 7 standing (`week_number: null`) `session_templates`
rows once, then a separate "Week-specific changes" list underneath for any override
rows (just the one, week 8's Sunday race). Reported as wrong: it needed to resolve,
per week, the way `get_day_bundle()` and Week's `sessionFor()` already do — an
override row for that exact `week_number` wins if one exists, otherwise the standing
default — and render week-by-week, day-by-day, **one row per day**, not the raw
table contents.

`resolveSession(dow, weekNumber, sessions)` in `plan.js` now applies that precedence
explicitly for every `(week, day_of_week)` pair across all 8 weeks (56 total), and
`resolveRun(dow, weekNumber, runPlan)` joins `run_plan` on the *same* `week_number` +
`day_of_week` so a run day's distance/effort/detail is that week's real prescription
— important since the session template's own title ("Run — easy") never carried a
number, and a naive join risked pulling any week's run_plan row rather than the one
matching the week actually being rendered. `weekTrainingHtml()` groups the 7 resolved
days under each week's own heading. Verified explicitly with a Playwright suite built
around week 8's override (its Sunday must show only the race, never the race *and*
"Rest or easy hike" side by side) and cross-week run figures (week 3's Thursday
interval session must show 3×1km, never week 1's plain 8km long run) — 9 checks, plus
all 45 earlier checks re-run clean.

Same tradeoff as Week's meal list: this makes Training split considerably longer (56
day-rows instead of 8) — accepted for a personal reference screen.

## Schema drift: the DB has moved ahead of what this file describes

As of 2026-09-16, the live schema has real content this file doesn't describe, added
by another session directly against the database rather than through a session that
updated this repo:
- **The training plan itself has changed.** Monday now pairs Upper lift with an
  evening interval run (`session_templates.title` "Upper lift + Intervals (PM)");
  Thursday pairs Muay Thai with the long run; tempo moved to Saturday; `run_plan`'s
  actual weekly distances/efforts no longer match the "Seed data" section above. This
  isn't a problem for the app itself — `resolveSession()`/`resolveRun()` (Plan),
  `sessionFor()`/`runFor()` (Week) and `get_day_bundle()` (Today) all resolve
  generically by `(week_number, day_of_week)` with no hardcoded assumption about
  which day is a lift/run/rest day, so they render whatever's actually in the tables
  correctly. But **the "Seed data" section above is now stale as documentation** —
  don't trust its specific numbers, query `fitness.run_plan`/`fitness.session_templates`
  directly instead. Not re-synced here; out of scope for whatever prompted this note.
- **Two more untracked migrations exist upstream**: `move_thursday_intervals_to_monday`
  (fitness — presumably the change above) and `fix_pending_reviews_respect_goal_start`
  (goals schema, unrelated app). Neither has a matching file in `supabase/migrations/`
  — reconstructing exact DML from the live end-state alone was judged too much
  guesswork to be worth it (unlike a CREATE TABLE, an UPDATE's exact predicate isn't
  recoverable from inspecting the result). **The migrations folder is not a complete
  history of this schema** — treat the live DB via `list_tables`/`execute_sql` as the
  source of truth when they disagree, not just this file or the migration folder.

## "This week": prep tasks and shopping list

Two more tables — `prep_tasks`/`prep_checks`, `shopping_list_items`/`shopping_checks`
— already existed in the live schema before this feature was built (added earlier the
same day, outside this repo's migration history — see "Schema drift" above;
`add_prep_and_shopping_tables` and `allow_flexible_prep_days_v2` are reconstructed
from the live schema, not the original migration text). **The actual bug blocking the
feature**: `authenticated` had no `GRANT` on any of the four tables — RLS policies
existed and looked correct, but PostgREST needs both, and only `postgres` had table
privileges. `fitness_prep_and_shopping_grants_and_indexes` fixes that (plus the usual
`(select auth.uid())` RLS perf tweak and covering indexes for the four FKs the linter
flagged), and is the one migration in this feature that's actually mine end to end.

Rendered as two new sections on **Week**, visible only when viewing the real current
week (`startOfWeek(todayStr())`) — paging to another week hides them; there's nothing
"this week" about a shopping list for a week five weeks from now.

- **Prep tasks**, grouped by day-*set*, not by individual day. `prep_tasks.prep_day_of_week`
  is an **array** — a task valid on more than one day (e.g. `[3, 4]`) is one prep
  session that can happen on either day, not two separate ones, so `groupPrepTasksByDaySet()`
  groups by the whole array and renders **one row under one combined heading**
  ("Wednesday or Thursday"), ordered by the group's earliest day. First shipped
  showing the task once per day in its array (so `[3, 4]` appeared under both a
  "Wednesday" heading and a separate "Thursday" heading, each showing the same task)
  — reported as wrong, since it read as two things to do instead of one flexible
  slot; fixed to the current one-row-one-combined-heading shape. `covers_day_of_week`
  (which day's meals the task is actually *for*, independent of which day(s) it's
  valid to prep on) isn't shown separately in the UI — it's already legible from the
  task's own title ("Thu — lunch + tea").
- **Shopping list**, grouped by category. Category order follows first-appearance in
  the `sort_order`-ordered item list (protein, carbs, veg, …, as actually written),
  not alphabetical.

**Wording: "dinner" is "tea" here — North England.** Renamed everywhere it appeared
in plan content: `prep_tasks.title` ("lunch + dinner" → "lunch + tea"),
`shopping_list_items.item`/`notes`, and every `prep_tasks.description` (data edits via
SQL — `fitness_prep_tasks_dinner_to_tea` — not app code, since this is plan content
Chris edits directly, same as everything else in this section). "Lunch" is unchanged;
only the evening meal got renamed.

Each prep task's description also now has a real line break between its "Lunch:" and
"Tea:" halves — they used to run together as one sentence ("...cooked peppers/tomato.
Tea: 300g protein..."), reported as needing to read on its own line. The newline is a
literal `\n` character in the stored `description` text (not markup), which needed
`.tick-notes { white-space: pre-line }` in `styles.css` to actually render as a line
break — HTML collapses a bare `\n` to a space otherwise. This is the first `.tick-notes`
content with a newline in it; if a future one uses `<br>` or markdown instead, it won't
render as such here on purpose — plain text with `pre-line` is the whole mechanism.
- Both reuse Today's `.tick-row`/`.tick-box`/`.tick-status` markup and CSS as-is —
  no new checkbox styling — and the same offline-queue-backed save path
  (`renderStatusPill` was pulled out of `today.js` into `utils.js` so both views share
  one implementation instead of two copies). `main.js`'s `REPLAYERS` map gained
  `prep_check`/`shopping_check` entries so queued ticks still retry after a reload.
- Checked state is keyed by `(user_id, week_start_date, task_id/item_id)` —
  `week_start_date` is always the Monday of the *real* current week
  (`startOfWeek(todayStr())`), computed fresh, not carried over from whatever date
  Today was last viewing. A new week means a blank slate: no explicit "reset" logic
  anywhere, a fresh `week_start_date` just has no rows yet.
- The four new fetches are individually `.catch(() => [])`'d in Week's `Promise.all`,
  not left to reject the whole batch — a prep/shopping load failure degrades to an
  empty section rather than taking down the day list and adherence stats above it,
  which don't depend on them at all.

## Design

Ground rule: this is a private log opened half-asleep at 05:30, not a product — no
marketing copy, no feature grid, no hero section.

**Palette** (dark — justified below, not a default): `--ink #11151c` (predawn
navy-charcoal background, not neutral near-black), `--panel #1a212c` (elevated
surface), `--paper #eef0f4` (chalk-white text), `--dawn #f2a154` (the one bold
accent), `--sage #6fb98f` (affirmative — "yes", ticks, protein past its floor),
`--slate #7c8797` / `#8b95a5` (secondary text, hairlines). `--amber` and `--rust`
round out the status-button palette (partial / no, and "over the calorie target").
**Dawn is spent in exactly one place** — the Today fuel bars and primary buttons —
because that's the number actually read in the dark at 05:30; everything else stays
quiet. The concept: dawn-gold is literally the sunrise being earned by getting up at
this hour, not a generic warm accent — chosen specifically to avoid reading as the
terracotta/vermilion accent that's become an AI-generated-page tell.

**Type:** Big Shoulders Display (scoreboard-condensed, used for the date, fuel
numbers, weight figure — the things that need to read at a glance in low light) paired
with Work Sans for everything else (body copy, labels, buttons).

**Layout:** mobile-first single column, bottom tab bar (thumb-reachable one-handed;
promoted to a top bar at ≥720px since the ergonomic reason for it goes away on a
desktop-sized screen). Flat panels separated by hairlines, no drop shadows, no
identically-rounded card grid.

**The one bold treatment — fuel bars:** kcal is a ceiling (`week_targets.kcal_target`)
so going over renders in the caution colour (`--rust`); protein is a floor
(`protein_floor_g`) so going over still renders as a win (`--sage`). The bar's track
width always represents `max(target × 1.25, consumed)`, so going over target widens
the visible scale rather than clipping — the target notch slides left to mark exactly
where it was, instead of the bar just hitting 100% and stopping.

**A real bug this design caught in review:** `.auth-screen` and `#appShell` both set
`display: flex` unconditionally. A class selector and an ID selector both beat the
browser's own `[hidden] { display: none }` UA rule on specificity, so toggling the
`hidden` *property* in JS (which is the documented right way to do it) did nothing —
both screens rendered stacked on top of each other regardless of sign-in state. Fixed
with one defensive rule at the top of `styles.css`: `[hidden] { display: none
!important; }`. Worth remembering for any future screen added to this app that sets
its own unconditional `display`.

## Testing

Per the agreed plan, sign-in was never tested end-to-end — there's no way to fetch a
real magic-link email from this environment. Instead, everything downstream of
sign-in was verified with Playwright against the real app code and the real
`supabase-js` client, with only network responses faked: a plausible, non-expired
session is written straight into `localStorage` under the `fitness-auth` key before
the page loads (bypassing `requestSignIn`/`verifyCode` entirely — those two functions
were never exercised by any test), and `page.route()` intercepts REST/RPC calls with
fixture data shaped exactly like `get_day_bundle()`'s real output. This confirmed,
against the actual rendering and save code paths: correct rendering for lift/run/rest
day types; ticking a meal updates the running kcal/protein total live and fires the
right `daily_checks` upsert; the notes textarea survives an unrelated tick (proving
the "never wipe notes on a re-render" rule — Today only re-renders wholesale on date
navigation, everything else patches the DOM in place); notes autosave and the review
status buttons write the correct values; and ticks/notes/weight/status all come back
correctly from a **hard reload** against the mocked backend, not just surviving
in-page. The CDN's real supabase-js bundle couldn't be fetched from this sandbox
(egress policy blocks `cdn.jsdelivr.net`), so the same package version was pulled via
the npm registry instead (which is allowlisted) and served locally to the test's
browser context — the app's own `index.html` is untouched and still points at the
real CDN for production. None of this test scaffolding is checked into the repo.

**Chris still needs to verify the actual magic-link email end to end** — request a
link, receive it at `info@chris-mcmillan.co.uk`, click it, confirm it lands back on
`/fitness/` signed in.

## Phase 2 — public running-plan generator (schema only, no UI)

`runner_profiles` (nullable `user_id`, so an anonymous visitor can use it without an
account) and `generated_run_plans` exist now so this can bolt on later without a
migration. Intended flow, not built: a public, unauthenticated form collects age,
sex, current weekly mileage, longest recent run, goal distance, goal date and days
per week into `runner_profiles`; a simple week-by-week generator (no periodisation
model, no VDOT tables — brief is explicit about this) writes the result into
`generated_run_plans.plan_json` and hands the visitor a link back to it, keyed by the
row's own `id` rather than `auth.uid()` since there's no login in this flow.

**TODO: Phase 2** — before building the UI: decide the RLS shape (an anon `insert`
policy on `runner_profiles` scoped somehow to stop one visitor reading another's
profile — `id`-keyed bearer-link access rather than `auth.uid()`, since there's no
session), pick the actual plan-generation logic, and only then remove the "no
policies" comment above and grant `anon` whatever it specifically needs.

## Meal macros: kcal/protein/carbs/fat everywhere, and Plan's day-type tabs

`meal_templates` gained `carbs_g`/`fat_g` columns (numeric, backfilled for all 15
existing rows) — added directly against the DB, outside this repo's migration
history (see "Schema drift" above; reconstructed as `add_macros_to_meal_templates`).
The table already had `kcal`/`protein_g`. This wasn't itself a gap: `db.js`'s
`mealTemplates.list()` uses `select('*')`, so the new columns flowed through to Plan
automatically. **`get_day_bundle()` didn't**, and this was the actual bug: it builds
its meal JSON with an explicit `jsonb_build_object(...)` naming each field, so
`carbs_g`/`fat_g` were silently dropped from every Today response until
`fitness_get_day_bundle_add_carbs_fat` added them to that object. Worth remembering
for any future column added to a table this function reads from — `select('*')`
call sites pick it up for free, `get_day_bundle()` needs the field added by hand.

**Today's meal cards** now show all four macros with identical visual weight in one
line ("100 kcal · 0g protein · 24g carbs · 0g fat") — no macro is emphasised over
another, per the brief. **Fuel today** gained Carbs/Fat rows below the existing
Calories/Protein bars, but as a plain running total (`fuelStatHtml()`), not a
target-vs-consumed bar like kcal/protein: `week_targets` has no carbs/fat target
columns, and the brief was explicit that no schema changes should go beyond what was
already applied, so there's nothing to draw a bar against without inventing a fake
target. Reuses the existing `.fuel-row`/`.fuel-row-head`/`.fuel-label`/`.fuel-figure`
styling, just omitting the `.fuel-track` bar markup for these two rows.

**Plan's "Meal templates" section** was a long scroll through three stacked tables
(lift/run/rest, one after another). Replaced with a **Lift / Run / Rest segmented
tab control** (`.segmented`/`.segmented-btn`) showing one table at a time. Deliberately
a new, neutral component rather than reusing `.status-btn`'s yes/partial/no colouring
— which day type is showing isn't a value judgement, so the active tab just gets the
one `--dawn` accent, same as everywhere else dawn is spent. Selected tab is held in a
module-level `let activeMealTab` in `plan.js`, not `state.js` or the DB — purely "which
tab is open right now," explicitly not worth persisting across sessions per the brief;
resets to `lift` on every reload. Each meal table also gained Carbs/Fat columns
alongside the existing Kcal/Protein ones.

Scope was deliberately narrow, per the brief: no changes to `daily_checks`/
`daily_logs`/any other table, no changes to Today's core structure beyond this macro
row, and no UI built for `social_nights` (an unrelated table found via the same
schema-drift introspection while reconstructing migrations for this change — a
`user_id`/`event_date`/`status`/`note` table nothing in this app's code reads or
writes; left alone, not this brief's concern).

## Training split pager, exercises dropped from Plan, and Today's meal accordions

Three follow-up requests after the macro-row/meal-tabs change above.

**Training split** had the same "long scroll" problem the old meal-templates
tables did, just worse (8 weeks × 7 days = 56 rows stacked at once). Rather than
a segmented control (8 tabs doesn't fit a 420px phone screen the way 3
Lift/Run/Rest tabs did), it's now a **prev/next week pager** — the same
`.date-nav` markup/styling Today and Week already use for their own paging,
just embedded inside the Training split panel (`#trainingSplitNav` +
`#trainingSplitContent`). Defaults to whichever week contains today (falling
back to the block's first week) via a module-level `activeTrainingWeek` in
`plan.js`, same "ephemeral UI state, not worth persisting" treatment as
`activeMealTab`. `weekTrainingHtml()` no longer renders its own "Week N — focus"
heading, since the pager nav shows that now — would've been a duplicate.

**Exercises are gone from Plan's Training split** (the one place they were
still shown, per the "Today shows no exercise detail" note above) —
`sessionDayRowHtml()` no longer renders the `<ul class="plan-exercise-list">`
block. Deliberately UI-only: `db.sessionTemplates.list()` still joins
`session_exercises(*)`, `get_day_bundle()` still returns them for Today's
`session.exercises` (unused there too), and the table/data are untouched —
cheap to resurface later if wanted. `.plan-exercise-list` CSS removed as
dead weight since nothing renders that class anymore.

**Today's meal cards are now "Meal 1"/"Meal 2" accordions**, collapsed by
default, instead of a flat row showing the meal's own name and one combined
macro line. Collapsed, a card shows just "Meal N", its time, and the same
4-macro summary line as before (so the at-a-glance total is still there
without opening anything). Expanding it (a separate `.meal-acc-summary`
button, independent of the `.tick-box` — opening a meal to look at it
shouldn't mark it eaten, and ticking it shouldn't force it open or closed)
reveals a list of the meal's individual **foods**, each its own row with
name, weight in grams, and its own kcal/protein/carbs/fat — replacing the
old single free-text name like "6 eggs + 2 bananas" that used to read as one
messy blob.

That per-food breakdown lives in a new table, **`fitness.meal_foods`**
(`meal_template_id` FK, `order_num`, `name`, `weight_g`, `kcal`, `protein_g`,
`carbs_g`, `fat_g`) — same shape as every other read-mostly Plan table
(`authenticated read` SELECT-only policy, no write policy, edited via SQL
directly). `meal_templates`'s own `kcal`/`protein_g`/`carbs_g`/`fat_g` stay
exactly as they are — the meal's *combined* total, still what Plan's meal
tables and Today's fuel-panel running totals sum from — `meal_foods` is
additive per-food detail layered on top, not a replacement. `get_day_bundle()`
nests each meal's foods into its jsonb as `foods` (empty array until real
data is entered). **The table starts empty** — Chris is providing the actual
name/weight/macro breakdown for each of the 15 existing meals himself, to be
entered via a follow-up migration once received, same as any other plan-data
edit in this app. Until then (and for any future meal added without its own
breakdown), `today.js`'s `mealFoods()` falls back to a single food row built
from the meal's own name and totals, so an unpopulated meal's accordion
opens onto something real (its own line) rather than empty.

Scope check, per the request: Plan's own meal-templates table (the one
showing Lift/Run/Rest tabs) was explicitly left as one-row-per-meal with
combined totals — only Today's card got the per-food accordion treatment.

## Real per-food data loaded for LIFT and RUN meals

Chris sent the actual name/quantity/kcal/protein/carbs/fat breakdown for every
LIFT and RUN meal (a CSV, 5 meals × ~2-5 foods each). Two things changed
`meal_foods`'s shape before this could load in, both confirmed with him first
rather than guessed:

- **`weight_g` became `quantity` + `unit`.** The real data turned out to be
  mostly *not* grams — "6 whole" eggs, "2 medium" bananas, "1 scoop" whey,
  "1 serving" electrolytes — only the mince/rice/veg/skyr/creatine lines were
  actually in grams. Forcing everything into a gram figure would have meant
  inventing conversions (how many grams is "1 scoop"?) nobody supplied.
  `quantity`/`unit` store exactly what was given; `today.js`'s `foodQtyLabel()`
  renders grams tight ("250g", matching the app's existing "45g carbs"
  convention) and anything else as "qty unit" ("6 whole", "1 scoop").
- **`is_swap_option` boolean added.** Dinner's "alt protein" rows (salmon,
  chicken breast, chicken thigh, an egg add-on) are alternatives to the
  default beef mince, not extra food eaten alongside it — swapping the
  protein, not adding to it. Marked `is_swap_option = true`, excluded from
  `meal_templates`' own combined totals (which only ever sum the meal's real
  default foods), and rendered by `today.js` in a separate "Or swap the
  protein for" group at the bottom of the accordion, visually dimmed
  (`.meal-food-swaps`/`.is-swap` in `styles.css`) so the actually-planned
  foods above it read as the real plan at a glance.

**The CSV also revealed the seeded meal_templates totals were stale** — 3 of
5 meals per day type didn't match once broken into foods (bigger portions:
300g/300g mince+rice at lunch vs. the CSV's 250g/200g; a "pepper & tomato
side" at lunch and a "rotate carrots/asparagus/spring greens" note at dinner
that aren't in the CSV at all; whey + 4 eggs at post-workout vs. the CSV's 6
eggs, no whey; 3 bananas post-run vs. the CSV's 2). Confirmed with Chris that
the CSV is the update, not a partial breakdown of the bigger existing
portions — so `meal_templates.name`/`kcal`/`protein_g`/`carbs_g`/`fat_g` were
corrected to match the CSV's sums exactly for every LIFT/RUN meal touched,
not just layered underneath as a mismatching food list. **REST day meals
weren't covered by this data at all and are untouched** — still the older,
bigger portions, still no `meal_foods` rows, so Today's accordion for a rest
day still falls back to a single food row built from the meal's own name.

Migrations: `fitness_meal_foods_quantity_unit_and_swap` (the column change,
on the still-empty table so a clean alter, not a data migration),
`fitness_get_day_bundle_meal_foods_quantity_unit` (nests
`quantity`/`unit`/`is_swap_option` into `get_day_bundle()`'s per-meal `foods`
instead of `weight_g`), `fitness_load_real_meal_foods_lift_run` (the actual
data — 10 meals' worth of `meal_foods` inserts plus the 8 `meal_templates`
corrections, LIFT pre-workout and RUN pre-run left untouched since their
totals already matched the CSV exactly).

## Plan's meal templates now share Today's accordion, plus a day-total footer

Follow-up: "do the same separation of food items on the plan page" (foods vs.
swap options, matching Today) "and show totals at the bottom."

**Extracted the accordion into `fitness/js/mealCard.js`**, shared by both
views rather than duplicated — `mealFoods()`/`foodQtyLabel()`/`foodRowHtml()`
(unchanged logic, just moved) plus `mealAccordionHtml(meal, idx, { itemId,
checked })` and `wireMealAccordionToggles(root)`. `itemId` is how the two
callers differ: Today passes one and gets the tick-box, checked state, and
`data-*` attributes `computeTotals()` reads; Plan passes neither, so the
card renders as a plain read-only reference — same "Meal N" title, time,
macro summary, expand-to-see-foods-and-swaps, just nothing to tick.
`today.js`'s `mealRowHtml()` is now a two-line wrapper over the shared
function; its own copies of the food-rendering functions are gone.

**Plan's meal-templates table is gone.** Each day type's meal list (under
the existing Lift/Run/Rest tabs) is now the same accordion cards as Today,
via `mealDayHtml()` in `plan.js`. This meant `db.mealTemplates.list()` had
to start embedding `meal_foods` — it didn't before, since the old table
only ever read the meal's own combined columns. Aliased to `foods` in the
query (`select('*, foods:meal_foods(*)')`) rather than left as the table's
own name, so both this direct query (Plan, and Week's meal list, which
ignores the extra field) and `get_day_bundle()`'s RPC (Today) hand
`mealCard.js` the exact same shape — one function, one expectation, not two
call sites that happen to agree today and could silently drift apart later.

**Day totals**: a footer line under each day type's meal list — "if you eat
everything planned today, this is the total" — summing every meal's own
`kcal`/`protein_g`/`carbs_g`/`fat_g` (already the real-foods-only figure;
`meal_templates`' totals never included swap options to begin with, so
summing them needs no extra filtering). Deliberately re-sums from each
meal's own combined columns, not by flattening every meal's `foods` array
and re-adding — the combined columns are the one place a meal's true total
already lives; recomputing it a second way from the food list would risk
disagreeing with itself if the two ever drifted.

Old `.plan-meal-table`/`macroCell()`/`mealTableHtml()` removed outright (no
call sites left); `.plan-meal-note` CSS removed too (its only user was the
old table's meal-name cell, gone with it) — `.plan-week-focus`, which shared
that rule, kept its own.

## Each training session gets its own tick; distances now show miles + km

Two requests: "each training session should have its own tickbox, where
there are two on a day you should separate them" and "update running
distances to miles, not km (or show both)".

**The real gap this surfaced**: Monday (weeks 2-8), Tuesday (weeks 3-8) and
Thursday (weeks 2-8) each already had two real activities, but crammed into
one `session_templates` row — "Upper lift + Intervals (PM)" (`session_type
'upper'`), "Muay Thai + Easy run" / "Muay Thai + Long run" (`session_type
'run'`). One row means one tick: Muay Thai was just text in a title/summary
with no way to check it off separately from the run, and Monday's row being
`session_type = 'upper'` meant `get_day_bundle()` derived `day_type =
'lift'` and never joined `run_plan` at all for that day — **Monday's
interval prescription was sitting in `run_plan` the whole time but was
never reachable anywhere in the app.**

**Schema**: added `'muay_thai'` to `session_templates.session_type`'s check
constraint. The two partial unique indexes enforcing "exactly one row per
`(day_of_week, week_number)`" — `session_templates_default` (null week) and
`session_templates_override` (specific week) — were the actual blocker for
having two rows on one day at all; both widened to include `session_type`,
so a day can now hold one row per type (never two of the *same* type).
`fitness_split_combined_sessions` then splits each combined row: the
existing row keeps its `id`/`week_number` and is retitled to just its own
activity ("Upper lift", "Easy run", "Long run"), a new row is inserted
alongside it for the second activity ("Intervals (PM)", "Muay Thai").
`run_plan` itself needed no changes — Monday's intervals data was already
there, just unreachable.

**`get_day_bundle()`: `session` (singular) → `sessions` (array).** Each
session gets its own `exercises` and, for a `session_type = 'run'` row, its
own nested `run` (previously a bundle-level key). Resolution is **all-or-
nothing per day, not per session_type**: if any week-specific row exists
for a `(day_of_week, week_number)`, every week-specific row for that day
is the complete truth and every null-`week_number` default for that day is
discarded outright — not just the one sharing a `session_type`. This has
to work that way, not per-type: week 8 Sunday's race (`session_type
'run'`) must still fully replace the standing `'rest'` default, a
*different* type, not sit alongside it — a per-type precedence would have
shown both. Within whichever set applies, different-type rows are
independent and both kept; that's the actual "two sessions" case.
`day_type` (which meal set/target applies) still needs exactly one answer
even on a two-session day, via a fixed priority — **lift beats run beats
rest** — computed off the same resolved set. Monday's AM lift + PM
intervals is still a lift day for eating purposes; the run is a bonus,
not what the day's food is planned around. Muay Thai never sets `day_type`
on its own; every day it appears on already has a lift or run row that
does. The client-side mirror of this same resolution lives in
`resolveSessionsForDay()` (`utils.js`), shared by `plan.js` and `week.js`.

**Rendering**: Today's `renderMealsAndTraining()` now maps over
`bundle.sessions`, one `<section class="panel">` per session with its own
tick — `liftRowHtml` renamed `sessionTickRowHtml` since it's now reused for
`'upper'`/`'lower'`/`'muay_thai'` alike (it was already fully generic, just
misleadingly named). Plan's `sessionDayRowHtml()` keeps one
`.plan-session-row` (one `<li>`) per day but stacks a title/summary block
per session inside it when there are two, day name shown once, a dashed
divider between them. Week's `trainingLine()` joins every session's title
with `" + "` into one compact line (Week has no ticks and is a glance-only
reference, so full separation wasn't needed there — just not losing either
session's info the way showing only one resolved session would).

**Distances now show miles alongside km** (`formatDistance()` in
`utils.js`, `"Xmi (Ykm)"`) everywhere a `run_plan.distance_km` figure is
displayed — Today's run tick, Plan's Training split and 10K progression
table, Week's training line. Deliberately **only the structured
`distance_km` column** — `run_plan.detail`/`effort` free text (interval
reps in metres — "8 x 400m", "10K pace" as a race-pace reference, not a
distance to convert) is left exactly as authored; converting embedded
unit mentions inside arbitrary text risked losing precision or reading
oddly ("3 × 0.6mi" is worse than "3 × 1km" for track intervals, which stay
metric by convention regardless of a runner's overall unit preference).

## Working notes for future sessions

- Every list-style query in `db.js` filters by what actually scopes it (`user_id`,
  `block_id`) explicitly, not just RLS — same "belt and suspenders" rule as `usa`.
- `offlineQueue.js` persists pending writes to `localStorage` (last-write-wins per
  key, survives a reload) and replays them on the `online` event and on boot; `main.js`
  supplies the `{ daily_log, daily_check }` replayer map, keeping the queue module
  itself ignorant of this app's specific tables.
- `auth.js` is a fourth copy of the same magic-link + 6-digit-code pattern already
  used by `usa` and `goals` in this repo — each top-level app keeps its own copy
  rather than importing across app boundaries, matching how `usa`/`goals` already do
  it, not a new decision made here.
