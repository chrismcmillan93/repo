# Wainwrights tracker (`/wainwrights`)

Production is `wainwrights/` (served from `main`); work happens in
`wainwrights/beta/` and is not copied to production until Chris says so.
Backend is its own Supabase project, **`walking-up-hills`** (ref
`jyxtduvkmztexwurrjsf`, eu-west-2) — not `dashboards-new`. Its migrations and
Edge Functions live under `wainwrights/supabase/`, separate from the repo-root
`supabase/` folder (which is `dashboards-new`'s).

Progress lives in `public.checkbox_states` (`dashboard_id = 'wainwrights'`,
`item_id` = the fell's name). An unticked fell may have no row at all.

## Fell planner (`beta/planner.html`) — 2026-10-29

Ranks walks for a chosen day (next 7 days) by: unclimbed fells on the walk,
the Open-Meteo forecast for the walk's highest summit (09:00–16:00, wind in
mph), drive time from the user's area, and whether the walk fits between
sunrise and sunset. Weekend-pair mode picks a Saturday + Sunday pair with
starts within 12 miles (car-camping weekend).

- **Walks:** `beta/planner-walks.js`. Fells come from each fell's `routes`
  array in `fells-data.js`; this file adds start point, miles, ascent, and a
  copy of the label/link from `ROUTES` in `tracker.js` (private there).
  Start points, distance and ascent are typical rounded figures, not GPX —
  labelled as such on the page. 17 walks today; coverage is shown on the
  page. Walking time is Naismith (3 mph + 1 h per 600 m).
- **Location (privacy):** user chooses full postcode or district only. The
  browser looks it up on postcodes.io and saves only a point snapped to a
  ~1 mile grid plus the district (e.g. `PR2`) to `planner_user_location`
  (owner-only RLS). The postcode itself is never stored. Remove deletes the
  row, and a trigger clears that user's cached drive times.
- **Drive times:** Edge Function `drive-times` (openrouteservice matrix,
  secret `ORS_API_KEY`). Origin is always read server-side from the saved
  location, never from the request; start points are limited to a Lake
  District box and 80 per call. Cached in `planner_drive_times` per user and
  reused until the saved point changes. Deployed with `verify_jwt = false`
  because the function authenticates the caller itself (`auth.getUser`) and
  this project uses the new publishable/secret API keys. Until the secret is
  set — or if ORS fails — the page falls back to straight-line × 1.35
  estimates, labelled "estimate".
- Tested with Playwright against mocked Supabase, Open-Meteo and postcodes.io
  responses: ranking, saving a location (confirmed no postcode in the
  payload), weekend pair, remove. Not yet tested against the live services.
