# This repo

`app.chris-mcmillan.co.uk` — a plain GitHub Pages site (see `CNAME`). `main` is served
directly, with no build step. Each top-level directory is an independent app: `naples`,
`thailand`, `goals`, `wainwrights`, `finance`, `fitness`, `usa`. They're hand-written
HTML/CSS/JS that load `@supabase/supabase-js@2` from a CDN `<script>` tag and talk to
Supabase straight from the browser with the anon key — there is no Next.js, no bundler,
no package.json anywhere in this repo, and none should be added without discussing it
first (a static-hosting deploy and a framework build step are two different projects).

## USA trip planner (`/usa`)

A single-traveller trip planner for a 14-night USA trip in May 2027, replacing a
spreadsheet. Lives entirely under `usa/`, served at `app.chris-mcmillan.co.uk/usa`.

**Stack:** vanilla HTML/CSS/JS (ES modules), same architecture as `goals/` and
`naples/` — no build step, no framework, no TypeScript. `supabase-js` loaded via CDN.

**Supabase:** project `dashboards-new`, ref `bcrmbuiuekklpocpllpw`, region eu-west-1.
This project is shared with the `goals` app (and the legacy `checkbox_states`/
`item_data` tables in `public`) — each app gets its own schema. This app's schema is
**`usa`** (lowercase). Never touch `public` — it belongs to another app. Never touch
`goals` — it belongs to the Goals & Progress app.

**Migrations only.** All DDL for the `usa` schema goes through migration files in
`supabase/migrations/`, applied with the Supabase MCP `apply_migration` tool (or the
Supabase CLI). Never hand-edit the schema in the dashboard. Use `execute_sql` only for
reads and one-off data checks. Run `get_advisors` (security) after any DDL change to
this schema and fix anything it flags — in particular, every table needs RLS enabled.

**Auth: magic-link, multi-tenant, one trip per account.** Real accounts landed —
email magic link / 6-digit code via Supabase Auth, same pattern as `goals/js/auth.js`
(ported into `usa/js/auth.js`, don't fork a third copy of this — fix bugs in both if
found). Each account has at most one trip; there's no trip-switcher UI and none is
planned. A signed-in account with no trip yet gets a "create your trip" form instead
of an error — this is how a second person (or more, later) gets their own trip without
a migration each time.

**Every list query is scoped by `trip_id` client-side** (`usa/js/db.js`), not just by
RLS — every `list()` call takes the trip id explicitly (always `state.trip.id`). Keep
this when adding new tables or queries: never `select('*')` without a trip (or
`is_shared`) filter, even once RLS is fully tightened — belt and suspenders, not
either/or.

**RLS: tightened to real per-user ownership (2026-09-07).** The transitional "anon
full access" policies are gone. Current shape:
- `trips`: `user_id = auth.uid()`, all operations.
- every child table (`legs`, `flights`, `accommodations`, `transport`, `places`,
  `itinerary_items`, `checklist_items`, `expenses`): `trip_id in (select id from
  usa.trips where user_id = auth.uid())`, all operations.
- **Exception, additive and read-only:** `legs` where `is_shared = true`, and
  `itinerary_items` whose `leg_id` points at such a leg, get an extra SELECT-only
  policy readable by any authenticated user regardless of trip ownership — the
  mechanism behind "everyone's Vegas stop is visible to everyone, nothing else is."
  Nobody can edit a leg they don't own via this policy, only read it.
- Anon grants on the `usa` schema are revoked — the app requires a real session,
  full stop. This landed together with reassigning Chris's original (pre-auth,
  `user_id = null`) trip to his real account, once he completed his first sign-in —
  see `docs/trip-decisions.md` for that sequencing and why it couldn't happen sooner.

It's now safe to send a second person's sign-in link — a new account's trip and an
existing account's trip are isolated by the database, not just by the client always
filtering by `trip_id` (which still happens too — belt and suspenders).

**One-time manual step (not doable via any MCP tool available to Claude):** the `usa`
schema must be added to the project's exposed schemas — Dashboard → Project Settings →
Data API → "Exposed schemas" (comma-separated list; `goals` is already in there for the
Goals app). Without this, every PostgREST call scoped to `db: { schema: 'usa' }` 404s.

## Currency rules

- Flights and accommodation are entered and shown in **GBP only** — never converted.
- Everything spent in the US (activities, transport on the ground, food, incidentals)
  is entered in **USD**, and can be viewed in GBP via the header toggle.
- Conversion happens **at render time only**, using `trips.fx_rate` (GBP→USD units,
  e.g. `1.27` means £1 = $1.27). Never store a converted value. Store money as
  `numeric(12,2)`, never as a JS float persisted to the DB.
- Always show the fx rate in use next to the toggle so a converted figure is never
  mistaken for a real one.
- `trips.fx_rate` is the manually-saved value in the DB, but the rate actually
  **displayed** updates on its own: `usa/js/fxRate.js` fetches a live GBP→USD rate
  from frankfurter.app (free, no key) on every load, and `main.js`'s
  `applyLiveRate()` overlays it onto `state.trip.fx_rate` **in memory only**
  (`state.fxIsLive = true`) — this never writes to the DB. The fx note always shows
  which is in effect, with a "(live)" suffix when it is. If the fetch fails, the
  last saved rate keeps being used, silently.
- Once the user explicitly clicks Save in the fx-edit popover, `state.fxManualOverride`
  goes sticky for the rest of that page load: `applyLiveRate()` stops overlaying
  anything, even when an unrelated edit elsewhere (adding a stop, ticking a checklist
  item) triggers another `loadCore()`/`usa:tripchange`. A saved rate is never
  silently swapped back to live mid-session — only a fresh page load re-enables it.

## Itinerary options (choice groups)

`itinerary_items.choice_group_id` + `is_selected` support undecided alternatives for
one slot (e.g. "UFC vs. the Sphere, same night") — rows sharing a `choice_group_id`
are alternatives; exactly one should have `is_selected = true`. Cost/summary screens
must filter on `is_selected` when summing `itinerary_items.estimated_cost`, or an
unpicked alternative double-counts against the trip budget.

## Cross-trip sharing

`legs.is_shared` makes a leg (and its `itinerary_items`) readable by any authenticated
account, not just its owner — see the RLS policies above. `db.legs.listSharedElsewhere`
/ `db.itineraryItems.listSharedElsewhere` in `db.js` fetch another account's shared
leg(s); the Overview screen's "Also there" section is the only place this is
surfaced today. Read-only by design — nobody edits a leg they don't own.

## Trip decisions

`docs/` is this app's memory. `docs/usa-trip-spec.md` is the original build brief.
`docs/trip-decisions.md` records decisions made after that — accommodation choices,
routing rationale, anything not obvious from the schema. Add to it as decisions are
made; don't let that context live only in a chat transcript.
