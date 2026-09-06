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

**No auth in this release.** Every table has a nullable `user_id uuid` column (unused)
and RLS enabled with a permissive policy for the anon key, marked
`-- TODO: tighten when auth lands`. Don't build sign-in for this app yet.

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

## Trip decisions

`docs/` is this app's memory. `docs/usa-trip-spec.md` is the original build brief.
`docs/trip-decisions.md` records decisions made after that — accommodation choices,
routing rationale, anything not obvious from the schema. Add to it as decisions are
made; don't let that context live only in a chat transcript.
