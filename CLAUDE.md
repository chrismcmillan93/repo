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

The "Also there" cards show full item detail, not just a title and time: time range,
type, notes, estimated cost (in the item's own currency — never converted through this
trip's `fx_rate`, since it's someone else's spend on someone else's trip), and the
linked place's name/address/rating/map link when the item has one. A `places` row is
only readable cross-trip via the additive **"shared leg place read"** policy, which
opens up a place row only when it's actually referenced (`itinerary_items.place_id`)
from a shared leg's itinerary — the same narrow, read-only shape as the leg/item
policies, not a general grant to someone else's places shortlist.

`trips.traveller_name` labels whose plan a shared item is — a person's name, not the
trip's own title, since "Sister's USA Trip" reads oddly from the other account and a
trip's title is that trip owner's own choice of words, not necessarily their name.
Captured once as a required field on the "create your trip" onboarding form (real
sign-in here is just an email link, so trip creation is the actual first-setup
moment) and never editable after that today. `sharedItemCard.js`'s `travellerLabel()`
falls back to `trips.name` for any trip predating this column, then to `'Someone'` so
this never renders blank. `usa/js/sharedItemCard.js` holds the one `sharedItemHtml()`
renderer shared between Overview's "Also there" section and the Itinerary's per-day
badge (below) — so a shared item looks the same wherever it surfaces.

Itinerary shows the same shared data inline, per day, rather than only in one
dedicated Overview section: each day-group whose date has a shared item from another
account gets a collapsed **"\<name\> has/have plans today"** badge (gold pill, `.also-badge`)
under the day header, naming whoever it is — expanding in place, on click, to the
same `sharedItemHtml()` cards Overview uses (with the date suppressed, since the day
heading already shows it). Collapsed by default so someone else's plan never
competes for attention with your own day, and the expanded state resets every time
the Itinerary view is re-entered (never persisted, never surprises you open).

## PDF export

Two "Export PDF" actions — one per stop (the 📄 icon in each stops-panel row) and one
for the whole trip (utility bar, top of every screen) — both call into `usa/js/print.js`
and both do the same thing at different scope: build a day-by-day timeline merging
`itinerary_items`, `flights`, `accommodations` and `transport` into one document (a
flight's departure/arrival, a stay's check-in/check-out, a transport pickup/dropoff,
and the day's confirmed itinerary items, sorted by time within the day) and open it as
a standalone page in a new tab, then call `window.print()` so the browser's own
"Save as PDF" does the actual conversion. No PDF library and no build step — matches
this app's existing "no bundler" rule. An unpicked choice-group alternative is
excluded, same rule as the cost totals. Flights/accommodation/transport have no
`leg_id` tie strong enough to scope a document by leg (flights don't have a `leg_id`
column at all), so both scopes use the same date-matching logic — the trip-wide
export just passes a wider date range than the per-leg one, which avoids a booking
on a leg-boundary date (e.g. a flight day) being duplicated across two leg sections.

## Trip decisions

`docs/` is this app's memory. `docs/usa-trip-spec.md` is the original build brief.
`docs/trip-decisions.md` records decisions made after that — accommodation choices,
routing rationale, anything not obvious from the schema. Add to it as decisions are
made; don't let that context live only in a chat transcript.
