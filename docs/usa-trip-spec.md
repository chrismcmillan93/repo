# USA 2027 trip planner — build spec

This is the original brief the app was built from. It's kept here verbatim as a
reference for scope and intent; day-to-day decisions made after this point go in
`trip-decisions.md` instead of being edited into this file.

## 0. Brief

Build a trip planning and tracking web app for a single traveller's 14-night USA trip
in May 2027. It replaces a spreadsheet: it holds the itinerary, the bookings, the
costs, and a shortlist of places worth going, and it is edited constantly between now
and departure.

Everything in this app is **unbooked**. The primary job of the first release is to
hold placeholders that get filled in as things are confirmed. Treat "add a row before
it exists" as the core interaction, not an afterthought.

This is a first pass — the bones. Prefer a small number of screens that work
completely over a large surface that half-works.

---

## 1. Stack and infrastructure

| Thing | Decision |
|---|---|
| Framework | Vanilla HTML/CSS/JS (ES modules) — see note below |
| Route | Served at `app.chris-mcmillan.co.uk/usa` via GitHub Pages, no build step |
| Database | Supabase project `dashboards-new`, ref `bcrmbuiuekklpocpllpw`, region eu-west-1 |
| Schema | `usa` (lowercase). Do not touch `public` — it belongs to another app |
| Repo | GitHub, `main` = production |
| Auth | **Not in this release.** See §7 |

> **Deviation from the original brief:** the brief specified Next.js (App Router),
> TypeScript, and Tailwind, with `basePath: '/usa'`. On inspecting the actual repo,
> `app.chris-mcmillan.co.uk` is a plain GitHub Pages site with no build step and no
> framework anywhere — every sibling app (`goals`, `naples`, `wainwrights`, ...) is
> hand-written HTML/CSS/JS loading `supabase-js` from a CDN. Asked which to prioritise,
> the decision was to match the existing pattern rather than introduce Next.js and a
> build pipeline that nothing else in the repo has. Everything else in this spec
> (data model, currency handling, screens, design direction, seed data) stands as
> originally written.

**Deploy flow:** single environment for now — work on a feature branch, open a PR,
merge to `main` when the slice is complete and working. No staging environment; it may
be added later once the app is past its first pass. Don't push half-finished slices to
`main`.

**Migrations:** all DDL goes through Supabase migration files committed to the repo
(`supabase/migrations/`). Never apply schema changes by hand in the dashboard. Use
`apply_migration` for DDL and `execute_sql` only for reads and one-off data checks.

---

## 2. Data model

Create in schema `usa`. Every table: `id uuid primary key default gen_random_uuid()`,
`created_at timestamptz default now()`, `updated_at timestamptz default now()` with a
trigger.

Every table also gets a nullable `user_id uuid` column now, unused, so adding auth
later is a migration rather than a rewrite. Enable RLS on every table from the start
with a permissive policy for the anon key, and leave a
`-- TODO: tighten when auth lands` comment on each policy.

### `trips`
One row for now, but the table exists so a second trip doesn't require a rebuild.
`name`, `start_date`, `end_date`, `home_currency` (default `GBP`), `spend_currency`
(default `USD`), `fx_rate numeric` (editable GBP→USD rate used for all conversion),
`notes`.

### `legs`
The four stops. `trip_id`, `name`, `city`, `region`, `arrive_date`, `depart_date`,
`sort_order`, `colour_token`.

### `flights`
`trip_id`, `label`, `booking_reference`, `airline`, `flight_number`, `from_airport`,
`from_city`, `to_airport`, `to_city`, `depart_at timestamptz`, `arrive_at timestamptz`,
`budget_amount numeric`, `actual_amount numeric`, `currency` (default `GBP`),
`is_paid bool`, `booking_url`, `notes`, `status` enum
(`placeholder` | `held` | `booked`).

Every monetary field on every table follows this same shape: `budget_amount`,
`actual_amount`, `currency`, `is_paid`. Don't invent variations.

### `accommodations`
`trip_id`, `leg_id`, `name`, `type` enum (`hotel` | `apartment` | `airbnb` | `other`),
`booking_reference`, `address`, `maps_url`, `check_in date`, `check_out date`, `nights`
(generated column), `has_gym bool` — **this is a hard requirement of the trip, surface
it prominently in the UI** — `free_cancellation bool`, `cancellation_deadline date`,
`rating numeric`, `rating_count int`, `rating_source text`, plus the money fields and
`status`.

### `transport`
Hire cars, transfers, internal travel that isn't a flight. `trip_id`, `leg_id`, `type`
enum (`hire_car` | `transfer` | `rideshare` | `rail` | `other`), `provider`,
`booking_reference`, `pickup_location`, `pickup_at`, `dropoff_location`, `dropoff_at`,
`notes`, money fields, `status`.

### `places`
The shortlist — everything planned, discussed, or merely recommended.
`trip_id`, `leg_id`, `name`, `category` enum (`activity` | `hike` | `national_park` |
`restaurant` | `bbq` | `coffee` | `bar` | `comedy` | `shopping` | `landmark` |
`other`), `description`, `address`, `maps_url`, `website_url`, `rating numeric`,
`rating_count int`, `rating_source text`, `price_indicator` (`$`–`$$$$`),
`booking_required bool`, `is_shortlisted bool`, `is_rejected bool`,
`rejection_reason text`, `estimated_cost numeric`, `currency`, `notes`.

`is_rejected` matters — the trip has real "considered and dropped" decisions worth
keeping visible so they aren't re-litigated.

### `itinerary_items`
`trip_id`, `leg_id`, `day date`, `start_time time` (nullable), `end_time time`
(nullable), `title`, `place_id` (nullable FK to `places`), `type` enum
(`fixed` | `planned` | `idea`), `sort_order int`, `notes`, `estimated_cost numeric`,
`currency`.

Nullable `place_id` means an item can be free-standing ("laundry day") or linked to a
saved place, and linked items inherit the map link and rating.

### `checklist_items`
`trip_id`, `title`, `category` enum (`admin` | `tickets` | `packing` | `other`),
`is_done bool`, `due_date date`, `url`, `notes`, `sort_order`.

### `expenses`
Anything not attached to a booking — food, drinks, incidentals.
`trip_id`, `leg_id`, `date`, `description`, `category`, `amount numeric`, `currency`,
`is_estimate bool`.

---

## 3. Currency handling

- Flights and accommodation are entered and displayed in **GBP only**.
- Everything spent in the USA (activities, food, transport on the ground, expenses) is
  entered in **USD** and viewable in both.
- A single global GBP/USD toggle in the header switches the display currency for
  USD-denominated items. GBP-denominated items never convert.
- Conversion uses `trips.fx_rate`, editable from a settings panel. Show the rate in use
  next to the toggle so a converted figure is never mistaken for a real one.
- Store amounts as `numeric(12,2)`. Never store money as float. Never store a
  converted value — convert at render time only.

---

## 4. Screens

### Overview (default)
The trip at a glance. Countdown to departure. The four legs as a route across the top.
Total budgeted vs total actual, with the amount still unbooked called out — that's the
number that actually matters right now. Outstanding checklist items. Next cancellation
deadline.

### Itinerary
Day-by-day, grouped by leg, 14 days plus travel days. Inline add and delete on any
day. Reorder within a day. Fixed anchors (the wedding, Kill Tony, Comedy Store) must be
visually distinct from ideas — these are dates the trip is built around and cannot
move.

### Bookings
Three tabs — Flights, Accommodation, Transport. Each is a list of rows with an
always-visible "Add" affordance. A row in `placeholder` status should look unmistakably
provisional, not like a confirmed booking with empty fields. Show booking reference,
dates, route/location, cost, paid state.

### Places
Filterable by leg and category. Card per place with rating, price indicator, and a
Google Maps link that opens in a new tab. Rejected places live in a collapsed section
at the bottom with their reason shown. "Add to itinerary" on each card creates a linked
`itinerary_items` row.

### Costs
Breakdown by category (flights, accommodation, transport, activities, food and drink,
other) and by leg. Budgeted vs actual vs remaining. Paid vs unpaid. Keep it a table —
this is a screen for reading numbers, not for a donut chart.

### Checklist
Simple, grouped, checkable.

---

## 5. Seed data

Everything below is real, already-decided trip content, shipped as a seed migration.

### Trip and legs
Trip: "USA 2027", 14 nights, May 2027. Dates below are the current working assumption
and must be editable — flights aren't booked, so they may shift.

| # | Leg | Dates | Nights |
|---|---|---|---|
| 1 | Austin, TX | ~15–20 May | 5 |
| 2 | Las Vegas, NV | ~20–24 May | 4 |
| 3 | Los Angeles, CA | ~24–27 May | 3 |
| 4 | Santa Barbara, CA | ~27–29 May | 2 |

Routing is open-jaw: UK → Austin, Austin → Las Vegas, Las Vegas → LA, LAX → UK. Austin
is deliberately first so that Kill Tony falls on Mon 17 May and the trip avoids US
Memorial Day (31 May). Note that in the trip notes — it's a decision worth not
accidentally undoing.

The LA/Santa Barbara split (3/2) is still open. Flag it in the checklist.

### Flight placeholders
Four rows, all `placeholder`, GBP, no booking reference:
1. UK → Austin (AUS)
2. Austin (AUS) → Las Vegas (LAS)
3. Las Vegas (LAS) → Los Angeles (LAX)
4. Los Angeles (LAX) → UK

### Accommodation placeholders
- **Austin** — apartment-style Airbnb, 5 nights. Kitchen and laundry wanted for the
  longest stay; one laundry day at the end of Austin covers the whole trip.
- **Las Vegas** — Harrah's Las Vegas, 4 nights. Chosen for proximity to Caesars Palace
  (~0.23 miles, outdoor Strip walk) where the traveller's sister is staying for the
  wedding. Trump International is the better-reviewed property but the extra distance
  was the wrong trade-off. Hotel rather than rental because of Clark County
  short-term rental restrictions.
- **Los Angeles** — 3 nights, apartment or hotel, undecided.
- **Santa Barbara** — 2 nights, hotel.

All four: `has_gym = true` is a requirement, `free_cancellation` preferred.

### Transport placeholder
One hire car for the LA + Santa Barbara leg — self-drive coastal road trip. Pickup and
dropoff TBC.

### Fixed itinerary anchors
- **Mon 17 May** — Kill Tony, Comedy Mothership, Austin
- **Sun 23 May** — family wedding, Las Vegas
- **Wed 26 May** — Comedy Store, Sunset Strip, LA

### Places — already planned
**Austin:** Comedy Mothership; Mount Bonnell; McKinney Falls State Park; Terry Black's
Barbecue; La Barbecue; LeRoy and Lewis Barbecue; Lockhart BBQ day trip; Driftwood
(Salt Lick) day trip.

**Las Vegas:** Red Rock Canyon — Calico Tanks Trail; Caesars Palace (wedding-adjacent,
reference only).

**Los Angeles:** Comedy Store, Sunset Strip; Mount Hollywood Trail, Griffith Park;
Solstice Canyon, Malibu.

**Santa Barbara:** Inspiration Point; Stearns Wharf; State Street; Funk Zone (walkable
wine tasting — inland wineries ruled out by the self-drive leg).

### Places — rejected, seed with reasons
- **Franklin Barbecue** (Austin) — 3–5 hour queues. Queue aversion is a hard
  constraint on this trip.
- **Enchanted Rock** (Austin) — 3-hour round trip for a short hike; driving time
  disproportionate to payoff. Venues within ~25 minutes of central Austin preferred.

### Places — recommendations to seed
All verified against Google Places in September 2026. Ratings are a snapshot: seeded
with `rating_source = 'Google, Sept 2026'`, treated as manually refreshed. All seeded
with `is_shortlisted = false` so they read as suggestions rather than decisions. See
the seed migration (`supabase/migrations/..._usa_seed_trip_data.sql`) for the full,
exact list — Austin, Las Vegas, Los Angeles, and Santa Barbara coffee/restaurant/bar/
national-park recommendations with rating, count, and source.

### Ratings and map links
- **Do not invent ratings.** Only the seeded figures are real. Any place without a
  seeded rating shows "not rated yet" in the UI — a fabricated 4.7 is worse than a
  blank.
- No Places API, no key, no billing. These are manually-refreshed snapshots, which is
  why `rating_source` carries a date.
- `maps_url` is a search URL, stable and needing no place ID:
  `https://www.google.com/maps/search/?api=1&query=` + URL-encoded
  `"<name>, <city>, <state>"`.

### Checklist seed
Travel insurance · ESTA application · Hire car booking · Book flights (before
accommodation) · Kill Tony tickets — drops 2–3 months out with 24–48 hours' notice via
Instagram, standby queue is a genuine backup · Confirm LA vs Santa Barbara night split
· Book Austin accommodation · Book LA accommodation · Book Santa Barbara
accommodation.

---

## 6. Design direction

The subject is a solo road trip built around comedy, hiking and barbecue, ending at a
Las Vegas wedding. It should feel like something you'd actually want to open on a
phone in an airport queue — confident, warm, a bit celebratory, not a corporate
dashboard and not a novelty.

**Reference point:** mid-century American highway signage and enamel roadside signs.
Not distressed-vintage kitsch, not neon-Vegas pastiche.

**Palette** — 5 tokens, no gradients used as decoration:
- `midnight` `#16233D` — deep flag navy, primary surface for the header and route band
- `signal-red` `#B3373C` — muted flag red, used for fixed anchors and nothing else
- `bone` `#EDE7D9` — page background
- `dust` `#C9A87C` — desert tan, secondary accent for Vegas and hiking content
- `asphalt` `#2B2F36` — body text

**The flag.** One appearance only, in the background: an oversized, heavily cropped
stars-and-stripes field behind the Overview hero at very low opacity (~4–6%), rendered
as CSS/SVG rather than an image, in `midnight` and `signal-red` on `bone`. It should
read as texture you notice on second glance. It must not appear on other screens, must
not be a repeating pattern, and must never sit behind body text.

**Type:** two families, clearly distinct. Headings in a condensed grotesque with
highway-sign character (Archivo Condensed or Saira Condensed). Body in IBM Plex Sans.
Set a real type scale. Sentence case throughout — no tracked-out all-caps eyebrow
labels above headings.

**Structure:** the four legs are a genuine sequence, so a numbered route device across
the Overview is earned rather than decorative — use it there and nowhere else. Money
is tabular: right-align figures, use tabular numerals, no cards.

**Avoid:** identical rounded cards for every content type; the same soft grey shadow
under everything; middle-dot meta strings; arrows appended to button text; motion on
every card. One page-load reveal on Overview at most; otherwise motion only in
response to an action.

**Quality floor, unannounced:** responsive to 375px, visible keyboard focus,
`prefers-reduced-motion` respected, accessible contrast throughout. Empty states are
invitations to act, not apologies.

**Copy:** plain verbs, active voice, sentence case. "Add flight", not "Submit". The
button that says "Save booking" produces a toast that says "Booking saved".

---

## 7. Explicitly out of scope

- **Auth.** Multi-user with email login is coming later. Prepare for it (nullable
  `user_id`, RLS on) and build nothing else.
- Live Google Places ratings.
- Offline mode, PWA, native app.
- Real-time FX rates.
- File uploads and booking-confirmation storage.

---

## 8. Done when

- All tables exist in `usa` with RLS on and no security advisors firing.
- Seed data loads and the Overview, Itinerary, Bookings, Places, Costs and Checklist
  screens all render it.
- A flight, an accommodation, a transport item, a place and an itinerary item can each
  be added, edited and deleted from the UI.
- The GBP/USD toggle works and GBP-denominated items correctly ignore it.
- The cost summary totals match the seeded data when checked by hand.
- It's live and working at `app.chris-mcmillan.co.uk/usa`.
