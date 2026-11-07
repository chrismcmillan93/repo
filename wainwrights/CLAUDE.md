# Wainwrights tracker (`/wainwrights`)

## Address and hosting (moved 2026-11-07)

**The live app is now `https://wainwrights.walkinguphills.co.uk`** on **Azure Static Web Apps** (Free plan; app
`wainwrights-tracker-app`, resource group `wainwrights-tracker-app_group`, default host
`red-sand-0d5dca410.3.azurestaticapps.net`). The `wainwrights/` folder is the site root, so `/wainwrights/x` became `/x`
and the beta is `/beta/`. DNS is a single CNAME at GoDaddy (`wainwrights` to the default host); Azure issues and renews the
certificate itself. Paths in the app are all relative, so nothing inside it knows the address.

- **Deploys:** `.github/workflows/azure-static-web-apps-wainwrights.yml` (the only workflow in the repo) runs on pushes to
  `main` that touch `wainwrights/**`, with no build step. Secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`. (The portal also created
  `AZURE_STATIC_WEB_APPS_API_TOKEN_RED_SAND_0D5DCA410`; nothing uses it, delete it.) Other apps in the repo stay on GitHub Pages.
- **Config:** `wainwrights/staticwebapp.config.json` (no-cache on everything except `/icons/*`, security headers, manifest
  type, 404 for `/supabase/*` and `/CLAUDE.md`, `404.html`). Known: the `/beta` to `/beta/` redirect rule doesn't fire, so a
  bare `/beta` serves the beta page with relative links resolving against `/`; normal links all use `/beta/`.
- **Old address:** `app.chris-mcmillan.co.uk/wainwrights/...` is still served by GitHub Pages from the same files. Every page
  has an inline script in its head that, only when the hostname is `app.chris-mcmillan.co.uk`, forwards to the same path on
  the new domain keeping `?query` and `#hash` (so old hike share links and magic-link returns land correctly). It does nothing
  on the new domain, so there is no loop. **Keep it in every page when promoting beta to production** (it is in `beta/` too).
  Installed copies on the old address update on their next online launch and then forward.
- **A new address is a new site to browsers:** everyone signs in once more and reinstalls the phone app; the emergency-card
  details and saved GPS fix on a device don't carry over.
- **Supabase (walking-up-hills):** Site URL and redirect URLs include the new domain (old and `*.azurestaticapps.net`
  entries kept). Function secret `SITE_URL` is `https://wainwrights.walkinguphills.co.uk`; the fallback in `hike-notify` and
  `hike-reminders` is the same address (`hike-reminders` redeployed as v8; the live `hike-notify` still has the old fallback
  until it is next deployed from the repo, harmless while `SITE_URL` is set).
- **Email:** Resend sends from `walkinguphills.co.uk` (domain verified at GoDaddy: DKIM, SPF, MX on `send`, DMARC). The sender
  is `info@walkinguphills.co.uk` (a real mailbox, but replies are deliberately not handled: the sign-in email footer says "Replies to this email are not read") for both the hike emails (`HIKE_FROM_EMAIL`) and the
  Supabase sign-in emails (custom SMTP; sender address and name set in the Supabase dashboard, see "Sign-in is code-only" below).
- **Beta:** stays a folder (`/beta/`), invited-only by the path-based gate in `beta/shared-auth.js`; its sign-in card shows a
  BETA badge. A separate beta app was considered and rejected for now (one sign-in, same promote process).
- **Rollback:** point or remove the GoDaddy CNAME; restore Supabase URL configuration and `SITE_URL`; the old GitHub Pages
  copy keeps running throughout.
- **Later:** content-security policy, tightening DMARC from `p=none`, Azure PR previews, Azure Functions/Maps for the planner.

## Sign-in is code-only (2026-11-07)

People sign in with a code emailed to them, not a link. Same Supabase Auth call as before (`signInWithOtp` then `verifyOtp` in
`shared-auth.js`); only what the email contains and how the page words it changed. Live in beta and production.

- **Why:** the first sign-in emails went to Junk on Hotmail (SPF, DKIM and DMARC all passed; the score was a reputation and content one: a brand-new
  domain, a message that was nearly all one long link to a different domain, bare HTML). Link scanners also used up single-use links before people
  clicked them (auth logs showed "Email link is invalid or has expired" within seconds of sending). A code has neither problem, and on a phone it
  is typed into the installed app instead of opening a browser tab.
- **Email template:** `supabase/email-templates/sign-in-code.html` (README beside it). **Applied by hand in the Supabase dashboard** (Authentication,
  Emails, Templates), not by any migration or tool: paste the same HTML into **both "Magic Link" and "Confirm signup"** (an existing account gets Magic
  Link, a first-time or unconfirmed address gets Confirm signup), subject `Your Wainwrights sign-in code`. It uses only `{{ .Token }}`, no link. Set
  Email OTP Length to 6 under Authentication, Providers, Email, and the SMTP sender name to `Walking Up Hills`. Template saves can take a minute
  to reach sent emails (it looked unchanged for about a minute on 2026-11-07, then worked). If the repo copy and the dashboard differ, the dashboard wins
  until someone pastes again.
- **Pages:** the button reads "Email me a sign-in code"; the "check your inbox" text says to enter the code; a "Paste code" button under the code box
  (added by `shared-auth.js`, so no per-page markup) fills the box from the clipboard (first 6 to 10 digit run) where the browser allows it. The box already has
  `autocomplete="one-time-code"` and a numeric keypad. Old emails that still contain a link keep working.
- **Still to watch:** where the new emails land on Hotmail (reputation builds slowly; mark one "Not junk"), tightening DMARC from `p=none` and adding
  an `rua` address, Microsoft SNDS/JMRP sign-up. An in-email "copy" button is not possible (email apps run no scripts).
- **Auth logs** (Supabase query_logs, `auth_logs`) show each `/otp` request as `user_recovery_requested` (that is how Supabase logs a magic-link/OTP
  email, not a password reset) and each successful code as a `login` with `login_method: otp`.

The text below was written before this move; where it names `app.chris-mcmillan.co.uk/wainwrights`, read the new address.

Production is `wainwrights/` (served from `main`); work happens in
`wainwrights/beta/` and is not copied to production until Chris says so.

**As of 2026-11-06, production equals beta except for the three differences below.** Beta was copied
into `wainwrights/` in stages (PR #19, then the PWA / launch-speed work, then the Instagram
change), so the planner, hosted hikes (with the WhatsApp link and Instagram on requests),
Instagram Story sharing, direct AllTrails links and the installable app are live.
**Nothing is waiting to be promoted** (the OS map, Where am I?, live hike pins, difficulty grades, community heat map and emergency card went up last, 2026-11-06; see the sections at the end for what still needs switching on).
**Three deliberate differences** (keep them when promoting again, i.e. copy, then
re-apply): production's `leaderboard.html` has no "beta" badge on the heading;
`manifest.webmanifest` is named "The Wainwrights" (beta: "The Wainwrights (beta)");
and `sw.js` uses the cache name `wainwrights-prod-v9` / prefix `wainwrights-prod-` (beta:
`wainwrights-beta-v12` / `wainwrights-beta-`). `beta/` is kept as the working area for the
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
- **Sign-in round trip (historical; sign-in is code-only since 2026-11-07, but old emailed links still work):** the magic link returns without the query string, so
  `hike.js` keeps the token in sessionStorage for 15 minutes and restores it.
  Visit `hike.html?list=1` for the "my hikes" list (nav link).
- **Tested:** SQL level in a rolled-back transaction with simulated users
  (stranger vs approved vs declined vs host, full hike, ack and confirmation
  refusals, anon refused, tick + undo leaving the walker's own ticks alone);
  page level with Playwright against a mocked Supabase. Not yet tried with two
  real accounts or a real Resend send — do that before telling anyone.
- **Custom hikes (`hike.html?new=1&custom=1`, button on the "my hikes" list):** the
  host names the hike, ticks the Wainwrights it includes from a searchable list
  grouped by book (up to 50 since 2026-11-07; `create_hike`'s cap was raised from 10 to 30 by
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
- **Share text and calendar entry (2026-11-01, beta and production):** the host's "Share…" button now sends
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
- **Reminder emails, the day before (2026-11-01, live; works for beta and production hikes alike):**
  everyone on an open hike (the host and approved walkers; not pending, declined or removed people) is
  emailed "Reminder: your hike is tomorrow" at the first hourly run from **10:00 UK time** on the day
  before the hike's UK date. Migration `20261101140000_wainwrights_hike_reminders.sql` and Edge Function
  `supabase/functions/hike-reminders/index.ts` (verify_jwt false, shared-secret auth). How it fits together:
  pg_cron job `hike-reminders-hourly` (minute 5) runs `private.queue_hike_reminders()`, which inserts one
  `hike_notifications` row per person (kind `'reminder'`, so it also shows in the app's notifications), then
  calls the Edge Function through pg_net **only if a reminder is waiting** (this doubles as the retry for
  failed sends). The function claims unsent reminders, sends via Resend (same secrets as `hike-notify`:
  `RESEND_API_KEY`, `HIKE_FROM_EMAIL`, `SITE_URL`), 3 attempts, and ignores reminders older than 12 hours so
  nothing arrives late. Emails carry the text and a link, never the meeting point or host contact.
  - **Auth for the cron call:** there's no signed-in user, so the job sends `x-reminder-secret`, a random
    value generated by the migration and stored in `private.reminder_config` (not in the repo);
    `public.reminders_secret_ok(text)` compares it and is executable by `service_role` only. To rotate it:
    `update private.reminder_config set secret = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');`
    (the cron command reads it each run, nothing else to change).
  - **Rules:** one reminder per person per hike ever (partial unique index
    `hike_notifications_one_reminder`), so changing a hike's time later does not send a second one; a
    hike created or joined after 10:00 the day before still gets its reminder at the next hourly run;
    cancelled hikes and hikes already started are skipped; "tomorrow" is the **Europe/London** date, so
    it is right across the clock changes.
  - **Tested** in a rolled-back transaction with `p_now` set to chosen moments (before/at 10:00, an hour
    later, a late joiner, pending/declined people, a cancelled hike, a hike two days away, the day the
    clocks went back, a summer hike at 09:59/10:00 BST), and the deployed function from the database:
    wrong or missing secret gets 401, the right secret gets `{"sent":0,"failed":0}`. **No real Resend
    send has been tried** (the next real reminder would be for the 13 Dec hike, on 12 Dec). It will also
    inherit whatever is wrong with email delivery generally (Hotmail spam; the new domain is meant to fix
    that).
  - **Push notifications later:** keep the queueing and the schedule; in `hike-reminders`, after claiming
    a reminder row, also send a push to that person's subscriptions (and send the email only if they have
    no push, if that is wanted). The `hike_notifications` row is already the unit of work.
  - **Not built:** a per-person opt-out (everyone on a hike gets it), a second "morning of" reminder.
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
- Promoted to production (`wainwrights/admin.html`, `admin.js`, the Admin link in `pwa.js`, the readable
  messages in `hike.js`, the tracker name-prompt message, admin CSS; production `sw.js` is
  `wainwrights-prod-v2` with the admin files in SHELL). Production `hike.js` first got only the error-message
  change from beta; the calendar/share changes followed the same day (see Hosted hikes).
- **Admin link and admin mode (2026-11-01, beta and production).** `shared-auth.js` asks `am_i_admin()` once
  per page load after sign-in and sets or clears `localStorage.ww_admin`, so the "Admin" link in the top bar
  (`pwa.js`, exposed as `window.wwAdminLink`) appears for an admin without a prior visit to `admin.html`, and
  disappears if someone stops being one. **Admin mode** is a guard against slips: the admin page opens
  read-only ("Admin mode is off" banner, buttons dimmed) and any change (cancel/delete, remove, clear,
  suspend, team delete, dismiss, word lists) is refused in the page until "Switch on" is pressed. It is
  stored as `localStorage.ww_admin_mode_until` (a timestamp), lasts 15 minutes and is extended by each
  successful change; "Switch off" clears it. The link is a boxed bar between the wordmark and the menu ("Admin · mode off →", red "mode ON" while on; on the admin page itself it is not a link), built by `adminLink()` in `pwa.js` (`.admin-bar` in `shared.css`); it exists only for admins, because it is created only when `ww_admin` is set by the database check. This is
  client-side only; the database still allows an admin to call the functions (by design, it is only
  there to stop accidents). Production `sw.js` is `wainwrights-prod-v3`, beta `wainwrights-beta-v6`.
- Not built: email or push alerts when a report is filed; an "undo" for permanent deletes (the log keeps
  the details, not the data).

## Co-hosts on hosted hikes (2026-11-07) — database live, page in beta only

A host can make any **approved** attendee a co-host and pick one of three levels per person (no limit on how many). Migrations
`20261107150000_wainwrights_hike_cohosts.sql` and `20261107150100_wainwrights_hike_cohosts_undo_notify.sql` (both applied; the second holds
`undo_hike_ticks` alone because the Supabase connector asks for confirmation on anything containing a delete). Only `create or replace` and
`add column`; nothing dropped.

- **Data:** `hike_attendees.cohost_level` (`approvals` | `standard` | `full` | null). A co-host is still an approved attendee (takes a place,
  sees the private details, can share their live position). `private.hike_rank(hike, user)` returns 4 host, 3 full, 2 standard, 1 approvals,
  0 nobody; every `SECURITY DEFINER` function checks it instead of `host_id = uid`. A trigger (`cohost_reset`) clears the level whenever the
  attendee's status stops being `approved` (withdrawn, removed, declined), so a level never outlives the place.
- **Levels:** *approvals* = approve or decline requests. *standard* = that, plus edit details, WhatsApp link, remove people, tick the fells for
  everyone. *full* = standard, plus cancel the hike, remove-and-block, and add or remove co-hosts. **Only the original host** can grant or
  change `full`, change the host contact line (a co-host's edit leaves `hike_private.host_contact` alone), or remove another co-host. A co-host
  can't change their own level or remove themself (they pull out with `withdraw_hike_place`). Blocks made by a full co-host go on the host's
  list (`host_blocks.host_id = hikes.host_id`); `unblock_hiker` is still host-only.
- **`set_hike_cohost(hike, user, level)`** (level null clears): errors `not_allowed`, `host_only`, `bad_level`, `cannot_change_self`, `is_host`,
  `not_attendee`, `hike_closed`. Tells the person (`hike_notifications.kind = 'cohost'`, emailed by `hike-notify`, v12 adds the subject).
- **Notifications:** `private.hike_notify_hosts(hike, kind, body, except)` sends to the host and every co-host. Used for new requests,
  team-member joins, someone pulling out (not told to the person who did it) and a walker undoing their ticks. Edits and cancels by a
  co-host tell the host (and everyone else, not the actor). The day-before reminder says "co-hosting" for co-hosts.
- **`complete_hike`** by a co-host ticks for the host, the co-host and the people selected (the host is always included).
- **Page (`beta/hike.js`):** `get_hike_by_token` now returns `is_manager`, a `can` object (approve, edit, remove, tick, cancel, block, cohosts,
  grant_full, host_contact), `my_cohost_level` and a public `cohosts` list (names and levels, visible to anyone with the link, like the host name).
  Managers see the host view gated by `can`; the Going list has a role selector per person (host: none / approvals / standard / full; full
  co-host: no Full); a co-host sees a note with their level and "Pull out"; "hosted by X with Y, Z" on the card, the invite Story card, and
  " · co-host" after names on the "we walked" card. `my_hikes` returns `cohost_level` (the list says "Co-hosting" and counts waiting requests).
  **Not in production yet**: production's `hike.js` still keys everything on `is_host`, so a co-host there would see only the walker view (they
  could not use their powers); promote `hike.js` and `shared.css` together.
- **Tested:** in a rolled-back transaction on the live database with five real accounts (60 checks: every refusal per level, host contact kept,
  notifications to the right people and not the actor, level cleared on removal and pulling out, ticks for host + co-host + selected, reminder
  wording, public vs manager vs walker vs stranger views of `get_hike_by_token`, signed-out refused; nothing left behind, anon cannot execute
  `set_hike_cohost`); the page in headless Chromium against mocks (host, full, standard, approvals-only, plain walker, tick form, role change
  calls the function and reloads). **Not tried with two real accounts through the page.**

## OS maps on the planner and hike pages, and the meeting-point picker (2026-11-07) — beta

`beta/maptools.js` (`WWMaps`, on top of `OSMap.createMap`; needs Leaflet and a signed-in user, in `sw.js` SHELL, beta cache v27) adds three things.
Tiles are only requested when someone opens a map; if OS or Leaflet is unavailable the box says so and nothing else breaks.

- **Planner walk cards:** a "Show map" button opens an OS map on the card: the walk's fells (filled = climbed), the start pin (labelled approximate) and any
  car parks already found for that walk. `planner.html` now loads Leaflet (same pinned version and SRI as `index.html`).
- **Hike page:** a "Show map" button under the details. Everyone with the link sees the fells; the **meeting pin is added only when the page already has the
  private details** (host and approved walkers), so nothing leaks before approval. The directions block also has an **Apple Maps** link and the **grid reference**
  of the meeting point next to the Google Maps one (both built from the stored coordinates, same visibility as before).
- **Meeting-point picker** (create form, planner-walk form and "Edit details"): "Pick on the map" opens a map with a movable pin (tap to place, drag to adjust,
  the walk's fells shown for context, opens on the existing point if there is one). It just writes `lat, lng` into the existing meeting-point box (and fires
  `input`), so everything downstream is unchanged: still stored as plain coordinates, Google Maps directions link built by the page, same server checks. The caption
  shows the pin's grid reference and warns if it is outside the Lake District box the database allows (53.8–55.2 N, 3.8–2.2 W). Navigation apps route to the nearest
  road, so the form tells hosts to put the pin on the car park or lay-by itself.
- **Gotcha:** `FELLS_DATA` is a top-level `const` (not a `window` property), so `maptools.js` reads it by name, lazily.
- **Tested** in headless Chromium against mocks: planner (no tiles until asked, token-only tile requests, fell and start markers, hide/show, OS-unavailable
  message), hike page (approved walker gets the meeting pin, a not-yet-approved visitor gets fells only and no directions links, Apple link and grid ref),
  create and edit pickers (opens on the right point, tap fills the box, second tap moves the pin, outside-box check). The earlier hike, co-host and car park test
  suites still pass. **Not tried on a real phone** (touch drag of the pin, tap accuracy) and not promoted to production.

## 24 Peaks challenge and "Host this challenge" (2026-11-07) — beta

- **24 Peaks** (`24_peaks`, https://www.lakedistrictpeaks.co.uk/24-peaks.html, run by Activus Outdoors): a two-day, 31-mile guided challenge, 24 peaks in 24 hours. Day 1 is
  the Lake District 10 Peaks route (Red Pike (Buttermere), High Stile, High Crag, Green Gable, Great Gable, Lingmell, Scafell Pike, Great End, Esk Pike, Bowfell; start
  Gatesgarth, Buttermere, target 12 h) and day 2 is 14 peaks (Red Screes, Dove Crag, Hart Crag, Fairfield, Seat Sandal, Dollywaggon Pike, Nethermost Pike, Helvellyn,
  Helvellyn Lower Man, White Side, Raise, Stybarrow Dodd, Watson's Dodd, Great Dodd; start Kirkstone Pass, target 10 h). **Helvellyn Lower Man is not a Wainwright**, so 23 of
  the 24 are in the app (the page says so). The site's "Whiteside" is the Helvellyn-range White Side. Added in `fells-data.js` (`challenges` arrays, used by the tracker's
  fell pop-up), `challenges-data.js` (`CHALLENGE_FELLS`; seven fells that weren't on any challenge were added with their usual description) and the `CHALLENGES` label
  maps in both `challenges.js` and `tracker.js`. `challenges.js` takes an optional `order` (route order) so the chips read day 1 then day 2. The page text was read from the
  site on 2026-11-07 (this needed `www.lakedistrictpeaks.co.uk` added to the Claude Code environment's allowed hosts).
- **Host this challenge:** a button on each challenge card with a `host` config (24 Peaks, 10in10, Challenge 5), same hand-off as the planner (`sessionStorage`
  `ww_host_walk` -> `hike.html?new=1`), with the fells in route order. `hike.js` works out the highest fell for the forecast from the fell names when the hand-off has none, and
  no longer prints "null mi / null m" when a challenge has no distance or ascent (only 24 Peaks has a distance, 31 mi, from the site; ascent isn't given so it's left blank, not
  guessed). `walk_key` is `challenge-<key>`. The start point is a known planner base (Little Town for the Newlands challenges, Buttermere village for 24 Peaks) and the form says to move
  the pin (day 1 really starts at Gatesgarth, further up the valley; the exact Gatesgarth coordinates weren't checked). **A hike has one start time**, so for the two-day challenge
  the form tells the host to use it for day 1 and say in the meeting-point note when day 2 starts; ticking for everyone happens once, after the hike.
- **Fell cap raised to 50 (2026-11-07):** migration `wainwrights_hike_fell_cap_50` rewrites `create_hike` (only the `between 1 and 30` became `between 1 and 50`; checked on the live database in a
  rolled-back transaction: 45 and 50 fells accepted, 51 refused with `bad_walk`). The custom-hike form and `MAX_HOST_FELLS` in `challenges.js` match. **Bob Graham is therefore hostable**
  (39 of its 42 fells are in the app; 66 mi, 8,200 m from its own blurb; start is the planner's Keswick base, the form says the round really starts at the Moot Hall, so move the pin).
  Three Peaks still has no button (one Lake District fell). The snapshot size cap (6,000 characters) is still far above 50 fell names.
- **Tested:** in headless Chromium against mocks (card, 23 chips in route order, links, Lower Man note, buttons on the right three cards, Bob Graham message, fell pop-up, hand-off
  into the form, the `create_hike` call with the key, the 23 fells in order, Scafell Pike as the top fell and the 31 miles; 10in10 shows no distance); all 23 names exist in
  `fell_heights`. Not promoted to production.

## Car parks on the maps (2026-11-07) — beta

The OpenStreetMap car park results (see the car park finder section) now also show on the maps, numbered like the list (`WWMaps.setParks` in `maptools.js`; markers are `.ww-num`).

- **Planner walk cards:** the card's "Show map" includes any car parks already found for that walk, and if the map is already open when the lookup finishes they appear on it
  straight away (`refreshMapParks` in `planner.js`). The list items are numbered to match.
- **Host form meeting-point picker:** the planner's "Host this walk" hand-off now carries `search_key/search_lat/search_lng` (the walk's start pin, which is what the lookup was made around).
  In "Pick on the map" the form shows the same car parks: straight away if the planner already looked them up (they are in this device's saved copy, read with `CarParks.cached`, which never
  touches the network), otherwise behind a "Show car parks near the start" button (so nothing is looked up until tapped). Tap a numbered marker or a name in the list to put the pin on that
  car park; the meeting-point note becomes its name only if the note was empty or still the pre-filled one (a note the host typed is kept). `hike.html` now loads `carparks.js`.
  Not shown in "Edit details" (an existing hike no longer knows where the walk's search pin was) or the custom-hike form (no start pin).
- **Tested:** headless Chromium with the mocked Overpass service (lookup then map, map then lookup, picker with no saved results and with saved results, tapping the list and the marker,
  typed note kept, no lookup before tapping). Not promoted to production.

## Milestones and the countdown (2026-11-07) — beta

- **Countdown on the tracker:** under the hero numbers, "9 fells to go until 10 fells" with a bar from the last milestone to the next (`renderMilestone` in `tracker.js`). Milestones are
  `MILESTONES = [10, 25, 50, 75, 100, 107, 125, 150, 175, 200, 214]` (107 is halfway). At 214 it says "All 214 climbed. Wainwright complete!".
- **Milestone card:** once you've passed the first milestone a "Share my N fells milestone" button appears; it draws `WWStory.milestoneCard` (`story.js`): the milestone you last passed
  in a big progress ring, climbed / complete / elevation, and a "NEXT UP" panel with the countdown bar. It always shows the **current** milestone and countdown (the date on it is the day you
  share it, not the day you passed it: older ticks have no timestamp, so the real date can't always be known).
- **Tested:** headless Chromium (countdown text and bar, no button before the first milestone, three rendered cards viewed by eye: 50, halfway, all 214). Not promoted to production.

## Story card styles, sizes, themes, photos, new cards and recaps (2026-11-07) — beta

Every Instagram/WhatsApp card now opens a **share sheet** (`WWStory.open`, in `story.js`) instead of sharing straight away: a preview, then **Layout** (Classic, Map, Photo, Poster), **Size** (Story 9:16, Post 4:5, Square) and **Colours** (Paper, Dark, Forest, Bold), then Share / Save image. The choices are remembered per device (`localStorage` `ww_story_style`).

- **Cards (`kind`):** `day` (today's fells), `hike` ("we walked"), `invite`, `team`, `milestone`, and three new ones: `challenge` (a challenge's fells, ticked ones crossed out; "Share my progress" on every challenge card), `summit` ("Share this fell" in a climbed fell's pop-up on the tracker) and `recap` ("Share a recap" button on the tracker). Each is described by a small model (kicker, title, sub, big number, three stats, list rows, map spec) in `modelFor()`; **Map, Photo and Poster draw any model**, and **Classic** is each card's own design (the original drawing functions, plus `classicChallenge/Summit/Recap`).
- **Sizes and themes:** `setStyle()` sets width, height, safe margins and colours for each render (module-level values; renders are queued one at a time so this is safe). The Instagram safe margin (250 px top and bottom) only applies to the Story size. Cards drop things that don't fit a short size (the map when under ~340 px of height, the ring on the milestone card).
- **Photo layout, on-device only:** "Add a photo" opens the phone's picker; the browser reads the file (`createImageBitmap`, orientation corrected), scales it to 1600 px, draws it into the card canvas, and the finished JPEG goes to the share sheet. It is **never uploaded**; redrawing on a canvas also drops the photo's metadata (including location). It lives only in memory unless "Remember it on this device" is ticked, which keeps a ~1200 px copy in `localStorage` (`ww_story_photo`); Remove photo clears it. With no photo the Photo layout shows a drawn landscape. The summit card uses the photo in its Classic layout too (in a frame).
- **Recaps:** weekly, monthly, quarterly, 6 months, year, each "this one" or "the one before" (`periodRange`/`recapData` in `tracker.js`). It reads `checkbox_states.ticked_at`, so **only ticks made since 31 Oct 2026 can appear** (earlier ticks have no date); a period with none shows "There's nothing to show for that yet". Shows fells, days out, summit height, **weeks in a row** (consecutive Monday-to-Sunday weeks with a tick, counted back from this week, or last week if this one is still empty), a bar chart (days for a week, 7-day blocks for a month, months for the longer periods) and the highest fells. Week = Monday to Sunday; month, quarter and year are calendar; "6 months" is the six calendar months ending this month.
- **Pages:** `challenges.html` now loads `fells-data.js` and `story.js`. `leaderboard.html`, `hike.html` and `index.html` already did. The old "Share progress" rings card in `tracker.js` is separate and unchanged.
- **Tested:** all 10 sample cards x 4 layouts x 3 sizes (and 4 themes at Story size) render (240 renders, no errors), checked by eye; the sheet (options, sizes 1080x1920 / 1350 / 1080, choices remembered, photo add/remember/remove, recap periods, summit and challenge entry points) in headless Chromium. Not tried on a real phone's photo picker or share sheet. Not promoted to production.

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

## OS map, "Where am I?" and the live hike map (beta and production) — 2026-11-06

Built in `beta/` and promoted to production the same day. Three features on Ordnance Survey (OS Data Hub) APIs. Docs: https://docs.os.uk/os-apis.

**Credentials never reach the browser.** Edge Function `os-token` (`supabase/functions/os-token/index.ts`,
verify_jwt false, authenticates the caller itself like `drive-times`) trades the project's `OS_API_KEY` +
`OS_API_SECRET` secrets for a ~5-minute OAuth2 token and returns it to **signed-in users only** (OS's own rule:
don't hand tokens to anonymous visitors). It caches the token in memory until it has under a minute left. The browser
then calls `api.os.uk` directly with `Authorization: Bearer <token>` (OS's CORS preflight allows that header).
**Deployed 2026-11-07 (function version 1) with `OS_API_KEY` / `OS_API_SECRET` set** on walking-up-hills (the OS project has Maps, Names, Features, NGD Tiles, see the real-key checks below).
If the function or OS can't be reached everything degrades quietly, in production too: `OSMap.createMap()` resolves null, the tracker stays on the sketch map with a note,
Where am I? still gives a grid ref and nearest summit, and the hike page shows the list without a map. A failed token call is
not retried for 60 s.

- **`beta/osmap.js`** (shared; needs Leaflet 1.9.4 from jsDelivr with SRI, loaded by `index.html` and `hike.html`):
  `OSMap.createMap(el)` (OS **Outdoor_3857** raster tiles via a small `L.TileLayer` subclass that fetches each tile with the
  bearer header and hands it to the `<img>` as a blob, retrying once on 401; tiles are OS OpenData up to zoom 16, so
  `maxNativeZoom` is 16 and 17+ just scales up rather than touching Premium data), `OSMap.gridRef(lat, lng, digits)` (WGS84 to
  OSGB36 Helmert + transverse Mercator, no library; checked against all 214 `gr` values in `fells-data.js`: 211 identical to
  6 figures, 3 within 100 m, plus Ben Nevis), `OSMap.nearestFells`, and `OSMap.whereAmI()`.
- **Attribution:** the map shows "Contains OS data © Crown copyright and database right <year>" plus a Terms link. **OS's branding
  rules also want the OS API logo bottom-left and an error-reporting link; neither is in yet** (the logo zip is on
  osdatahub.os.uk, which this environment couldn't reach). Add both before this goes to production.
- **Tracker (`index.html`, `tracker.js`):** a Sketch / OS map toggle on the map card. The sketch `<svg id="fell-map">` stays in
  the page (hidden) because the Story share image is drawn from it. Fell markers on the OS map are circles sized by height,
  filled when ticked (`updateOsMarkers()` runs from `renderAll`), tap to jump to that fell in the list. The choice is remembered
  in `localStorage.ww_map_mode`; OS tiles are only requested once someone chooses it.
- **Where am I?** (button on the map card and on a live hike): 10-figure grid ref + 6-figure, E/N, lat/lng, accuracy, the 3
  nearest summits with distance and compass point, nearest named place from OS Names (`/search/names/v1/nearest`, 1 km radius,
  looked up again only after ~100 m of movement), "Copy grid ref" / "Copy full message" for reading to Mountain Rescue, and a 999
  line. Position is never sent anywhere except the grid coordinate to OS Names. Grid ref and nearest summit work with no OS access at all.
- **Live hike map (`beta/hike-live.js`, migration `20261106100000_wainwrights_hike_live_positions.sql`, applied 2026-11-07 through the SQL editor, because the Supabase connector's confirmation prompt timed out four times on its `delete from` statements; verified afterwards: table, 3 functions, 2 triggers, RLS on, no client table access, anon refused):**
  on a hosted hike, the host and approved walkers get a "Live hike map" card from 3 h before the start to 18 h after. Strictly
  opt-in per person per hike ("Share my location"); positions upload at most every 15 s (or 25 m of movement); everyone polls
  every 20 s. A web page can only read GPS while open with the screen on, and the card says so (it's not a safety tracker). The
  opt-in is remembered in `localStorage` (`ww_live_<hike id>`) for 24 h so reopening the page resumes. Table
  `hike_live_positions` (one row per person per hike, latest point only, no history; RLS on with **no policies** and all client
  grants revoked) is reached only through `share_hike_position`, `stop_sharing_hike_position` and `get_hike_positions` (SECURITY
  DEFINER, `authenticated` only). Reads are limited to the host and approved walkers and only show people who are still the host
  or approved, updated in the last 3 h. Triggers clear rows when a hike stops being `open` (cancelled/completed) and when someone
  stops being approved (withdrawn/removed). Names and pin labels are inserted as text, never HTML.
- **Tested:** grid maths in Node; tracker and hike pages in headless Chromium against a mocked Supabase, OS tiles and OS Names
  (token-only auth on every tile, 214 markers, fallback when the token call fails, location sheet, share/stop/resume, who must
  not see the card, hostile names); the migration on a scratch Postgres 16 with stand-ins for `auth.users`, `hikes` and
  `hike_attendees` (24 checks: stranger/pending/removed refused, host and approved walker allowed, window enforced, 5-decimal
  rounding, stale and no-longer-approved rows hidden, direct table access and anon refused, stop/withdraw/cancel clear rows).
  **Not tested:** the real OS token endpoint and live tiles (no key available), `os-token` itself (no Deno here), a real phone's
  GPS, or two real accounts on the live database. Do the last with two accounts before telling anyone.
- **Real-key checks (2026-11-07, with the project key through the session's proxy; nothing was sent through `os-token`, which needs a signed-in user, so
  its end-to-end run is the first sign-in to the beta map).** Maps API: an Outdoor_3857 tile returns 200, a 256 px PNG. Names API: `nearest` returns 200;
  unfiltered it answered with a postcode in villages and "Copeland Forest (other landcover)" at Wasdale Head, so the request now filters `fq` to
  Hamlet, Village, City, Suburban_Area, Other_Settlement, Hill_Or_Mountain, Valley, Inland_Water, Waterfall, Cirque_Or_Hollow, Other_Landform and
  Cliff_Or_Slope (`Pass` is not a valid LOCAL_TYPE: OS answers 400). Result: Helvellyn, Scafell Pike, "Glenridding (village)", a valley at Honister, nothing
  within 1 km of the Wasdale Head planner start point. **Car park data is not available on this OS plan:** the OS Features API (WFS) refuses MasterMap
  Sites with 403 "A Premium Plan is required to access Premium Data", NGD Features is not on the plan, and the NGD Tiles vector tiles (`ngd-base`, matrix
  `3857`, path z/y/x) carry no Site layer at the free zoom levels 12-15 (only settlements, woodland, water, landcover, landform, roads, ornament,
  contours, buildings) and refuse zoom 16 and above as Premium. So the car park finder uses OpenStreetMap (below).
- **Keep the OS project small.** The token the function hands to signed-in users can call every API in the project (OS lets you restrict APIs per project
  but not data layers). Maps and Names are all the app needs: **remove OS Features API and OS NGD API – Tiles from the project** (added only for the
  probes). The probe key is also saved as a network secret on the Claude Code environment: delete it in the environment settings when finished.
- **Built afterwards (see the next two sections):** the community heat map and the offline emergency card. `sw.js` is `wainwrights-beta-v10`; Leaflet is precached; tiles and `api.os.uk` are never cached or intercepted.

## Difficulty ratings: Effort and Technical (beta and production) — 2026-11-06

Built in `beta/` and promoted to production the same day. Two separate 1-5 grades for every peak and every walk (`beta/difficulty.js`, pure data +
functions, no DOM at load). It is a **formula plus hand-tagged exceptions, not measured terrain data**; the technical grades are
estimates from general knowledge of the routes, and the legend says so. Correct a grade by editing `TECH`, `EDGE` or `WALK_TECH`
at the top of the file. When OS Terrain 50 slope stats exist per summit, they replace the height default in `techFor()` and no
page changes.

- **Effort** = Naismith time (3 mph + 1 h per 600 m), banded: under 2 h Gentle (1), 2-3.5 Moderate (2), 3.5-5 Strenuous (3),
  5-6.5 Hard (4), over 6.5 Very hard (5). For a **walk**, its own miles and ascent. For a **peak**, the simplest sensible walk:
  out and back from the nearest car park in `PLANNER_BASES` (honouring `PLANNER_BASE_OVERRIDES`), path = straight line x 1.5
  (`PEAK_PATH_FACTOR`), ascent = summit minus the base's `elev`. So peaks only span Effort 1-3 (96 / 105 / 13 across the 214),
  because no single peak from its nearest car park is a Hard day; walks span 2-5. A custom hike with no distance/ascent shows
  "Effort: not rated".
- **Technical** = ground and exposure: 1 easy paths, 2 steep or stony, 3 rough/loose/pathless, 4 Grade 1 scrambling, 5 exposed
  scrambling. A **peak** shows its EASIEST normal way up (default 1 below 700 m, 2 at 700 m+, overridden by name in `TECH`:
  15 fells at 3, a dozen low fells bumped to 2, remote or plain-walking high fells held at 1/2). Where a famous harder way
  exists it is `EDGE` and shown as a range, e.g. Helvellyn **T2-4** (Striding Edge), Blencathra T3-5 (Sharp Edge), Pavey Ark
  T3-4 (Jack's Rake), Scafell, Crinkle Crags (Bad Step), Bowfell (Climbers' Traverse), Catstycam, Helm Crag, Wetherlam. A
  **walk** shows the hardest section of its standard route: `WALK_TECH` for 8 of the 17 named rounds, otherwise the hardest of
  its summits' easiest-route grades (generated walks never use the edges). The hike page finds a named round's override by
  matching `walk.label` against `PLANNER_WALKS`, because the hike snapshot carries no route id (no migration was needed).
- **Where it shows:** tracker fell rows (compact "E2 T2-4" chip, with `aria-label`/`title` spelling it out) plus a key line above
  the regions; planner walk cards (labelled badges, "?" opens the key) and two new sort options, Effort grade (orders by hours so
  walks in one grade still sort sensibly) and Technical grade (grade first, effort breaks ties); the hike page card; and the OS
  map, where a "Colour by Climbed / Effort / Technical" control recolours the markers from the same 5-step ramp (climbed becomes a
  thick dark-green ring; a ramp legend appears; tooltips carry the grades). The ramp is also printed as numbers, so colour is
  never the only signal on cards and chips (map markers rely on colour plus the tooltip). `Difficulty.showLegend()` is the key
  popup (Esc, backdrop, focus returned).
- **Not changed:** the planner's Best match score does not use difficulty (that would silently reorder everyone's results; add
  it deliberately if wanted). Nothing is stored in the database.
- **Tested:** all tag names checked against `fells-data.js` and `planner-walks.js` (none unknown); Node run of every fell and
  named walk; headless Chromium against the mocked backend: chips on all 214 rows, legend and focus return, OS map colour modes
  (ramp colours, thick ring on the climbed fell, restore to Climbed), planner sort both ways, hike card incl. a custom hike with
  no distance. Not validated against anyone's real route knowledge: expect to correct some grades.

## Community heat map (beta and production) — 2026-11-06

"Where everyone's been" on the leaderboard page (Global tab): every fell shaded by how many people have ticked it. Built in `beta/` and promoted to
production the same day; migration `20261106110000_wainwrights_fell_heatmap.sql` **is applied** to walking-up-hills (nobody is opted in yet). Files: `beta/heat.js` (called from
`leaderboard.js`: `WWHeat.init(user)` once and `WWHeat.refresh()` after joining/leaving the leaderboard, because `WW.onAuthReady`
only holds one callback), card in `leaderboard.html`.

- **Consent is separate from the leaderboard.** The leaderboard terms promise "the specific fells you've climbed are not shared",
  so joining the leaderboard does **not** add anyone. `leaderboard_opt_in.heatmap_ok` (new column, default false) is set only by the
  "Include my ticked fells in this map, anonymously" checkbox (`set_heatmap_sharing(boolean)`, own row only; `not_on_leaderboard`
  if they haven't joined). The terms text on the page now mentions this optional exception. Leaving the leaderboard deletes the row,
  which ends the contribution.
- **What leaves the database:** only `{name, count}` per fell from `wainwright_fell_heat()` (SECURITY DEFINER, authenticated only).
  Returns nothing until **5** people have opted in, and omits any fell with fewer than **3** opted-in ticks, so a count can't point
  at one or two people. Suspended users, other dashboards, unticked rows and names not in `fell_heights` are excluded. Any signed-in
  user can view the map; only contributors' ticks are counted. `my_heatmap_sharing()` returns null if not on the leaderboard.
- **Page:** a Sketch view (circles at each fell's `x`/`y`, always works) and an OS map view (same token path as the tracker, falls
  back to the sketch with a note). Teal ramp, deliberately not the amber/red difficulty ramp; blank fells are hollow; legend, top 5
  most-climbed, and a count of fells left blank. Names from the data are only ever inserted as text.
- **Tested:** migration on scratch Postgres 16 with stand-in tables (18 checks: default off, thresholds at 4/5 people and 2/3 ticks,
  non-contributors and suspended users excluded, opting out and leaving drop you straight out, no user ids in the output, anon
  refused); the page in headless Chromium (below-threshold message, 214 circles with 100 shaded, OS view and its fallback, opt-in
  toggle calls and error revert, hostile names, terms text). Not tested with real accounts.

## Emergency card (beta and production) — 2026-11-06

`beta/emergency.html` + `beta/emergency.js`: a page for when something has gone wrong. Reachable from the tracker map card, the
Where am I? sheet and the live hike card. Promoted to production 2026-11-06.

- **Works with no signal and no login, on purpose.** No `shared-auth.js` (sign-in checks can fail offline), no `pwa.js` (it covers the
  page with a "You're offline" notice) and no network calls: the grid reference, bearings and nearest summits come from `osmap.js` +
  `fells-data.js`, and the page is in `sw.js` `SHELL` (cache `wainwrights-beta-v10`) so it is precached. The page also registers
  `sw.js` itself so it is saved even if opened directly. GPS needs no mobile signal. Verified in Chromium: after going offline, the
  position still updates and the page makes zero requests of its own.
- **Shows:** live 10-figure grid ref (and 6-figure, E/N, lat/lng, accuracy, GPS fix age ticking every second), the three nearest summits
  ("you're on it" under 30 m), five plain steps (stay put, 999/112 and Police then Mountain Rescue, read the message, texting, battery),
  a ready-made message to read out, copy, share or text to the saved emergency contact (`sms:` link, `&body` on iOS, `?body`
  elsewhere), the six-blasts distress signal, and a details form.
- **Privacy:** name, phone, people with me, medical notes and emergency contact are saved in `localStorage` (`ww_emergency_details`) only
  and never uploaded. "What's happened" is held in memory and **never** saved. The last GPS fix is kept in `localStorage`
  (`ww_last_fix`, every 10 s) so something can still be read out if GPS drops: it is shown with a "where you were N minutes ago"
  warning and the message words it as "that was my position at HH:MM and I may have moved". With no fix and no history the message says
  it has no position rather than inventing one.
- **emergencySMS:** the page says you can text 999 only if registered beforehand (text REGISTER to 999), because it won't work otherwise.
- **Not done:** offline map tiles (OS tiles are never cached; that needs a deliberate look at OS's terms first), a compass bearing from
  the phone's sensors, nearest place name (needs OS Names, so online only), and testing on a real phone or on real hill ground.
- **Tested:** `emergency.html` in headless Chromium: grid ref, accuracy and fix age, message contents, offline operation with no requests,
  saving and restoring details, "what's happened" not stored, sms link, old-fix warning and wording, and the no-position case.

## Car park finder and Story route maps (promoted to production 2026-11-07) — 2026-11-06

Two more features built in `beta/` only. `sw.js` was `wainwrights-beta-v11` (`carparks.js` added to SHELL); now v12 (see the beta access section). Production is still
`wainwrights-prod-v7` and has neither.

**Car park finder (planner walk cards).** A "Find car parks near the start" button on every walk card (`beta/carparks.js`, UI in `planner.js`). Tapping it
asks **OpenStreetMap** (the public Overpass API, `overpass-api.de`, then the `overpass.kumi.systems` mirror if the first is busy or down) for
`amenity=parking` within 1.5 km of the walk's start pin, widened once to 4 km if empty (`out center tags`, POSTed as a plain form so there is no CORS
preflight). It needs **no sign-in and no OS access**; only the walk's start coordinates (public) are sent. Left out: `access` private, no, customers,
delivery, permit, residents or employees, and multi-storey, underground, rooftop and garage parking. Duplicates (a point and an outline of the same
car park) are merged, keeping the one with more tags. The nearest 4 are listed with distance and direction from the pin, fee ("Pay: <charge>" / "Free" /
"Donation"), about N spaces, who runs it, access notes, an 8-figure grid ref, a Google Maps directions link, a link to the OSM entry (so mistakes can be
fixed there) and **"Host from here"** (starts a hosted hike with that car park as the meeting point, via the `ww_host_walk` hand-off). The card credits
**© OpenStreetMap contributors** (link to openstreetmap.org/copyright, as the ODbL requires) and says volunteers map these so one can be missing, out of
date or wrongly described. Looked up only on tap, kept on this device only (`localStorage` `ww_carparks_v2:`, 30 days); "Try again" skips that copy.
Errors: busy (429/503/504 or a timed-out query) and failed, each after trying both servers. **Why not OS:** see the real-key checks in the OS section
(Premium only). **Unverified:** my sandbox can't reach Overpass, so the response shape (`elements` with `type`, `id`, `lat`/`lon` or `center`, `tags`) comes
from Overpass's documented format and the tests use that; check one real lookup. The Overpass public servers are fair-use: a lookup per tap plus a
30-day device copy keeps this tiny, but don't loop it.

**Story route maps (`beta/story.js`).** A map panel on the Story images, drawn on the canvas in the app's own style (no map tiles, so no OS
licence question about putting it in a shared image): the fells in the story as peaks or numbered dots, the other fells nearby as quiet circles, a
north arrow, a scale bar (km) and a caption. On the **today's ticks** card it replaces nothing (list shrinks to fit) and the dots are **numbered in
tick order, but only when the ticks are at least 10 minutes apart** (a hike ticked for everyone has one timestamp on every fell, so there the line is
dashed and captioned "Summits joined in a likely order, not the exact path" rather than inventing an order). On the **hosted hike** and **invite**
cards it replaces the fells-as-text paragraph (and falls back to it if no fell can be placed). The order of summits for hikes is nearest-neighbour
from the walk's start point (looked up by matching `label` against `PLANNER_WALKS`; used only to order, never drawn) or from the western end of the
walk, then 2-opt to remove crossings. The panel height follows the shape of the walk (a long north-south ridge gets a tall panel). **Privacy:** only
fells (public data) are drawn; a hike's meeting point and start coordinates are never put on the image (the invite card has always avoided the
meeting point). `tracker.js` now attaches `ticked_at` to each of today's fells; `hike.js` passes `label`.

**Tested:** `cp.test.js`-style Playwright run against a mocked OS NGD API (request shape and token-only auth, nearest-first ordering with a car park
outside range dropped, a hostile name, grid refs, re-render, Host from here, saved-copy reuse, widening to 4 km, site-1 fallback, 403/429/500/404 and
no-OS-access messages) and a canvas render of every card type, viewed by eye, plus unit checks of the route ordering and tick-order rule. All the
earlier suites still pass. Not tested against real OS responses or on a phone's share sheet.

## Admin: confirmed-only People view and delete user (2026-11-07) — database live, page in beta and production

Typing an email into the sign-in box creates an auth user immediately, even if the link is never clicked (an offensive, never-confirmed
address turned up in the People list this way, created 2 Nov; not from any test). So:

- **People list shows confirmed accounts only.** Migration `20261107100000_wainwrights_admin_confirmed_users.sql` (applied, live for
  both the production and beta admin pages at once): `admin_list_people()` and the "people" count in `admin_overview()` filter on
  `auth.users.email_confirmed_at is not null`; `admin_overview()` also returns `unconfirmed`. New `admin_list_unconfirmed()` (email, created,
  confirmation sent; newest 200). Same signatures as before (`create or replace`), so no overloads.
- **Unconfirmed sign-ups are one click away, not gone.** The People tab (beta `admin.js`) shows "Show N unconfirmed sign-ups" under the list
  (read-only, so it works with admin mode off) with a Delete button on each, so junk can still be cleaned up. The header says
  "N people (+M unconfirmed sign-ups hidden)".
- **Delete user** (`admin_delete_user(p_user_id, p_confirm_email, p_reason)`, migration `20261107100100_wainwrights_admin_delete_user.sql`,
  applied): permanent, admins only. Deletes the `auth.users` row; everything of theirs that cascades goes with it (ticks, leaderboard entry,
  profile, planner location, notifications, their requests on others' hikes, reports they filed, **and any hikes they hosted** with those
  hikes' requests and tick records; other people's own ticks stay). `team_members` and `teams.admin_user_id` do **not** cascade (no `on delete`
  on those foreign keys), so it deletes their team memberships explicitly and refuses if they run a team. Refusals (all enforced in the
  database): `cannot_delete_self`, `cannot_delete_admin`, `email_mismatch` (the typed email must equal theirs, case-insensitive),
  `hosts_open_hikes` (cancel or delete the hike first so people going are told), `admin_of_team` (delete the team first), `not_found`,
  `not_admin`. Anon cannot call it. Writes an `admin_log` row (`delete_user`) with a snapshot: email, confirmed or not, created and last
  sign-in, name, fells, whether on the leaderboard, hikes hosted, hike requests, team memberships, whether suspended, reason. **The log keeps the
  email address** (admin-only table) so a repeat can be recognised; delete that log row by hand if someone ever asks for erasure.
- **Page flow:** "Delete user…" on every person except admins; needs admin mode on; a question that spells out who goes and what goes with
  them (fells, hosted hikes), then they must type the person's email (checked in the page and again by the database), then a reason for
  the log. Server refusals show plain messages.
- **Production:** promoted 2026-11-07 (`admin.js` copied up and the two admin rules appended to `shared.css`; nothing else, so the car park finder and
  Story maps are still beta only; production cache `wainwrights-prod-v8`). The page also lives at `/wainwrights/beta/admin.html`.
- **Tested:** both migrations on a scratch Postgres 16 with stand-ins that copy the live foreign-key rules, including the two non-cascading ones
  (29 checks: confirmed-only list and counts, every refusal leaves everything in place, the unconfirmed junk account and a real walker with
  data deleted case-insensitively and everything of theirs gone, completed-hike host and plain team member deletable, host and team admin
  deletable once the hike is cancelled or the team deleted, the log snapshot, non-admin and anon refused); applied to the live database and checked
  (15 confirmed listed, 2 unconfirmed hidden, correct execute rights, no new security warnings); the page in headless Chromium against a mocked
  backend (confirmed-only list, hidden list incl. hostile names as text, admin mode off refuses before asking, wrong email refused, right email
  deletes and refreshes, delete from the hidden list, each server refusal's message). **Not run against a real account:** the delete function
  has not been called on live data.

## Beta access: admins and invited people only (2026-11-07) — database live, gate in beta, toggle in beta and production

The beta site (`/wainwrights/beta/`, later `/beta/` on the new domain) now only opens for admins and for people an admin has let in. Production is
unaffected.

- **Database** (migration `20261107110000_wainwrights_beta_access.sql`, applied): table `beta_access` (user, granted_by, granted_at, `revoked_at`;
  RLS on, no client access). `am_i_beta()` is true for any admin (no row needed) or anyone with a row where `revoked_at is null`; false when signed out.
  `admin_set_beta_access(user, on)` is admin-only; "off" is a soft revoke (keeps the row, sets `revoked_at`) and turning back on clears it; both write to
  `admin_log` (`beta_access_on` / `beta_access_off`). `admin_list_people()` now also returns `beta_access`. Deleting a user removes their row (cascade).
- **The gate** is in `beta/shared-auth.js`, decided **by path** (`/beta/` in the URL), so promoting that file to production leaves production alone
  (checked: production pages never ask). After sign-in the beta page shows "Checking beta access…", asks `am_i_beta()` and either opens the app or shows
  "The beta is invited-only" with a link back to the main app (`../`) and Sign out. The page's own startup never runs when closed (no data requests).
  Signed-out visitors see the normal sign-in screen. Covers every beta page that uses sign-in (tracker, leaderboard, challenges, planner, hikes, admin).
  **Not gated on purpose:** `emergency.html` (no sign-in by design, it must work on a hill with no signal) and `offline.html`.
- **Offline / outage:** if the database can't be asked, a "yes" remembered on this device in the last 24 hours (`localStorage` `ww_beta_ok_<user id>`)
  still opens the installed beta; otherwise it stays closed with a Try again button. A definite "no" clears the remembered yes, so revoking takes effect
  on the next load while online. The 24 h offline window is the only way a revoked person could still get in.
- **Admin toggle:** People tab (`admin.js`): "Give beta access" / "Remove beta access" per person (needs admin mode), a "beta access" badge, none on
  admins (they always have it). Promoted to production 2026-11-07 (only `admin.js` copied up; production cache `wainwrights-prod-v9`), so the toggle is on
  both admin pages. The gate itself is still only in the beta `shared-auth.js`; production `shared-auth.js` has none.
- **What this is not:** a gate on what the beta pages show, not data security. Beta shares the production database (sign-in and row-level security protect
  the data) and the beta files are still public static files anyone can fetch. Real server-side gating of the files would need Azure Static Web Apps'
  built-in sign-in and invitations after the Azure move (a possible later step; it would replace this check).
- **Rollout note:** installed beta apps serve their saved files first, so the gate reaches them on the next launch after the "New version ready" bar
  (cache `wainwrights-beta-v12`). People already signed in to the beta lose access at that point unless an admin has switched them on.
- **Tested:** migration on a scratch Postgres 16 (25 checks: admin always allowed, stranger and signed-out refused, non-admin can't grant even to
  themselves, grant / revoke / re-grant / idempotent, soft revoke, log entries with the admin's id, cascade on delete, table and anon access closed);
  applied live and checked (admin true, an ordinary account false, signed-out false, 15 people listed, 0 with beta yet); every beta page in headless
  Chromium for allowed, closed, unreachable, remembered-yes (fresh, stale, cleared by a "no"), signed-out, and production pages and the emergency card
  untouched; the admin toggle (badge, buttons, admin mode off refuses, calls and refresh).

**OS logo + error link (2026-11-07).** `OSMap.createMap` adds OS's required logo (`beta/icons/os-logo.svg`, dark variant, bottom-left, links to OS) and a "Report a map error" attribution link. The error-report URL (`OS_ERROR_URL` in `osmap.js`) could not be opened from the build sandbox: confirm it loads. Promoted to production 2026-11-07 (prod cache v10).
