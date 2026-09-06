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

## Open questions
- **LA vs Santa Barbara night split (3/2).** Still open — tracked as a checklist item.
  Whichever way this moves, check whether it also shifts the Comedy Store date
  (currently a fixed anchor on Wed 26 May) or the hire car pickup/dropoff dates.
- **Los Angeles accommodation** — apartment or hotel, undecided.
- **Santa Barbara accommodation** — hotel, specific property undecided.
- **Hire car pickup/dropoff locations** — TBC, depends on the above.
