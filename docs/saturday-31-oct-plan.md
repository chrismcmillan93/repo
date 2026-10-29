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

Idea: let a Wainwrights user host a walk others can join — e.g. pick a walk from the planner,
set a date, meeting point (the parking link) and spaces, and share it. Open questions to settle:

- [ ] Who can see a hosted hike — friends/team only, anyone with the link, or public on the app?
- [ ] Joining: request + host approves, or first come first served? Waitlist?
- [ ] What joiners see: meeting point, time, route, host's contact — and what stays private.
- [ ] Notifications (email when someone joins / the hike changes) — needs an email provider.
- [ ] Safety basics: kit list, turnaround time, cancel-for-weather by the host.
- [ ] Ticking fells for everyone who went, after the walk.
- [ ] Fits the existing teams feature? (`teams` / `team_members` already exist on walking-up-hills.)

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
