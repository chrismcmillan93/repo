# Wainwrights tracker (`/wainwrights`)

Production is `wainwrights/` (served from `main`); work happens in
`wainwrights/beta/` and is not copied to production until Chris says so.

**As of 2026-11-01, production equals beta except for the items below.** Beta was copied
into `wainwrights/` in stages (PR #19, then the PWA / launch-speed work, then the Instagram
change), so the planner, hosted hikes (with the WhatsApp link and Instagram on requests),
Instagram Story sharing, direct AllTrails links and the installable app are live.
**Not promoted yet:** the planner's "use Directions on the AllTrails route" note under each
walk's Maps link and the matching footnote (`planner.js`, `planner.html`; beta PR #31).
**Three deliberate differences** (keep them when promoting again, i.e. copy, then
re-apply): production's `leaderboard.html` has no "beta" badge on the heading;
`manifest.webmanifest` is named "The Wainwrights" (beta: "The Wainwrights (beta)");
and `sw.js` uses the cache name `wainwrights-prod-v1` / prefix `wainwrights-prod-` (beta:
`wainwrights-beta-v4` / `wainwrights-beta-`). `beta/` is kept as the working area for the
next round of changes. The section headings
below say `beta/...` because that is where each feature was built; the same
files now also exist in `wainwrights/`. The `SITE_URL` secret for `hike-notify`
was set to `https://app.chris-mcmillan.co.uk/wainwrights` on 2026-10-31, so hike
emails link to production (the function's built-in default is still the beta URL
if the secret is ever removed).

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
- **Results:** top 8 for the chosen day, then "Show all N walks". Every card has a Google
  Maps directions link to its parking spot, plus (added 2026-10-31) a short note under it:
  "This parking point is approximate. For exact parking and driving directions, use
  Directions on the AllTrails route" (linking to the walk's AllTrails route; a walk with no
  AllTrails match gets "Check the route guide for exactly where to park" instead, though
  all 79 currently match). The page footnote says the same. The start points are typical
  car parks written from general knowledge, not AllTrails' trailheads, so the pin and the
  drive times (measured to those start points) are approximate.
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
- **Start points vs AllTrails trailheads (checked 2026-10-31, not applied).** The AllTrails
  tools give no trailhead coordinates, and `alltrails.com` itself is behind DataDome bot
  protection (403 + JS challenge), so pages can't be read automatically. What *does* work:
  `find_trails_near_location` returns `trail_head_distance_meters` (straight-line distance
  from the search point to the trailhead), and a length filter (`filters.length`, the
  route's exact `length_meters`) leaves just that route in the result. Four searches from
  points ~1.5-2 km N/E/S/W of the current start, solved by least squares, gave positions
  with residuals under 5 m and a 3 m shift when one reading was dropped. Three samples:
  Seat Sandal Circular (id 11248355) 54.49063, -3.03622 (the `dunmail` base is 1.25 mi
  away); Kentmere Horseshoe Circular (11016028) 54.42835, -2.83665 (current start 0.18 mi
  away); Wasdale Head and Scafell Pike Circular (10432915) 54.46541, -3.25650 (current
  "Wasdale Head NT car park" start is 1.46 mi away, so some estimates are well off). Doing
  all 76 routes would take about 300 searches (4 per route) and gives coordinates only, no
  AllTrails start names. If this is done later: give each walk its own start (never edit
  `PLANNER_BASES` for it), use a new key per distinct coordinate such as `at-<trailId>`
  (never reuse an old key with new coordinates, because `planner_drive_times` is cached per
  key; delete its rows when starts change), keep keys under 60 characters and distinct
  starts to 80 per `drive-times` call, and let `planner.js` read the start from the
  walk's AllTrails entry for suggested walks.
- **Open question:** "Host this walk" still pre-fills the hike's meeting point from the
  walk's start (the host can paste a different one). With approximate starts, hosts
  should check it before sharing; consider requiring an explicit meeting point.
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
- Promoted to production on 2026-10-31 along with the rest of beta.

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
  secret flow was paused by Supabase), `SITE_URL` (production URL, see top). Emails carry the
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
- **Custom hikes (`hike.html?new=1&custom=1`, button on the "my hikes" list):** the
  host names the hike, ticks the Wainwrights it includes from a searchable list
  grouped by book (up to 30; `create_hike`'s cap was raised from 10 by
  `20261031160000_wainwrights_hosted_hikes_custom_fell_cap.sql`, which rewrites the one
  check in the live function definition), and must give a meeting point as a
  Google Maps link with coordinates or "lat, lng" (short `maps.app.goo.gl` links
  can't be read). Distance, ascent and a route link are optional. The highest
  picked fell supplies the forecast point. Same validation, safety box, approval
  and tick-for-everyone flow as planner hikes (`walk_key = 'custom'`).
- **WhatsApp group link (2026-10-31):** optional field on the create and "Edit details"
  forms. Stored in `hike_private.whatsapp_url` with the meeting point and host contact,
  so only the host and approved attendees get it (shown as a "Join the WhatsApp chat"
  button); someone with just the hike link never sees it. Only
  `https://chat.whatsapp.com/<code>` links are accepted, checked in the page (`WA_RE`)
  and again by a column check and by `set_hike_whatsapp(p_hike_id, p_url)`, a host-only,
  open-hikes-only function (empty string clears it). Migration
  `20261031180000_wainwrights_hike_whatsapp_link.sql` also re-creates
  `get_hike_by_token` with the extra key. `create_hike` / `edit_hike` were left alone
  (new parameters would leave overloads behind); the page calls `set_hike_whatsapp`
  after them, and a failed save after create just means the host re-adds it under
  "Edit details". Not emailed to anyone. Tested in a rolled-back transaction: host and
  approved attendee see it, stranger gets no `private` block, non-host and anon can't set it.
- **Instagram on requests (2026-11-01, beta and production):** the "Ask to join" form has an optional
  "Your Instagram" field, pre-filled from the person's own `leaderboard_opt_in.instagram_handle`
  if they have one (they can edit or clear it). It accepts `@name`, `name` or a pasted
  instagram.com link, is cleaned to lowercase (`^[a-z0-9._]{1,30}$`, the same rule as the
  leaderboard) and sent as `request_hike_place`'s optional 4th parameter `p_instagram`
  (`bad_instagram` if invalid). Stored in `hike_attendees.instagram_handle` (migration
  `20261101100000_wainwrights_hike_request_instagram.sql`, applied; `request_hike_place` was
  dropped and re-created with the extra defaulted parameter so the production page's
  3-argument calls still work). **Who sees it:** the host (on each request, before approving,
  as a link to instagram.com/<handle>, or "No Instagram given"; and in the Going list) and
  approved walkers ("Who's going"), nobody else: `get_hike_by_token` returns it only inside the
  host's and approved walkers' attendee lists, and the table's existing RLS policy (own row,
  host sees all, approved see approved) means pending requests' handles are never readable by
  other walkers. Not emailed, and **not** used on Story images (those still use leaderboard
  handles only, so a handle typed on a request never ends up on a public Story). Handles are
  rendered only if they match the format, as `target=_blank rel="noopener noreferrer"` links.
  Tested in a rolled-back SQL transaction (host, requester with/without handle, bad handles,
  approved walker, pending requester, stranger, anon, old 3-argument call) and in the page
  with mocked Supabase. Promoted to production the same day (`hike.js` and `shared.css`
  copied up); the database change is backwards compatible, so the order didn't matter.
  Tooling note: the Supabase connector asks for confirmation before running statements such
  as `DROP FUNCTION`; if the prompt isn't answered the call times out.
- **Share text and calendar entry (2026-11-01, beta):** the host's "Share…" button now sends
  "Join me on a hike: <title> — Wed 4 Nov, 08:30 · <area>" with the link (the share sheet is
  what shows as the preview). "Copy link" is still just the link. "Add to calendar" (host's
  share card while the hike is open; approved walkers' "You're in" note) downloads an `.ics`
  built in the page (`hikeIcs` in `beta/hike.js`): title, start time in UTC, a flat 6 hour
  length (hikes have no end time; the description says it's an estimate), area plus meeting
  note as the location, GEO from the meeting point, and a description with the walk, fells,
  host, turn-back time, a Google Maps link to the meeting point, the host contact, the
  WhatsApp chat link and the hike page. Two alerts (a day and two hours before). The UID is
  `<hike id>@wainwrights`, so downloading again updates rather than duplicates. Only people
  who can already see the private details (host, approved walkers) get the button, because the
  file contains them. Lines are folded to 75 bytes and text escaped per RFC 5545; checked with
  an independent parser (ical.js). Not tested on a real phone (iOS home-screen apps in
  particular may handle downloads differently). A rich link-preview card (the picture
  WhatsApp draws when a link is pasted) is not built: it would need a small public preview
  function and would show the title and date to anyone holding the link.
- **Not built (by choice):** waitlist, public listing, postponing as its own
  status (edit the time instead), a scheduled forecast check.

## Instagram Story sharing (`beta/story.js`) — 2026-10-31

Three 1080×1920 canvas images in the app's paper-grid look, shared through the
Web Share API (files) with a download fallback. A website can't open Instagram's
Story composer or add link stickers, so the person picks Instagram in the share
sheet (or saves the image and adds it from photos). Content stays out of the
top/bottom ~250px that Instagram covers; footer is the app name only.

- **Today's ticks** (tracker "Share today's fells", shown only when something was
  ticked today): reads `checkbox_states.ticked_at >= local midnight`. `ticked_at`
  is set by trigger `private.set_ticked_at` (migration
  `20261031170000_wainwrights_story_sharing.sql`) on insert/update when a
  wainwrights row becomes checked, null when unchecked — so it also covers
  `complete_hike`. Ticks made before 2026-10-31 have no date and can't appear.
- **Hosted hike** (hike page, host or approved attendee, not cancelled): title,
  date, fells, miles/ascent, and walkers' display names plus @handles. Names and
  handles come from `hike_story_people(hike_id)` (SECURITY DEFINER, authenticated
  only, host/approved attendees only; after the host confirms attendance only
  those who attended). Handles are `leaderboard_opt_in.instagram_handle`; people
  without one show a name only.
- **Team** (leaderboard, "Share team to Instagram Story"): union fells/%, total
  elevation, full member list from `team_summary` + `team_leaderboard`.
- Tested: trigger and `hike_story_people` access in rolled-back SQL; image layout
  rendered in headless Chromium; existing page tests still pass. The share sheet
  itself needs a real phone.
- **Hike invite** (hike page "Instagram Story" card, host only, open and not yet started; the card shows both stories, with the invite greyed out once the walk starts and "After the walk" greyed out until it does): "Share the invite" draws
  Instagram Story" draws a "Join me on a hike" card (title, date, fells, distance,
  host, area, places left, start time) and copies the hike link to the clipboard so
  it can be added as a Link sticker in the empty middle of the image. The link is
  the access token, so it is never printed on the image; no meeting point appears.

## Word filter and admin (2026-11-01; database live, page changes beta)

Added after the app opened up to more sign-ups: stop people filling names, handles and hike text
with rubbish, and give the owner a way to remove things that are wrong or malicious. Migrations
`20261101120000_wainwrights_word_filter.sql` and `20261101130000_wainwrights_admin.sql`, both
applied to walking-up-hills. The database side is live for everyone, **production pages included**.

**Word filter (enforced by database triggers, so it can't be bypassed from the browser)**
- Covers display names (`leaderboard_opt_in`, `profiles`), Instagram handles (`leaderboard_opt_in`,
  `hike_attendees`), team names, and hike title, area, status note, meeting-point note and the
  message to the host. Not covered: hike contact details, report reasons, the walk itself.
- Only values being inserted or *changed* are checked, so a row already holding a bad value can still
  be updated for other reasons. At the time it went live nothing existing was flagged.
- The lists live in `private.blocked_words` (mode `word` = whole token only, `substring` = also inside
  longer words, for the strongest words only) and `private.allowed_words` (real names and places that
  contain a blocked string: Scunthorpe, Cockermouth, Twatt, "Great Cockup" passes because only whole
  tokens are matched for `cock`, therapist...). Matching lower-cases, maps look-alikes (0 o, 1 i, 3 e,
  4 a, 5 s, 7 t, 8 b, @ a, $ s, ! i, | l), and tolerates stretched spellings (`fuuuck`). Names, handles
  and team names are also checked with separators removed ("f.u.c.k"); free text is not (a spaced
  "f u c k" in a message gets through). 53 examples (blocked and allowed) were tested locally and
  against the live schema in a rolled-back transaction. No filter is perfect: add words / allow-list
  entries from the Admin page when something is wrongly blocked or slips through.
- The refusal message is readable on purpose ("That contains a word that isn't allowed here. Please
  change it."), so older pages that print the database's error text show it as it is. The tracker's
  name prompt used to ignore errors; it now stays open and shows the message.

**Admin**
- An admin is a row in `public.app_admins`, added **by hand with SQL only** (no function or page can add
  one): `insert into public.app_admins (user_id) select id from auth.users where lower(email) = '...';`.
  The owner's account was added that way on 2026-11-01. The email is deliberately not in this public repo.
  Remove with `delete from public.app_admins where user_id = ...`.
- Every `admin_*` function starts with `private.require_admin()` (raises `not_admin`) and writes to
  `public.admin_log` (who, what, and the values it replaced). `app_admins`, `admin_log` and
  `suspended_users` have RLS on and no client access.
- Powers: cancel a hike with a reason (soft: everyone going is told) or delete it permanently (the log
  keeps a snapshot); remove a person from a hike (can't ask again); clear a person's name ("Walker"),
  Instagram handle, or remove their leaderboard entry; delete a team; read and dismiss hike reports
  (`hike_reports.dismissed_at`); suspend / unsuspend a user; edit the blocked and allowed word lists.
- **Suspended** users are hidden from the leaderboard (`wainwright_leaderboard()` has one extra
  condition) and cannot create hikes, ask to join (or auto-join) hikes, or create teams. They can still
  sign in and use their own tracker. A host approving an *earlier* request from someone since suspended
  is not blocked. Admins can't be suspended.
- **Admin page:** `beta/admin.html` + `beta/admin.js` (tabs: Hikes, People, Teams, Reports, Word filter,
  Log). It asks `am_i_admin()` every time and shows "This page is for admins." otherwise; all the real
  checks are in the database. After a successful check it sets `localStorage.ww_admin`, which makes
  `pwa.js` add an "Admin" link to the top bar; that flag is only a convenience (anyone can set it, and it
  then does nothing). Everything from the database is escaped as text; Instagram handles only become
  links if they match the handle format. Tested with mocked data (34 checks) including hostile
  names and titles.
- Not promoted to production yet (beta only): the admin page, the Admin link, the readable messages on
  the hike page, and the tracker name-prompt message. Until then production pages show the filter's
  message in their own error styles (the leaderboard, team form and join form already print it; the
  hike page prefixes "Something went wrong:"; the tracker name prompt closes silently).
- Not built: email or push alerts when a report is filed; an "undo" for permanent deletes (the log keeps
  the details, not the data).

## Planner sorting (`beta/planner.js`) — 2026-10-31

"Sort by" under the planner controls: Best match (the default scored ranking),
Walking distance, Driving distance (drive miles from the saved area), Elevation
gain. A button beside it flips direction (shortest/nearest/least climb first by
default). Walks with no drive data sort last for the driving sort. Changing sort
resets "Show all". The control hides in weekend-pair mode, which always uses best
match (`rankFor(day, false)`).

## PWA (beta and production) — 2026-10-31

Installable app shell, built in `beta/` and promoted to `wainwrights/` the same day. All
paths are relative, so each copy's manifest scope and service worker scope is its own
folder. They are **separate installs and separate workers**: the production worker
(`/wainwrights/`) and the beta one (`/wainwrights/beta/`, the more specific scope, so beta
pages keep using it). Cache Storage is shared across the whole origin, so the two use
different cache namespaces (`wainwrights-prod-*` and `wainwrights-beta-*`) and each
worker only ever deletes its own. Do not give them a common prefix, or one would delete
the other's cache. The text below describes `beta/`; production is the same apart from
the three differences listed at the top of this file.

- **Files:** `beta/manifest.webmanifest` (name "The Wainwrights (beta)", standalone,
  `start_url ./index.html`), `beta/sw.js`, `beta/pwa.js` (registers `sw.js`), and
  `beta/offline.html`, and `beta/icons/` (`icon.svg` source, `icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`, `apple-touch-icon.png`; the logo from the sign-in screen,
  paper on forest green, kept inside the maskable safe zone). The five pages carry the
  manifest / theme-colour / icon / `pwa.js` tags in `<head>`; `shared-auth.js` is
  untouched.
- **Service worker (cache first, checked in the background):** same-origin GETs inside
  `beta/` plus an allow-list of public third-party libraries/fonts (supabase-js on jsDelivr,
  Google Fonts) are served from the cache immediately (`CACHE` is `wainwrights-beta-v4`).
  This replaced network first on 2026-10-31 because a cold start from the home screen (app
  closed, not just backgrounded) waited on the network for every file and was very slow on
  an iPad; with a 400 ms-per-request test server a relaunch went from about 880 ms to about
  70 ms. Supabase API calls, Open-Meteo, postcodes.io and everything else are never
  intercepted or cached. Same-origin cache keys drop the query string and fragment, so a
  hike's share token (`hike.html?t=...`) is never stored.
- **Staying current:** after serving any page load, the worker checks *every* shell file
  against the server in the background (`cache: "no-cache"`, so a tiny 304 when unchanged;
  not more than once per 30 s). Changed files are saved and the page is told
  (`postMessage {type: "update-ready"}`); `pwa.js` then shows a small "New version ready
  - Reload" bar (dismissable) and one tap loads the new version. A new worker (a bumped
  `CACHE`) sends the same notice from its `activate`. The launch never waits on any of
  this. So after a deploy the first launch still shows the previous version, but with the
  bar; the next one has the new files. This is about the *app's files*, not user data,
  which always comes live from Supabase. Bump `CACHE` when the shell list changes, and add
  new shell files to `SHELL` in `sw.js` or they won't be precached or checked.
- **Offline:** because pages now load from the cache, `pwa.js` covers the page with a
  "You're offline" notice (Try again; reloads itself when the connection returns) when a
  page loads with `navigator.onLine === false`, so the shell never looks like lost
  progress. It is not shown if the connection drops mid-session. `offline.html` is the
  service worker's fallback when a page isn't cached and the network fails. Not covered:
  "connected but no internet" (the shell loads and Supabase calls fail). No push
  notifications or background sync.
- **Install help (all pages, top bar):** a small "Install app" chip next to the wordmark,
  added by `pwa.js` (no per-page markup). It opens a popup (the app's `terms-modal` style;
  Close, Esc, backdrop click, focus kept inside, focus returned to the chip) with
  instructions for the device: a real **Install app** button when the browser offers one
  (`beforeinstallprompt`, Chrome/Edge/Android), Share -> Add to Home Screen steps on
  iPhone/iPad, menu steps on Android, File -> Add to Dock on Safari for Mac, a hint
  otherwise. The chip is not added when opened as an installed app (`display-mode:
  standalone` / `navigator.standalone`) and is hidden after `appinstalled`. It lives in the
  signed-in view's top bar, so it is not on the sign-in screen. Styles: `.install-chip`
  and `.install-modal` in `beta/shared.css`. (It was a collapsed card above the tracker
  footer until 2026-10-31.)
- **Launch diagnostics (added 2026-10-31 for a slow cold start on an iPad):**
  - *Timing readout:* tap "THE WAINWRIGHTS" (or the sign-in title) 5 times in a row (the
    install chip doesn't count) and `pwa.js` opens a "Timing" panel with a Copy button.
    It lists, from the start of that page load: service worker started, page received,
    first paint, first contentful paint, `pwa.js` ran, DOM ready, app shown (signed in),
    fell list rendered, everything loaded; the 5 slowest files (and whether they came from
    the cache); and the last 6 launches (kept in `localStorage` `ww_perf_log`, saved 4 s
    after load; `app`/`web` = installed or browser, `sw`/`NO-sw` = worker controlling).
    It can't see the OS's own launch screen before the page starts.
  - *Why a white screen:* the Google Fonts stylesheet was render-blocking, so a slow or
    hung request left the screen white (simulated: first paint 2,596 ms with a 2.5 s fonts
    request, 76 ms after the fix). It is now loaded with `media="print" onload="this.media='all'"`
    (plus a `<noscript>` fallback); the `display=swap` in its URL keeps text visible in a
    fallback font until it arrives. Each page also has `<style>html{background:#e8e2d0}</style>`
    in `<head>` so the first paint is paper-coloured, not white.
  - Ruled out by measurement: device speed (with the CPU slowed 6x the fell list still
    renders in about 1.4 s) and the service worker (about 70 ms to relaunch).
- **Promoting again:** copy every file in `beta/` (including `icons/`, `offline.html`,
  `sw.js`, `pwa.js`, `manifest.webmanifest`) up with `cp`, then re-apply the three
  differences at the top of this file. If you add a file to `SHELL` in `sw.js`, copy it up
  too. Bump `CACHE` in the worker you changed so users get the "New version ready" bar.
  The Auth redirect list already covers `/wainwrights/**`. Emailed hike links
  (`SITE_URL`) now fall inside the production app's scope, so Chrome on Android and desktop
  can open them in the installed app; iOS can't (no link capture for home-screen apps).
- Tested in headless Chromium: worker activates with scope `beta/`, manifest and every
  icon load, 25 entries cached (shell plus supabase-js and Google Fonts CSS) with no query strings
  or tokens on same-origin keys, old caches deleted, `index` and `hike?t=...` show the
  offline notice when offline and reload when back online, relaunch stays at about 70 ms
  with the background check running, unchanged files revalidate as 304s, a changed file
  or a new worker makes the update bar appear and Reload loads the new version, a production page is not controlled, and the
  install chip and popup work on all five pages for iPhone, Android and desktop Chrome
  (simulated install prompt: button calls `prompt()` and closes the popup; Esc, backdrop
  and Close all close it; no chip when standalone or on production). Not tested: the real
  install flow on a phone.
