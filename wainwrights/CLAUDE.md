# Wainwrights tracker (`/wainwrights`)

Production is `wainwrights/` (served from `main`); work happens in
`wainwrights/beta/` and is not copied to production until Chris says so.

**As of 2026-10-31, production equals beta.** Every file in `beta/` was copied
into `wainwrights/` (PR #19), so the planner, hosted hikes, Instagram Story
sharing and direct AllTrails links are live. The one deliberate difference:
production's `leaderboard.html` has no "beta" badge on the heading. `beta/` is
kept as the working area for the next round of changes. The section headings
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

## Planner sorting (`beta/planner.js`) — 2026-10-31

"Sort by" under the planner controls: Best match (the default scored ranking),
Walking distance, Driving distance (drive miles from the saved area), Elevation
gain. A button beside it flips direction (shortest/nearest/least climb first by
default). Walks with no drive data sort last for the driving sort. Changing sort
resets "Show all". The control hides in weekend-pair mode, which always uses best
match (`rankFor(day, false)`).

## PWA basics (`beta/` only) — 2026-10-31

Installable app shell, built in `beta/` and **not in production yet**. All paths are
relative, so the manifest's scope and the service worker's scope are `beta/` and it
cannot affect `wainwrights/`.

- **Files:** `beta/manifest.webmanifest` (name "The Wainwrights (beta)", standalone,
  `start_url ./index.html`), `beta/sw.js`, `beta/pwa.js` (registers `sw.js`), and
  `beta/offline.html`, and `beta/icons/` (`icon.svg` source, `icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`, `apple-touch-icon.png`; the logo from the sign-in screen,
  paper on forest green, kept inside the maskable safe zone). The five pages carry the
  manifest / theme-colour / icon / `pwa.js` tags in `<head>`; `shared-auth.js` is
  untouched.
- **Service worker:** same-origin GETs inside `beta/` only, network first, shell
  precached on install (`CACHE` is `wainwrights-beta-v2`). Supabase, Open-Meteo,
  postcodes.io, Google Fonts and the supabase-js CDN are never intercepted or cached.
  Cache keys drop the query string and fragment, so a hike's share token
  (`hike.html?t=...`) is never stored. Bump `CACHE` in `sw.js` when the shell list changes.
- **Offline:** a page load with no connection shows `offline.html` ("You're offline",
  Try again, reloads itself when the connection returns) rather than a cached page,
  because the app can't sign in or load anything without Supabase (and supabase-js comes
  from a CDN), so a cached page only showed a broken sign-in screen. Scripts, styles and
  icons still come from the cache. No push notifications or background sync.
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
- **To promote:** copy the files, icons and `offline.html` up and rename the manifest `name`
  (drop "(beta)"); rename the cache prefix in `sw.js` (`wainwrights-beta-`) too.
  The Auth redirect list already covers `/wainwrights/**`.
- Tested in headless Chromium: worker activates with scope `beta/`, manifest and every
  icon load, 23 shell entries cached with no query strings or cross-origin URLs, the old
  v1 cache is deleted, `index`, `planner` and `hike?t=...` show the offline page when
  offline and reload when back online, a production page is not controlled, and the
  install chip and popup work on all five pages for iPhone, Android and desktop Chrome
  (simulated install prompt: button calls `prompt()` and closes the popup; Esc, backdrop
  and Close all close it; no chip when standalone or on production). Not tested: the real
  install flow on a phone.
