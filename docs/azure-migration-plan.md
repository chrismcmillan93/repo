# Plan: one Azure Static Web App per app, then make the repo private

**Status: planned, NOT started.** Written 7 Nov 2026, rewritten the same day around one subdomain per app.
Nothing here has been run.

## Why

GitHub Pages can't publish from a private repo on the free GitHub plan. Making the repo private today would
unpublish everything on `app.chris-mcmillan.co.uk` (goals, finance, fitness, usa, naples, thailand, and the old
Wainwrights address that forwards to the new one). So each app moves to Azure first, and the repo goes private last.

The alternative (GitHub Pro, about $4/month, Pages from a private repo) needs none of this work. This plan is for
the free route and for building more Azure experience.

## Design

Each app gets its **own Static Web App and its own subdomain**, the same pattern as Wainwrights
(`wainwrights.walkinguphills.co.uk`):

| App | Folder | New address | Resource group | Notes |
|---|---|---|---|---|
| Wainwrights | `wainwrights/` | `wainwrights.walkinguphills.co.uk` | `wainwrights-tracker-app_group` (Central US, made by the portal) | **Done** (7 Nov); see "Resource groups and regions" |
| Naples | `naples/` | not migrating | n/a | **Excluded** (see "Apps not migrating") |
| Finance | `finance/` | `finance.chris-mcmillan.co.uk` | `finance-rg` | |
| Goals | `goals/` | `goals.chris-mcmillan.co.uk` | `goals-rg` | has a `UAT/` folder |
| USA | `usa/` | `usa.chris-mcmillan.co.uk` | `usa-rg` | installed PWA, second user |
| Fitness | `fitness/` | `fitness.chris-mcmillan.co.uk` | `fitness-rg` | installed PWA |
| Thailand | `thailand/` | not migrating | n/a | **Excluded** (see "Apps not migrating") |

(Names are a proposal. Swap any before starting.)

Why this and not one combined app at `app.chris-mcmillan.co.uk/<folder>`:
- **No trailing-slash problem.** Each app is at the root of its own site. (On the combined design, Azure didn't redirect
  `/beta` to `/beta/`, so `/thailand` would have broken every relative link.)
- **Gradual and reversible.** One app at a time; GitHub Pages keeps serving the rest. The repo only goes private after
  the last one has moved.
- **Isolation.** Today every app shares one browser origin (storage, service-worker space). Separate origins keep them
  apart, allow a content-security policy per app and mean one app can be rolled back alone.
- **Free capacity.** 10 Static Web Apps per subscription on the Free plan; this needs 5 in total.

The cost: a new address is a new site to browsers. People sign in again, installed copies are reinstalled, and anything
stored on the device is lost. Each app also needs its own workflow, deployment token, CNAME and Supabase redirect URLs.

### Resource groups and regions

- **One resource group per app, named `<app>-rg`**, created before the Static Web App. Don't let the portal's
  "Create new" make one: it defaults to `<app>-app_group` in Central US, which is how Wainwrights ended up there.
  Pick the group in the dropdown instead. Existing `walking-up-hills-rg` (UK South) is the Wainwrights/Walking Up Hills
  backend group and stays as is.
- **Region:** create the resource group in **UK South**. A Static Web App can't be placed in UK South (its management
  regions are limited), so choose **West Europe**, the nearest one. Content is served from Azure's global edge either
  way; the region only holds the resource's metadata. It can't be changed later (recreate to move).
- **Wainwrights today** is in `wainwrights-tracker-app_group` in Central US (the portal's default). Optional tidy-up,
  not needed for this plan: recreate it as `wainwrights-rg` in West Europe, move the custom domain over with TXT
  validation first so there's no downtime, update the `AZURE_STATIC_WEB_APPS_API_TOKEN` secret and delete the old group.
- Check the CLI before creating anything: `az group create -n <app>-rg -l uksouth`, then
  `az staticwebapp create -n <app> -g <app>-rg -l westeurope --sku Free`.

### Per-app template

- **Workflow** `.github/workflows/azure-static-web-apps-<app>.yml`, copied from the Wainwrights one: runs on pushes to
  `main` that touch `<app>/**`, `app_location: <app>`, no build (`skip_app_build: true`), secret
  `AZURE_STATIC_WEB_APPS_API_TOKEN_<APP>`. Delete the workflow the portal generates.
- **Config** `<app>/staticwebapp.config.json`: no-cache on HTML and service workers, short cache on icons, security
  headers, `.webmanifest` content type, a 404 page, and 404 for any non-public paths inside the folder.
- **Domain:** add the subdomain in Azure, add a CNAME at the DNS host pointing at the app's `*.azurestaticapps.net` host.
  A brand-new subdomain isn't in use, so CNAME validation causes no downtime. The certificate is issued automatically.
- **Supabase:** add `https://<app>.chris-mcmillan.co.uk/**` to the redirect URLs for that app's project and keep the old
  `app.chris-mcmillan.co.uk/<app>/**` entry until the app is retired.
- **Old address:** add the forwarding script to every page of the app's old copy (see below) so old links and installed
  copies on the old address land on the new one.

### Code changes found by a first scan (not exhaustive: check each app)

- **Cross-links:** `goals/index.html`, `goals/js/views/trainingCard.js` and `goals/UAT/*` link to `/fitness/`; 
  `fitness/index.html` links to `/goals/`. These become full subdomain URLs.
- **Service workers:** check every path and scope assumption in `usa/sw.js` and `fitness/sw.js` (the other apps have none), and bump each cache version. (`thailand/sw.js` is not touched: Thailand is not migrating.)
- **`fitness/js/supabaseClient.js`** normalises the sign-in redirect around the `/fitness` path. Simplify for a root site.
- **Sign-in redirect URLs:** Goals, USA and Fitness build them from `origin + pathname`, so the new addresses must be in
  Supabase's list (dashboards-new) before anyone signs in there.
- **Shared sign-in goes away.** Goals, USA and Fitness all use the `dashboards-new` project, so today one sign-in covers
  all of them. On separate origins each app signs in on its own.
- Manifests use `./`-relative `start_url` and `scope`, which should carry over, but each app's `id` changes with the
  origin, so it installs as a new app.

## Order

1. **Finance:** low-impact, no installed app. Use it to prove the template.
2. **Goals:** after the cross-link change to Fitness.
3. **USA and Fitness:** installed PWAs. Warn the people involved first (USA's second user).

## Apps not migrating (Naples, Thailand)

Decided 7 Nov: **Naples and Thailand do not need to migrate.** They are left out of every phase above.

**Open conflict, needs a decision before the last phase.** Both are served by GitHub Pages today. The last phase turns
Pages off and makes the repo private, and on the free GitHub plan Pages can't publish from a private repo. So as the plan
stands, **Naples and Thailand would go offline at that point**, and Thailand is the live Nov 2026 group-trip tracker.
Pick one before starting the last phase:

1. **Retire them first.** Remove the folders (or archive them to a branch) once they're no longer needed; Thailand after the
   trip. Then nothing is lost when Pages goes off.
2. **Keep the repo public.** Skip the last phase; Pages keeps serving Naples and Thailand. The other apps still move to
   Azure, but "make the repo private" doesn't happen.
3. **Upgrade to GitHub Pro (about $4/month).** Pages works from a private repo, so Naples and Thailand stay where they
   are and the repo can go private. This is the simplest way to get a private repo with these two left alone.
4. **Migrate them after all** (the original plan, one app and subdomain each).

Until that's decided, treat "make the repo private" as blocked. Everything else in the plan can go ahead.

## Per-app checklist

- [ ] Add `<app>/staticwebapp.config.json` and the workflow; create the Static Web App (Free) in its own resource group
      `<app>-rg` (create it first, UK South) with the app in West Europe; delete the portal-generated workflow; set the token secret.
- [ ] Make the code changes for that app (cross-links, service worker, redirect path).
- [ ] Deploy; test on the `*.azurestaticapps.net` address (signed-out screens; real sign-in needs the redirect URL first).
- [ ] Add the subdomain and the CNAME; wait for the certificate.
- [ ] Add the Supabase redirect URL; test sign-in (link and code), data, install, offline where applicable.
- [ ] Push the forwarding script for the old address; check old links and an installed copy land on the new address.
- [ ] Tell the people who use it: sign in once more, reinstall the phone app.
- [ ] Update `CLAUDE.md` and `docs/` for that app.

## Forwarding from the old address

The Wainwrights approach: an inline script in each page's head that, only when `location.hostname` is
`app.chris-mcmillan.co.uk`, runs `location.replace` to the same path on the new address (keeping query and hash). It
does nothing on the new address, so no loop. This keeps links with `?query` intact, and old hike share links
(`?t=`) depend on that.

**Catch:** this needs something to be serving the old address. While GitHub Pages is on, it does. Once Pages is off the
old address needs a new home or every old link 404s. See the last phase.

## Last phase: retire GitHub Pages, then go private

Only after the final app has moved and been stable for a few days:

- [ ] Create one small **legacy redirect** Static Web App for `app.chris-mcmillan.co.uk`. It hosts only:
      the Wainwrights forwarding pages (the script above, so old hike share links keep their `?t=`), and `routes`
      redirects for the other apps' folders to their new addresses (Azure route redirects send the visitor to a fixed
      target and don't carry the query string, which is fine for app front pages).
- [ ] Point the DNS CNAME `app` at that app instead of `chrismcmillan93.github.io`; wait for the certificate.
- [ ] Turn off GitHub Pages (repo Settings, Pages) and delete the `CNAME` file from the repo.
- [ ] (Blocked until the Naples/Thailand decision above) **Change visibility to Private** (Settings, General, Danger zone).
- [ ] Confirm every workflow still runs. Private repos use free Actions minutes (2,000 a month on the free plan);
      a handful of small no-build deploys won't come close.
- [ ] Scan git history for anything secret first (old keys, personal notes). Going private does not remove copies
      anyone has already cloned or forked.
- [ ] Update `CLAUDE.md`: its opening line says this is a plain GitHub Pages site, and the hosting notes need rewriting.

## Before starting anything

- [ ] Find where DNS for `chris-mcmillan.co.uk` is managed (the Walking Up Hills domain is at GoDaddy; this one may not be)
      and check it allows the new CNAMEs.
- [ ] Decide what `app.chris-mcmillan.co.uk/` itself should show at the end (there is no root `index.html` today).
- [ ] Optionally fix the `/beta` to `/beta/` redirect on the Wainwrights app, a loose end that no longer blocks this plan.

## Rollback

- **Per app, before Pages is turned off:** remove the app's forwarding script (or ignore it) and delete the new CNAME.
  The old GitHub Pages copy keeps running throughout, so the old address is untouched.
- **After Pages is off:** point `app` back at GitHub Pages, re-enable Pages with the custom domain and set the repo back
  to public, or upgrade to GitHub Pro. Slower, which is why Pages is left on until the end.

## Risks and things to know

- Re-sign-in and reinstalling are unavoidable and need telling people in advance, especially for USA.
- Service-worker caches on the old address keep serving old pages until they update; the forwarding script only runs
  after the worker serves the updated page, so installed copies redirect on their next online launch.
- Anything relying on GitHub Pages quirks (automatic `404.html`, case sensitivity, `.nojekyll`) should be checked per app.
- Free plan limits per app: 100 GB bandwidth a month and 250 MB, so size is no concern (the whole repo is about 6 MB).
- Cost: the Free plan covers this. Azure charges nothing for a Free Static Web App.
