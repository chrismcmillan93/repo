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

## Open questions
- **LA vs Santa Barbara night split (3/2).** Still open — tracked as a checklist item.
  Whichever way this moves, check whether it also shifts the Comedy Store date
  (currently a fixed anchor on Wed 26 May) or the hire car pickup/dropoff dates.
- **Los Angeles accommodation** — apartment or hotel, undecided.
- **Santa Barbara accommodation** — hotel, specific property undecided.
- **Hire car pickup/dropoff locations** — TBC, depends on the above.
