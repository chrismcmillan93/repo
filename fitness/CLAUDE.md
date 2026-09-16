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

- **Prep tasks**, grouped by day. `prep_tasks.prep_day_of_week` is an **array**, not a
  single day — a task valid to prep on more than one day (e.g. `[3, 4]`, "Wednesday
  or Thursday") appears once under *each* of those day headings. It's the same
  `task_id` in both places, so ticking it from either occurrence checks both (see
  `wirePrepTasks()`'s re-sync-every-occurrence loop) and writes one `prep_checks` row.
  `covers_day_of_week` (which day's meals the task is actually *for*, independent of
  which day(s) it's valid to prep on) isn't shown separately in the UI — it's already
  legible from the task's own title ("Thu — lunch + dinner").
- **Shopping list**, grouped by category. Category order follows first-appearance in
  the `sort_order`-ordered item list (protein, carbs, veg, …, as actually written),
  not alphabetical.
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
