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
  labelled as such on the page. Walking time is Naismith (3 mph + 1 h per 600 m).
- **Suggested walks (every other fell):** fells not on a named round are each
  assigned to their nearest car park in `PLANNER_BASES` (≈60 valley bases),
  or to the one named in `PLANNER_BASE_OVERRIDES` where straight-line nearest
  is the wrong side of a ridge. Fells sharing a base are chained greedily
  (hops ≤ 2 mi, loop ≤ 13 mi, ≤ 5 summits). Distance = straight-line loop ×
  1.3; ascent = base → highest summit + an allowance per extra summit.
  Named rounds use `PLANNER_ALLTRAILS_NAMED` (by route id) the same way, keeping
  their original guide as a second "Route guide" link. Each suggested walk is
  matched to a real AllTrails route
  (`PLANNER_ALLTRAILS`, keyed by the walk's highest fell, found via the
  AllTrails search 2026-10-29): its distance, ascent, route type and link
  replace the estimate. The AllTrails route may include extra summits or skip
  one of the walk's fells, so the card names it. A walk with no entry falls
  back to the estimate, shown with "~" and an "estimates" note. Changing the
  bases or overrides can change a walk's highest fell — re-check the matches. Result: 17 named + ~62
  suggested walks covering all 214 fells. Fix a bad suggestion by adding an
  override, not by editing the algorithm.
- **Results:** top 8 for the chosen day, then "Show all N walks". Every card
  has a Google Maps directions link to its parking spot.
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

## AllTrails links on the tracker (`beta/`) — 2026-10-30

Each fell's "Routes" link and each route pop-up's "AllTrails →" link now go
to a specific AllTrails trail page, not a Google search. (A link to an
AllTrails *search* gets taken over by the AllTrails app, which drops the
query; trail pages open properly. That was why it went via Google before.)

- **Per fell:** `alltrails: {name, url}` on every fell in `beta/fells-data.js`
  (all 214). Chosen as a real AllTrails route whose name includes that fell —
  mostly reused from the planner's matches, the rest found by AllTrails
  search. Six planner matches that only shared a name with a different fell
  (Raise, White Side, Hart Crag, High Pike (Scandale), Harter Fell (Mardale),
  Red Pike (Wasdale)) were replaced with the right fell's route. Rampsgill
  Head and Red Pike (Wasdale) use routes that cross them without naming
  Rampsgill Head. A fell with no `alltrails` falls back to the Google search.
- **Per named route:** `ROUTE_ALLTRAILS` (route id → URL) at the end of
  `beta/fells-data.js`, same routes as `PLANNER_ALLTRAILS_NAMED`. Keep the two
  in step if one changes.
- Production `wainwrights/fells-data.js` and `tracker.js` are untouched.

## Hosted hikes (`beta/hike.html`) — 2026-10-31

A user hosts a walk from the planner ("Host this walk" on any walk card), shares a
link, approves each request, then ticks the fells for everyone who came.
Migrations: `20261031150000_wainwrights_hosted_hikes.sql` plus
`20261031151500_wainwrights_hosted_hikes_fix_url_regex.sql` (the first
`create_hike` used a regex repetition above Postgres's 255 cap; the second is
the corrected function — never rewrite an applied migration, add another).

- **Access model:** link-only (random 32-char `share_token`), sign-in required.
  Before approval a visitor sees title, route, date, area, spaces, forecast; the
  parking pin and host contact live in `hike_private` and are returned only to
  the host and approved attendees. Clients have SELECT only on the `hike*`
  tables; **every write is a SECURITY DEFINER function** (`create_hike`,
  `request_hike_place`, `decide_hike_request`, `remove_hike_attendee`,
  `withdraw_hike_place`, `edit_hike`, `cancel_hike`, `complete_hike`,
  `undo_hike_ticks`, `report_hike`, `unblock_hiker`) that checks the caller.
  `get_hike_by_token` is the one read the page uses; it decides what the caller
  may see. RLS helpers live in the unexposed `private` schema so policies on
  `hikes` and `hike_attendees` can't recurse through each other.
- **Joining:** host approves each request; spaces cap approvals (re-checked
  under a row lock). A hike tied to a team auto-approves approved team members.
  Hosts can remove and block (`host_blocks`); a blocked user's request is
  silently declined. Declined/removed people can't re-request.
- **Tick for everyone (`complete_hike`):** only after the start time (and within
  14 days), only for approved attendees the host selects, only with an explicit
  `confirmed` flag (the page's "I confirm everyone ticked was on this walk"
  box). It writes into `checkbox_states` for those people plus the host, ticking
  only fells they don't already have, and records exactly those in `hike_ticks`.
  Each walker is notified and can `undo_hike_ticks`, which unticks only what the
  hike added. Fell names are validated against `fell_heights` when the hike is
  created, so a hand-crafted snapshot can't tick arbitrary rows.
- **Weather and safety:** hike page shows the Open-Meteo summit forecast for the
  hike day (within 7 days; thresholds: gust ≥35 mph, rain ≥3 mm or feels ≤ -2 °C
  = "Take care"; gust ≥45, rain ≥8 or feels ≤ -8 = "Poor"), an MWIS link, and
  nudges the host to cancel when it's marginal/poor within 48 h. Hosts and
  joiners both must tick a safety acknowledgement (stored: `host_ack_at`,
  `safety_ack_at`). Report button writes to `hike_reports` (no client read
  policy on purpose — read it with SQL).
- **Email:** Edge Function `hike-notify` (verify_jwt false, authenticates the
  caller itself) sends unsent `hike_notifications` for one hike through Resend,
  called by the page after each action. Secrets on walking-up-hills:
  `RESEND_API_KEY`, `HIKE_FROM_EMAIL` (set by hand — the dashboard-assisted
  secret flow was paused by Supabase), optional `SITE_URL`. Emails carry the
  message and a link only — never the pin or contact. Claim-then-send, 3 tries.
  If the page's call fails, emails wait until the next action on that hike
  (notifications older than 3 days are not sent); a scheduled sweeper would be
  the fix if that ever matters.
- **Sign-in round trip:** the magic link returns without the query string, so
  `hike.js` keeps the token in sessionStorage for 15 minutes and restores it.
  Visit `hike.html?list=1` for the "my hikes" list (nav link).
- **Tested:** SQL level in a rolled-back transaction with simulated users
  (stranger vs approved vs declined vs host, full hike, ack and confirmation
  refusals, anon refused, tick + undo leaving the walker's own ticks alone);
  page level with Playwright against a mocked Supabase. Not yet tried with two
  real accounts or a real Resend send — do that before telling anyone.
- **Not built (by choice):** waitlist, public listing, postponing as its own
  status (edit the time instead), a scheduled forecast check.
