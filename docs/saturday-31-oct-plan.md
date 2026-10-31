# Saturday 31 Oct — plan

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

## 4. Move the Wainwrights front end to Azure Static Web Apps

Goal: host the Wainwrights site on Azure Static Web Apps (Free plan) instead of GitHub Pages, as the
first step in building Azure experience. Backend stays on Supabase; nothing else in the repo moves.

### Decisions

- **Domain: decide later.** Build and test on Azure's free `*.azurestaticapps.net` address. Production
  stays on GitHub Pages (`app.chris-mcmillan.co.uk/wainwrights/`) until the domain is chosen, then
  switch once. This avoids making users sign in again twice (once for the Azure address, again for
  the final domain) and reinstalling the phone app twice.
- **Beta: use Azure's preview addresses.** Each pull request gets its own preview URL (the Free plan
  allows 3 at a time), replacing the `/beta/` folder on the Azure site.
- [ ] **Order with the PWA work (section 3).** Keep every path in the PWA work relative, so it works
      at `/wainwrights/beta/` today, on the Azure address, and on the final domain without changes.

### Steps

1. Create a Static Web App in the Azure portal (Free plan, UK South or West Europe), linked to
   `chrismcmillan93/repo`. Point it at the Wainwrights folder only, with no build step
   (app location = the Wainwrights folder, no API, output location empty).
2. Azure adds a GitHub Actions workflow to the repo. This is the first workflow in the repo — check it only
   deploys the Wainwrights folder and only runs on changes to it.
3. Add `staticwebapp.config.json`: security headers, a 404 page, and caching rules (short cache on
   HTML and the service worker, long cache on icons and data).
4. Test on the `*.azurestaticapps.net` address: sign-in, ticking fells, leaderboard, challenges,
   planner. Add that address to Supabase's redirect URLs first, plus a wildcard for the preview
   addresses (e.g. `https://<app-name>-*.azurestaticapps.net/**`), or sign-in links won't come back.

**Later, once the domain is chosen:**

5. Add the custom domain in Azure and the DNS records at your domain provider; Azure issues the
   certificate for free.
6. **Supabase (walking-up-hills) → Authentication → URL configuration:** add the new site URL and
   redirect URLs, or magic links will send people back to the old site. Move the auth emails to the
   new domain at the same time (already on the list).
7. Leave a redirect at the old GitHub Pages address (`/wainwrights/`), so bookmarks and links still
   work. GitHub Pages can't do server redirects, so it's a small HTML page that forwards.
8. Tell existing users they'll need to sign in once more — sign-ins are stored per web address, so
   they don't carry over to a new domain.

### Things to know

- **Cost:** the Free plan covers this — custom domain, free certificate, preview environments.
- **No build step still holds:** Azure just publishes the folder as it is.
- **Supabase calls are unchanged:** the browser talks to Supabase directly, and the planner's Edge
  Functions already accept calls from any site.
- **Later (not today):** Azure Functions and Azure Maps for the planner, as already noted in the PWA
  prompt.
