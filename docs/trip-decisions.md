# Trip decisions

Running log of decisions made about the USA 2027 trip itself (not the app). Add to
this as things get confirmed — it's the context that doesn't fit in a database column.

## Stack/deploy (2026-09-06)
Brief originally specified Next.js + TypeScript + Tailwind on a `/usa` basePath. The
actual site is a build-free GitHub Pages deploy shared with several other hand-written
apps (`goals`, `naples`, `wainwrights`, ...). Decided to match the existing pattern —
vanilla HTML/CSS/JS, `supabase-js` via CDN — rather than introduce a framework and
build pipeline nothing else in the repo has. See `CLAUDE.md` and `usa-trip-spec.md`
§1 for the full reasoning.

## Route order: Austin first (carried from the original brief)
UK → Austin → Las Vegas → Los Angeles → UK (open-jaw), in that order, specifically so:
- Kill Tony lands on Mon 17 May (tickets drop 2–3 months out, so the date needs to be
  fixed early even though the flights aren't booked yet).
- The trip is over well before US Memorial Day (31 May), which would otherwise hit
  domestic flight prices and hotel availability on the West Coast leg.

Don't reorder the legs without re-checking both of these.

## Las Vegas accommodation: Harrah's over Trump International
Harrah's Las Vegas is ~0.23 miles from Caesars Palace, an easy outdoor walk on the
Strip — the traveller's sister is staying at Caesars for the wedding. Trump
International rates better on review sites but is further away; the extra distance was
judged the wrong trade-off for wedding weekend. A hotel (not a short-term rental) was
chosen for this leg specifically because Clark County restricts short-term rentals.
Status: `held`, not yet `booked`.

## Austin accommodation: apartment-style over hotel
Austin is the longest leg (5 nights), so an apartment/Airbnb with a kitchen and
laundry was preferred over a hotel. One laundry day is scheduled at the end of the
Austin leg (19 May) specifically to cover laundry for the rest of the trip, since
Vegas/LA/Santa Barbara accommodation won't reliably have laundry.

## Multi-tenant: sister's trip (2026-09-07)
The app now supports more than one account/trip: sister is planning her own
(much longer, ~3 week, many-stop, mostly-unconfirmed) USA trip and gets her
own account and her own trip in the same app, built out herself rather than
hand-seeded like the original one was.

- **One trip per account.** No trip-switcher UI. A new account with no trip
  yet is shown a small "create your trip" form (name + dates) instead of an
  error, and builds it out from there — stops (legs), flights, dates, all
  editable, nothing pre-seeded.
- **Cross-visibility is narrow and deliberate: the Vegas stop only.** Both
  trips are going through Vegas for the same wedding. Either side can mark
  their Vegas leg `is_shared`, which makes that leg's dates and itinerary
  items (only — not accommodation, cost, or anything on any other leg)
  readable by the other account. Read-only: marking a leg shared doesn't let
  the other person edit it, just see it, for coordinating who's doing what
  and when while both are in town. See `CLAUDE.md` for the RLS mechanism.
- **Sequencing matters here.** Real accounts require a live sign-in before
  RLS can be correctly scoped to that account's own trip (Supabase can't
  provision an `auth.users` row any other way). Chris signs in first, his
  existing trip's ownership gets reassigned, RLS gets tightened — only then
  does sister's sign-in link go out. Don't skip that order.
- **Longer-trip itinerary formatting** (3 weeks vs. the original 14 nights)
  is flagged but not yet designed — revisit once her real stop count and
  trip shape are in the system, rather than guessing at it now.

## Chris's account reassignment + RLS cutover (2026-09-07)
Chris signed in, hit the (expected) "no trip yet" screen since his original
trip predates auth, and created a duplicate. Reassigned his real trip's
`user_id` to his new account, deleted the empty duplicate, and tightened
RLS to real per-user ownership in the same migration — see `CLAUDE.md`.
Sister's sign-in link is safe to send now that this has landed.

## Options/choice-groups + shared-Vegas display shipped (2026-09-07)
Sister won't be using the app for a while yet, but built and tested both
remaining pieces now rather than waiting:

- **Itinerary options.** `itinerary_items` gained `choice_group_id` +
  `is_selected`. Items sharing a `choice_group_id` render as one card with
  a pill toggle (e.g. UFC 310 vs. the Sphere); switching pills flips which
  option counts toward cost totals — an unselected alternative never
  double-counts. "+ Add an alternative option" on any plain item turns it
  into the start of a group; removing options back down to one dissolves
  the group again. Any item/option can be turned into a choice, not just
  itinerary-seeded ones.
- **Shared-Vegas display.** Overview now has an "Also there" section
  showing any other account's `is_shared` leg (name, dates, whose trip it
  is, and its itinerary) — read-only. Uses the `db.legs.listSharedElsewhere`
  / `db.itineraryItems.listSharedElsewhere` queries that existed since the
  `is_shared` migration but weren't wired into any screen until now.
- **Live FX rate.** Manual entry stays the source of truth for
  `trips.fx_rate`, but the fx-rate editor now fetches a live GBP→USD rate
  from frankfurter.app (free, no key) and offers it as a one-click "use
  this" suggestion — never auto-applied, so a deliberately-budgeted rate
  is never silently overwritten.

## Trip renamed, richer shared view, PDF export shipped (2026-09-07)
- **Trip renamed.** Chris's trip is now just "USA trip" (was "USA 2027") — a one-off
  data rename, no schema change.
- **Richer "Also there".** After testing the shared-Vegas view from a second account,
  a title + date + time wasn't enough to actually plan around — the section now shows
  the full item (time range, type, notes, cost in its own currency, and the linked
  place's name/address/rating/map). Needed a small additive RLS policy so a shared
  item's linked `places` row is readable too (`usa_shared_leg_place_read` migration) —
  still narrow and read-only, only for a place actually referenced from a shared leg's
  itinerary. Deliberately still one-way/read-only, not real co-editing of the shared
  leg — that's a bigger step (would mean two accounts both writing to one leg) and
  wasn't what was asked for; revisit if "richer view" turns out not to be enough once
  the sister's account is actually in use.
- **PDF export.** Per-stop and whole-trip "Export PDF" actions build a day-by-day
  timeline (itinerary + flights + accommodation + transport, chronological) and use
  the browser's own print-to-PDF rather than a new library — see `CLAUDE.md`. Meant to
  be something to have to hand on the day ("it's Wednesday, this flight, this hotel"),
  not a budgeting or checklist document, so costs/checklist/places aren't included.

## Itinerary shows shared plans inline, by name (2026-09-07)
Overview's "Also there" section was the only place cross-trip sharing showed up —
not much use for actually coordinating a specific day while looking at the
Itinerary screen itself. Added:
- `trips.traveller_name` — a person's name, asked once on the "create your trip"
  form, required going forward. Chris's trip was backfilled to "Chris". Used
  instead of the trip's own title to label whose plan a shared item is
  (`travellerLabel()` in the new `usa/js/sharedItemCard.js`).
- Each day in the Itinerary view that has a shared item from someone else's
  account (i.e. on a leg they've marked shared) gets a small collapsed badge —
  "\<name\> has plans today" — that expands to the same detail card Overview
  shows. Collapsed by default, resets on re-entering the view. No change to what's
  shared or who can see it: still only an `is_shared` leg's own items, still
  read-only.
- Considered showing full detail inline by default instead of a collapsed badge;
  went with collapsed since a day is primarily about your own plan and someone
  else's shouldn't compete for attention unless asked for.

## Bug: shared badge showed "Someone" instead of a name (2026-09-07)
Reported immediately after the above shipped: the Itinerary badge and Overview's
"Also there" both showed generically ("Someone has plans today") instead of the
real name. Root cause was a missing RLS policy, not a missing name: `usa.trips`
only had the owner-scoped `own trip` policy, with no exception for a shared leg's
owning trip the way `legs`/`itinerary_items`/`places` already had one. So every
query that embeds `trips(name, traveller_name)` from a shared leg or item got
`null` back for that embed under RLS, and `travellerLabel()` correctly fell back
to its last resort. Fixed with an additive `"shared leg trip read"` SELECT policy
on `usa.trips` (same "is there a shared leg pointing at this row" shape as the
`places` one) — see `CLAUDE.md`.

This slipped through because the whole feature was verified against a mocked
Supabase client that doesn't enforce RLS at all — the mock always returns full
joined data regardless of which account is asking, so it can validate rendering
logic but can't catch a real permissions gap. Worth remembering for any future
cross-trip feature: the mock proves the UI does the right thing *with* the data;
it says nothing about whether the real database will actually hand that data
over. `get_advisors` after every RLS change, and ideally a real second account,
are the only things that actually check that.

## Places shortlist shared on a shared leg, not just confirmed items (2026-09-07)
Sharing previously only reached as far as a leg's confirmed itinerary — a place
only became visible cross-trip once it was actually linked from an itinerary item.
That meant no way to compare notes on a shared stop before either side had turned
anything into a plan, which is exactly the stage two people are most likely to want
to coordinate at ("don't bother with X, we already ruled it out" is more useful
before either of you books it than after).

- Widened the `"shared leg place read"` RLS policy: a place now also qualifies by
  its own `leg_id` pointing at a shared leg, on top of the original
  itinerary-reference condition.
- New `db.places.listSharedElsewhere()`, and a matching "Also there" section on
  the Places screen itself — same place-card shape as your own shortlist, plus a
  "Rejected" marker and reason where relevant. Still read-only.
- Real data check while building this: Chris's actual Vegas leg already had 12
  shortlisted/candidate places in it, not seeded in this repo — confirms the
  feature has something real to show once the sister's account is live.

## Incident: RLS recursion broke the whole app (2026-09-07)
Reported as "infinite recursion detected" shortly after the trips-sharing fix
above shipped. Root cause: that fix's `"shared leg trip read"` policy on
`usa.trips` queried `usa.legs` directly (`id in (select trip_id from usa.legs
where is_shared = true)`) — and `usa.legs`' own `"own trip rows"` policy queries
`usa.trips` right back. Evaluating either table's RLS required evaluating the
other's, forever. Since every child table's own-row policy also queries
`usa.trips`, this took down RLS for the entire schema — not a degraded shared
view like the last two incidents, but every single query failing, full stop.

Fixed by moving the check into a `SECURITY DEFINER` function
(`usa.trip_has_shared_leg`) that the policy calls instead of querying `legs`
inline — it runs as its own privileged owner, which bypasses `legs`' RLS rather
than re-triggering it, breaking the cycle. See `CLAUDE.md` for why this matters
for any future cross-table policy, not just this one.

Verified directly against the real database rather than the mock this time
(`execute_sql` with `set local role authenticated` + `request.jwt.claim.sub` to
actually exercise RLS as both Chris's account and the shared-Vegas test account)
— the mock can't catch this class of bug at all, since it doesn't implement RLS.
Three RLS incidents in one day made that limitation impossible to ignore twice.

## Open questions
- **LA vs Santa Barbara night split (3/2).** Still open — tracked as a checklist item.
  Whichever way this moves, check whether it also shifts the Comedy Store date
  (currently a fixed anchor on Wed 26 May) or the hire car pickup/dropoff dates.
- **Los Angeles accommodation** — apartment or hotel, undecided.
- **Santa Barbara accommodation** — hotel, specific property undecided.
- **Hire car pickup/dropoff locations** — TBC, depends on the above.
