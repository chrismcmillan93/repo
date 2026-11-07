# Saturday 31 Oct — plan

> **Updated 7 Nov:** section 4 is now the plan for the weekend of 7–8 Nov (OS data, Azure front end, the
> `walkinguphills.co.uk` domain, and the app's emails). Sections 1–3 are the original 31 Oct notes.

## 1. Finish setting up Lifting and the fell planner (~15 min)

Both are already live (Fitness → Lifting tab; app.chris-mcmillan.co.uk/wainwrights/beta/planner.html).
They just need their keys:

- [ ] **Hevy:** Hevy app → Settings → Developer → copy API key (needs Hevy Pro).
      Supabase → **dashboards-new** → Edge Functions → Secrets → add:
      - `HEVY_API_KEY` = the Hevy key
      - `HEVY_OWNER_EMAIL` = the email you sign in to Fitness with
- [ ] **Drive times:** free key from openrouteservice.org.
      Supabase → **walking-up-hills** → Edge Functions → Secrets → add `ORS_API_KEY`.
- [ ] **Test Lifting:** Fitness → Lifting → Sync now. Spot-check one lift against Hevy. Make one post.
- [ ] **Test planner:** enter your postcode; drive times should no longer say "estimate".
      Sanity-check the start points / distances for walks you know.

## 2. Host a hike (to work out on Saturday)

Idea: let a Wainwrights user host a walk others can join — pick a walk from the planner, set a date,
meeting point (the parking link) and spaces, and share a link. Scope: **medium** (usable by other
app users). Order: this first; Azure (section 4) and the PWA are deferred until after.

### Decisions (settled 31 Oct)

- **Visibility: anyone with the link.** Private by default; no public listing. The host shares the
  link (WhatsApp, Instagram).
- **Sign-in required** to request a place (existing magic-link / 6-digit code). The host sees a
  display name.
- **Joining: the host approves each request.** Spaces cap approvals; no waitlist for now.
- **Before approval, a visitor sees:** route, date, time, difficulty, general area. **Hidden until
  approved:** exact parking pin and the host's contact.
- **Notifications: in-app plus email** (request received, approved/declined, hike edited, hike
  cancelled). Needs an email provider (e.g. Resend free tier) called from an Edge Function.
- **Host tools:** cancel / postpone for weather; edit time, meeting point and spaces (edits email
  everyone approved); kit list + turnaround time shown to joiners (editable default list);
  "tick fells for everyone" after the walk (each attendee can undo their own).
- **Teams: a hike can optionally be tied to a team** (`teams` / `team_members` already exist on
  walking-up-hills). Team members are auto-approved.

### Added later on 31 Oct

- **Email: use the existing Resend setup** (already sends the magic links from the custom domain).
  Stay on it for now. Azure is deferred: hosted hikes get built first, on GitHub Pages beta, and
  the architecture gets sorted when we migrate. (This changes today's order: hikes before Azure.)
- **Link format:** random share token in the URL (`hike.html?t=<token>`), at least 16 random
  characters, so hikes can't be guessed.
- **Weather:** the hike page shows the forecast at summit height (Open-Meteo, as the planner does)
  and a warning banner when it's poor. The host gets an in-app nudge to cancel/postpone when the
  forecast turns bad within 48 hours. Cancelling stays a manual host action.
- **Safety warning:** host must acknowledge a responsibility statement when creating a hike;
  joiners acknowledge it when requesting a place. Wording: the host is a fellow walker, not a
  qualified leader; everyone is responsible for their own kit, fitness and navigation; check the
  Mountain Weather Information Service forecast; turn back if conditions change. Report and block
  are included (below).
- **Tick for everyone, with confirmation:** after the start time, the host sees the approved
  attendees as a list with a tick beside each name, and must tick "I confirm these people
  attended" before the button works. Fells are ticked only for the ticked people. Each person is
  notified and can undo it with one tap ("I wasn't on this walk"); the undo removes only ticks
  the hike added, never ones they already had.

### Data model (walking-up-hills, `public` schema, via migration)

Private details live in their own table instead of hiding columns, so a mistake in a query can't
leak them.

- `hikes`: `id`, `host_id` (auth user), `share_token` (unique), `title`, `walk_key` (planner walk
  id), `walk_snapshot` jsonb (label, fell list, miles, ascent, area — copied so later planner
  changes don't alter a booked hike), `area` text, `start_at`, `spaces` int, `status`
  (`open` | `cancelled` | `postponed` | `completed`), `status_note`, `kit` text[],
  `turnaround_time`, `team_id` (nullable → `teams`), `host_ack_at`, `attendance_confirmed_at`,
  `created_at`, `updated_at`.
- `hike_private`: `hike_id` (pk), `meet_lat`, `meet_lng`, `meet_note`, `host_contact`.
- `hike_attendees`: pk (`hike_id`, `user_id`); `display_name`, `status` (`requested` | `approved` |
  `declined` | `withdrawn` | `removed`), `message`, `safety_ack_at`, `attended` bool null,
  `requested_at`, `decided_at`.
- `hike_ticks`: (`hike_id`, `user_id`, `fell_id`) — the ticks a hike created, so undo is exact.
- `hike_notifications`: `id`, `user_id`, `hike_id`, `kind`, `body`, `read_at`, `email_sent_at`,
  `created_at`.
- `hike_reports`: `id`, `hike_id`, `reporter_id`, `reason`, `created_at`.
- `host_blocks`: pk (`host_id`, `blocked_user_id`).

**Access rules (RLS):**
- `hikes`: host full access; approved attendees read. Everyone else gets nothing directly.
- Public link view goes through a SECURITY DEFINER function `get_hike_by_token(token)` returning
  only title, route, date, time, difficulty, area, spaces left, status and the forecast inputs —
  never the pin or contact. It is a function rather than a policy for the same reason as the
  `usa` schema: avoids policy-to-policy recursion.
- `hike_private`: host plus approved attendees (and team members who are auto-approved) only.
- `hike_attendees`: a person sees their own row; the host sees all rows for their hike; approved
  attendees see the names of other approved attendees.
- Writes that cross users go through SECURITY DEFINER functions, not direct table writes:
  `request_hike_place`, `decide_request` (host), `withdraw`, `cancel_hike`, `edit_hike`,
  `complete_hike(hike_id, attendee_ids[], confirmed)` and `undo_hike_ticks(hike_id)`.
  `complete_hike` refuses unless `confirmed` is true, the hike has started, and every id is an
  approved attendee; it writes the ticks into `checkbox_states` for those users and records them
  in `hike_ticks`.
- A blocked user's request is declined automatically. Team hikes: members of `team_id` are
  approved on request, still subject to spaces.

### Build status (31 Oct)

Built on beta: migrations applied to walking-up-hills, `hike-notify` deployed, `hike.html` +
"Host this walk" on planner walks, Hikes nav link. SQL and page tests pass against mocks.
Still to do: try it with two real accounts, send a real email, then tell people.

### Original build plan

1. Migration + `get_advisors` check on walking-up-hills (SECURITY DEFINER functions must set a
   fixed `search_path` and be callable by `authenticated` only — the existing team functions
   callable by anon are a separate known warning).
2. Edge Function `hike-notify` sends the emails through Resend. Check the existing Resend
   secret name and sender address before writing it, and reuse both.
3. `hike.html` (beta): public view, request flow, host dashboard, attendee list, kit list,
   weather banner, safety wording, report and block.
4. "Host this walk" button on each planner walk.
5. Playwright tests against mocks, plus a real second account for the cross-user checks
   (the mock doesn't enforce RLS).

## 3. Wainwrights as an installable phone app (PWA)

Paste this into Claude Code (repo `chrismcmillan93/repo`, `beta` branch):

```text
I'm building a Wainwrights tracker (Lake District, 214 fells) and want help turning it into an installable phone app with offline support. Ask me clarifying questions before starting.

CURRENT SETUP
- Static web app, code in my GitHub repo chrismcmillan93/repo (shared with other personal apps)
- Production: app.chris-mcmillan.co.uk/wainwrights/ (GitHub Pages)
- Beta: app.chris-mcmillan.co.uk/wainwrights/beta/
- Backend: Supabase (free tier) — magic-link email + OTP auth, progress data, opt-in leaderboard (display name, elevation/% stats, optional Instagram handle)
- Work on beta only. Do NOT build or deploy to production until I explicitly say so.

DECISIONS MADE
- Stay on Supabase free tier for data and auth until a move is actually needed.
- Make it a PWA first (no app stores). Consider Capacitor later if I want App Store / Play Store listings.

WHAT I WANT THE APP TO DO
- Tap an icon on iOS or Android, open full screen, look the same as the current site
- Tick off fells and update progress offline, with changes syncing automatically when signal returns

PLANNED APPROACH
1. Web app manifest (name, icons, theme-color, display: standalone) and iOS safe-area padding
2. Service worker caching the app shell and all 214 fells' data
3. IndexedDB local store (Dexie) — every change saved locally first
4. Outbox queue for offline changes; on reconnect, push to Supabase, then pull the latest data
5. Conflict rule: latest change wins per fell
6. A small synced/offline status banner styled to match the existing design
7. An Android install button, plus an "Add to Home Screen" hint for iPhone users
Note: iOS has no background sync, so queued changes send when the app is next opened with signal.

FUTURE (NOT IN SCOPE NOW)
I want to build Azure experience through this project later, using free or cheap Azure services alongside Supabase — e.g. hosting on Azure Static Web Apps, and Azure Functions with Azure Maps for the planned fell day planner. Keep the PWA work compatible with that, but don't plan or build it yet.

FIRST TASK
Review this plan, then help me implement steps 1–3 on the beta branch.
```

### Things to make sure come up in the review

- **Service worker scope.** The whole site shares one origin with Fitness, Goals, USA etc. Register the
  worker at `/wainwrights/beta/` with that scope so it can never cache or intercept the other apps.
- **Sign-in inside the installed app.** On iPhone a magic link opens Safari, not the home-screen app, so
  the session lands in the wrong place. The 6-digit code flow already exists — make that the way in from
  the installed app.
- **Offline session.** Supabase's token refresh fails without signal. Keep the last session and let
  ticks queue locally rather than bouncing to the sign-in screen.
- **"Latest change wins" needs a timestamp.** `checkbox_states` has no `updated_at` today, so the server
  can't tell which change is newer. That's a migration on **walking-up-hills** (not dashboards-new),
  plus the client stamping each local change.
- **No build step.** The repo rule is plain HTML/JS, no bundler — load Dexie as an ES module from a CDN
  and cache it in the service worker (or use raw IndexedDB).
- **The planner page** (new this week) uses live forecast and drive-time calls — decide whether it
  should work offline (last forecast cached) or just say "needs signal".
- **Cache versioning.** Bump a version string on every deploy so the installed app picks up changes.

## 4. Weekend 7–8 Nov: OS data, Azure front end, new domain, app emails

Goal: put the Wainwrights app on Azure Static Web Apps at its own address, send its emails from the new
domain, and switch on the OS (Ordnance Survey) features that are built but waiting for keys. Backend stays on
Supabase. Nothing else in the repo moves: the other apps stay on GitHub Pages at `app.chris-mcmillan.co.uk`.

### Decisions (settled 7 Nov)

- **Address: `wainwrights.walkinguphills.co.uk`** (a subdomain, so DNS is a single CNAME and the root domain
  stays free). The app folder becomes the site root: `/wainwrights/x` becomes `/x`, and the beta is `/beta/`.
  Every path in the app is relative, so nothing inside it has to change.
- **DNS is at GoDaddy.** Nothing has been done with the domain yet.
- **Email: only the app's emails move.** Resend already sends the hike emails, the day-before reminders
  and (as custom SMTP) the Supabase sign-in emails. No mailbox moves and no MX records change.
  `walkinguphills.co.uk` is **not yet verified in Resend**.
- **Front end: Azure Static Web Apps, Free plan.** Build and test on the free `*.azurestaticapps.net`
  address first. No DNS change until the cutover.
- **Old address keeps working indefinitely** through small redirect pages (see Cutover).
- **Beta: stays at `/beta/` for now.** *Changed from the 31 Oct note*, which said to replace the `/beta/` folder
  with Azure's per-pull-request preview addresses. The promote process (copy `beta/` up to production, see
  `wainwrights/CLAUDE.md`) depends on that folder, so switching to previews is a separate piece of work, not a
  weekend job. Previews can still be switched on as an extra. Revisit later.
- **Keep every path relative** (PWA work, section 3), so it works at `/wainwrights/beta/` today, on the Azure
  address, and on the final domain unchanged.

### Order and realistic time

Mostly waiting (DNS, certificate, deploys), not working. About **2.5–3.5 hours of hands-on time** in total.

| When | Block | Hands-on | Waiting on |
|---|---|---|---|
| Fri night | Prep (below) | 20–30 min | nothing |
| Sat | A. OS data | 45–60 min | fixing any car park field names once seen against a real response (15–30 min) |
| Sat | B. Azure on its default address | 30–45 min | first deploy, testing |
| Sat | C. Resend and GoDaddy records | 20–30 min | DNS verification, usually 10–60 min, sometimes hours. Do this early. |
| Sun am | D. Cutover and tests | about 45 min | HTTPS certificate, usually 5–30 min |
| Sun pm | Buffer, promote beta to production, docs | 15–30 min | |

Don't cut over late at night. Do the email sender switch and the cutover on different days if time is tight.

### Friday night: prep

- [ ] Have these open: GoDaddy (DNS), Azure portal (a subscription you can create resources in), GitHub (admin on
      the repo, to add a secret), OS Data Hub, Supabase (walking-up-hills), Resend.
- [ ] Screenshot the current Supabase **Authentication → URL configuration** and **SMTP settings** (rollback).
- [ ] At GoDaddy, lower TTLs on the existing records you may touch. GoDaddy's minimum is about 10 minutes.

### A. OS data (Saturday) — mostly done 7 Nov

Built in `beta/`: OS map, Where am I? place names, car park finder, live hike pins.

- [x] **OS Data Hub project** created with Maps, Names, Features and NGD Tiles; key and secret set as Supabase secrets `OS_API_KEY` / `OS_API_SECRET`.
- [x] **`os-token`** deployed (verify_jwt off).
- [x] **Live pins migration** applied (SQL editor) and verified.
- [x] **Checked against real OS responses:** Maps tile 200; Names works (now filtered to real places). **Car park data is not on this OS plan**
      (Features API: "Premium Plan required"; NGD Tiles free zoom levels have no Site layer), so the car park finder now uses OpenStreetMap.
- [ ] **Try it on the beta:** OS map toggle, Where am I? (place name), a planner car park lookup, the heat map's OS view. Tell Claude what you see.
- [ ] **Remove OS Features API and OS NGD API – Tiles from the OS project** (only added for the probes; the token reaches every API in the project).
- [ ] **Delete the probe key** saved on the Claude Code environment (environment settings, network secrets).
- [ ] **OS branding:** download the OS API logo (`osdatahub.os.uk/brandResources/os-maps-logo-maps.zip`) and send it. Claude adds it bottom-left on the map plus the
      error-report link (both required by OS).

### B. Azure front end (Saturday)

- [ ] **You:** create a Static Web App in the Azure portal (Free plan, West Europe or UK South), linked to
      `chrismcmillan93/repo`, app location = the `wainwrights` folder, no API, no build, output location empty.
      Add the deployment token to GitHub as a secret.
- [ ] **Claude:** write the workflow (the first one in the repo: it must only run on changes to `wainwrights/`, so
      the other apps are unaffected) and `staticwebapp.config.json`:
      - no-cache on `sw.js`, and short cache on HTML (or app updates stick);
      - the `.webmanifest` content type;
      - security headers (content-security policy later, not this weekend);
      - a 404 page, and a `www` redirect if used.
- [ ] **Supabase redirect URLs:** add the `*.azurestaticapps.net` address (and a wildcard for previews, e.g.
      `https://<app-name>-*.azurestaticapps.net/**`) first, or sign-in links won't come back.
- [ ] **Test on the Azure address:** sign-in, ticking fells, leaderboard, challenges, planner, install, offline,
      emergency card. Done when it behaves like the current site.

### C. Resend and GoDaddy records (Saturday)

- [ ] In Resend, add the domain `walkinguphills.co.uk` (root). Resend shows the exact records: a DKIM TXT
      (`resend._domainkey`) and an SPF TXT plus MX on its `send` subdomain.
- [ ] Add them at GoDaddy. Enter only the name in the host field (e.g. `resend._domainkey`, `send`), not the full
      domain, because GoDaddy appends it. Check for existing records at the same names first.
- [ ] Add DMARC: TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:chris@chris-mcmillan.co.uk`. Tighten to `quarantine`
      after about a week of clean reports.
- [ ] Wait for **Verified** in Resend, then send test emails to Gmail, Outlook/Hotmail and iCloud. In the message
      headers SPF, DKIM and DMARC should all pass. Check spam folders: Hotmail was filing the hike emails as spam
      from the old sender.
- [ ] **Don't switch the live sender yet.** That happens at the cutover, after the tests pass.

### D. Cutover (Sunday morning)

1. [ ] **Azure:** add `wainwrights.walkinguphills.co.uk` as the custom domain, and add the CNAME GoDaddy needs
       (pointing at the `*.azurestaticapps.net` address Azure shows). The free certificate follows.
2. [ ] **Supabase → Authentication → URL configuration:** add `https://wainwrights.walkinguphills.co.uk/**` to the
       redirect URLs, then set it as the Site URL. **Keep the old `app.chris-mcmillan.co.uk/wainwrights/**` entry**
       during the transition.
3. [ ] **Sign-in emails:** in Supabase SMTP settings (already Resend), change only the sender address to
       `login@walkinguphills.co.uk` once the domain is Verified. Leave the host and password alone.
4. [ ] **Hike emails:** set `HIKE_FROM_EMAIL` to `Walking Up Hills <hikes@walkinguphills.co.uk>` and `SITE_URL` to
       `https://wainwrights.walkinguphills.co.uk` (Supabase function secrets). Reply-To stays
       `chris@chris-mcmillan.co.uk`, because nobody receives mail at the new domain.
5. [ ] **Claude:** change the fallback links in `hike-notify` and `hike-reminders` (they still default to
       `app.chris-mcmillan.co.uk/...`) and redeploy them. `SITE_URL` already covers the live behaviour.
6. [ ] **Claude:** replace the old `/wainwrights/` pages with small redirect pages that **keep the query string**,
       so old hike share links (`?t=...`) and installed apps land on the new address. GitHub Pages can't do
       server redirects, so these are HTML pages that forward. The old `/wainwrights/beta/` goes to `/beta/`.
7. [ ] **Tell people:** they sign in once more and reinstall the phone app (see risks).

### Test checklist

- [ ] Magic link round trip on the new domain, and the 6-digit code.
- [ ] Open a hike share link, request a place, receive the emails; the links in them point at the new domain.
- [ ] Install the app, go offline, open the emergency card; confirm a new version shows the update bar.
- [ ] Old address and an old hike link both land on the right page on the new domain.
- [ ] Pins and the heat map with two real accounts; Story images from a phone's share sheet.
- [ ] Email: Gmail, Hotmail and iCloud again. A real reminder send is due 12 Dec for the 13 Dec hike.

### Rollback

- **DNS:** point the GoDaddy record back, or remove it. The old GitHub Pages site keeps running throughout, so
  switching back is quick.
- **Auth:** restore the Supabase URL configuration from the Friday screenshot.
- **Email:** change `HIKE_FROM_EMAIL`, `SITE_URL` and the SMTP sender back.

### Risks and things to know

- **A new address is a new site to browsers:** everyone signs in again, installed copies need reinstalling, and
  anything stored on the device (emergency-card details, the saved GPS fix) doesn't carry over.
- **The OS plan may not include NGD Features:** car parks would stay unavailable.
- **Cost:** the Free plan covers custom domain, certificate and previews.
- **No build step still holds:** Azure just publishes the folder as it is.
- **Supabase calls are unchanged:** the browser talks to Supabase directly, and the planner's Edge Functions
  already accept calls from any site.
- **Later (not this weekend):** Azure Functions and Azure Maps for the planner (as in the section 3 prompt),
  a content-security policy, tightening DMARC, an Azure preview workflow in place of `/beta/`.

### After the weekend

- [ ] Promote beta to production: the car park finder and Story maps are still beta only (copy `beta/` up, re-apply the
      three production differences, bump the production cache, as in `wainwrights/CLAUDE.md`).
- [ ] Update `wainwrights/CLAUDE.md` with the new address, the Azure setup and the email setup.
