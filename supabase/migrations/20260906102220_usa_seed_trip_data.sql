-- USA 2027 seed data. Real, already-decided trip content -- see docs/usa-trip-spec.md
-- and docs/trip-decisions.md for the reasoning behind each placeholder.
-- Routing is open-jaw, Austin-first, deliberately avoiding US Memorial Day (31 May)
-- and landing Kill Tony on Mon 17 May. maps_url is a stable Google Maps search URL
-- (no Places API/key). Ratings are only seeded where a real Sept 2026 snapshot exists.

do $$
declare
  v_trip_id uuid;
  v_leg_austin uuid;
  v_leg_vegas uuid;
  v_leg_la uuid;
  v_leg_sb uuid;
  v_place_comedy_mothership uuid;
  v_place_comedy_store uuid;
begin

insert into usa.trips (name, start_date, end_date, home_currency, spend_currency, fx_rate, notes)
values (
  'USA 2027',
  '2027-05-15',
  '2027-05-29',
  'GBP',
  'USD',
  1.27,
  'Open-jaw: UK -> Austin, Austin -> Las Vegas, Las Vegas -> LA, LAX -> UK. '
  || 'Austin is deliberately first so Kill Tony falls on Mon 17 May and the trip avoids '
  || 'US Memorial Day (31 May). This ordering is a decision, not a default -- do not '
  || 'reshuffle the legs without re-checking both constraints. '
  || 'The LA/Santa Barbara night split (3/2) is still open -- see the checklist.'
) returning id into v_trip_id;

insert into usa.legs (trip_id, name, city, region, arrive_date, depart_date, sort_order, colour_token) values
  (v_trip_id, 'Austin', 'Austin', 'TX', '2027-05-15', '2027-05-20', 1, 'austin') returning id into v_leg_austin;
insert into usa.legs (trip_id, name, city, region, arrive_date, depart_date, sort_order, colour_token) values
  (v_trip_id, 'Las Vegas', 'Las Vegas', 'NV', '2027-05-20', '2027-05-24', 2, 'vegas') returning id into v_leg_vegas;
insert into usa.legs (trip_id, name, city, region, arrive_date, depart_date, sort_order, colour_token) values
  (v_trip_id, 'Los Angeles', 'Los Angeles', 'CA', '2027-05-24', '2027-05-27', 3, 'la') returning id into v_leg_la;
insert into usa.legs (trip_id, name, city, region, arrive_date, depart_date, sort_order, colour_token) values
  (v_trip_id, 'Santa Barbara', 'Santa Barbara', 'CA', '2027-05-27', '2027-05-29', 4, 'santa_barbara') returning id into v_leg_sb;

-- Flights: four placeholders, all GBP, no booking reference yet.
insert into usa.flights (trip_id, label, from_airport, from_city, to_airport, to_city, currency, status) values
  (v_trip_id, 'UK -> Austin', null, 'UK', 'AUS', 'Austin', 'GBP', 'placeholder'),
  (v_trip_id, 'Austin -> Las Vegas', 'AUS', 'Austin', 'LAS', 'Las Vegas', 'GBP', 'placeholder'),
  (v_trip_id, 'Las Vegas -> Los Angeles', 'LAS', 'Las Vegas', 'LAX', 'Los Angeles', 'GBP', 'placeholder'),
  (v_trip_id, 'Los Angeles -> UK', 'LAX', 'Los Angeles', null, 'UK', 'GBP', 'placeholder');

-- Accommodation placeholders. has_gym is a hard requirement on all four.
insert into usa.accommodations (trip_id, leg_id, name, type, check_in, check_out, has_gym, free_cancellation, currency, status) values
  (v_trip_id, v_leg_austin, 'Austin apartment-style Airbnb (TBC)', 'airbnb', '2027-05-15', '2027-05-20', true, true, 'GBP', 'placeholder');
insert into usa.accommodations (trip_id, leg_id, name, type, address, maps_url, check_in, check_out, has_gym, free_cancellation, currency, status) values
  (v_trip_id, v_leg_vegas, 'Harrah''s Las Vegas', 'hotel',
   'Harrah''s Las Vegas, 3475 Las Vegas Blvd S, Las Vegas, NV',
   'https://www.google.com/maps/search/?api=1&query=Harrahs+Las+Vegas%2C+Las+Vegas%2C+NV',
   '2027-05-20', '2027-05-24', true, true, 'GBP', 'held');
insert into usa.accommodations (trip_id, leg_id, name, type, check_in, check_out, has_gym, free_cancellation, currency, status) values
  (v_trip_id, v_leg_la, 'Los Angeles stay (TBC)', 'other', '2027-05-24', '2027-05-27', true, true, 'GBP', 'placeholder');
insert into usa.accommodations (trip_id, leg_id, name, type, check_in, check_out, has_gym, free_cancellation, currency, status) values
  (v_trip_id, v_leg_sb, 'Santa Barbara hotel (TBC)', 'hotel', '2027-05-27', '2027-05-29', true, true, 'GBP', 'placeholder');

-- Transport: one hire car for the self-drive LA + Santa Barbara leg.
insert into usa.transport (trip_id, leg_id, type, provider, pickup_location, dropoff_location, notes, currency, status) values
  (v_trip_id, v_leg_la, 'hire_car', null, 'Los Angeles (TBC)', 'Santa Barbara (TBC)',
   'Self-drive coastal road trip covering LA + Santa Barbara. Pickup and dropoff both TBC.', 'GBP', 'placeholder');

-- Places already planned (no rating unless a real Sept 2026 snapshot exists).
insert into usa.places (trip_id, leg_id, name, category, maps_url, is_shortlisted) values
  (v_trip_id, v_leg_austin, 'Comedy Mothership', 'comedy', 'https://www.google.com/maps/search/?api=1&query=Comedy+Mothership%2C+Austin%2C+TX', true)
  returning id into v_place_comedy_mothership;
insert into usa.places (trip_id, leg_id, name, category, maps_url, is_shortlisted) values
  (v_trip_id, v_leg_austin, 'Mount Bonnell', 'hike', 'https://www.google.com/maps/search/?api=1&query=Mount+Bonnell%2C+Austin%2C+TX', true),
  (v_trip_id, v_leg_austin, 'McKinney Falls State Park', 'hike', 'https://www.google.com/maps/search/?api=1&query=McKinney+Falls+State+Park%2C+Austin%2C+TX', true),
  (v_trip_id, v_leg_austin, 'Terry Black''s Barbecue', 'bbq', 'https://www.google.com/maps/search/?api=1&query=Terry+Blacks+Barbecue%2C+Austin%2C+TX', true),
  (v_trip_id, v_leg_austin, 'La Barbecue', 'bbq', 'https://www.google.com/maps/search/?api=1&query=La+Barbecue%2C+Austin%2C+TX', true),
  (v_trip_id, v_leg_austin, 'LeRoy and Lewis Barbecue', 'bbq', 'https://www.google.com/maps/search/?api=1&query=LeRoy+and+Lewis+Barbecue%2C+Austin%2C+TX', true),
  (v_trip_id, v_leg_austin, 'Lockhart BBQ day trip', 'bbq', 'https://www.google.com/maps/search/?api=1&query=Lockhart%2C+TX+barbecue', true),
  (v_trip_id, v_leg_austin, 'Driftwood (Salt Lick) day trip', 'bbq', 'https://www.google.com/maps/search/?api=1&query=The+Salt+Lick+BBQ%2C+Driftwood%2C+TX', true);

insert into usa.places (trip_id, leg_id, name, category, maps_url, is_shortlisted) values
  (v_trip_id, v_leg_vegas, 'Red Rock Canyon - Calico Tanks Trail', 'hike', 'https://www.google.com/maps/search/?api=1&query=Calico+Tanks+Trail%2C+Red+Rock+Canyon%2C+NV', true);
insert into usa.places (trip_id, leg_id, name, category, maps_url, is_shortlisted, notes) values
  (v_trip_id, v_leg_vegas, 'Caesars Palace', 'landmark', 'https://www.google.com/maps/search/?api=1&query=Caesars+Palace%2C+Las+Vegas%2C+NV', false,
   'Wedding-adjacent, reference only -- sister is staying here for the wedding.');

insert into usa.places (trip_id, leg_id, name, category, maps_url, is_shortlisted) values
  (v_trip_id, v_leg_la, 'Comedy Store, Sunset Strip', 'comedy', 'https://www.google.com/maps/search/?api=1&query=The+Comedy+Store%2C+Sunset+Strip%2C+Los+Angeles%2C+CA', true)
  returning id into v_place_comedy_store;
insert into usa.places (trip_id, leg_id, name, category, maps_url, is_shortlisted) values
  (v_trip_id, v_leg_la, 'Mount Hollywood Trail, Griffith Park', 'hike', 'https://www.google.com/maps/search/?api=1&query=Mount+Hollywood+Trail%2C+Griffith+Park%2C+Los+Angeles%2C+CA', true),
  (v_trip_id, v_leg_la, 'Solstice Canyon, Malibu', 'hike', 'https://www.google.com/maps/search/?api=1&query=Solstice+Canyon%2C+Malibu%2C+CA', true);

insert into usa.places (trip_id, leg_id, name, category, maps_url, is_shortlisted) values
  (v_trip_id, v_leg_sb, 'Inspiration Point', 'hike', 'https://www.google.com/maps/search/?api=1&query=Inspiration+Point%2C+Santa+Barbara%2C+CA', true),
  (v_trip_id, v_leg_sb, 'Stearns Wharf', 'landmark', 'https://www.google.com/maps/search/?api=1&query=Stearns+Wharf%2C+Santa+Barbara%2C+CA', true),
  (v_trip_id, v_leg_sb, 'State Street', 'shopping', 'https://www.google.com/maps/search/?api=1&query=State+Street%2C+Santa+Barbara%2C+CA', true);
insert into usa.places (trip_id, leg_id, name, category, maps_url, is_shortlisted, notes) values
  (v_trip_id, v_leg_sb, 'Funk Zone', 'bar', 'https://www.google.com/maps/search/?api=1&query=Funk+Zone%2C+Santa+Barbara%2C+CA', true,
   'Walkable wine tasting -- inland wineries ruled out by the self-drive leg.');

-- Rejected places, with reasons kept visible.
insert into usa.places (trip_id, leg_id, name, category, maps_url, is_rejected, rejection_reason) values
  (v_trip_id, v_leg_austin, 'Franklin Barbecue', 'bbq', 'https://www.google.com/maps/search/?api=1&query=Franklin+Barbecue%2C+Austin%2C+TX', true, '3-5 hour queues. Queue aversion is a hard constraint on this trip.'),
  (v_trip_id, v_leg_austin, 'Enchanted Rock', 'hike', 'https://www.google.com/maps/search/?api=1&query=Enchanted+Rock%2C+TX', true, '3-hour round trip for a short hike -- driving time disproportionate to payoff. Venues within ~25 minutes of central Austin preferred.');

-- Recommendations, verified against Google Places in September 2026. Seeded as
-- suggestions (is_shortlisted = false), not decisions.
insert into usa.places (trip_id, leg_id, name, category, rating, rating_count, rating_source, description, is_shortlisted, maps_url) values
  (v_trip_id, v_leg_austin, 'Flat Track Coffee', 'coffee', 4.7, 875, 'Google, Sept 2026', 'E Cesar Chavez, attached to a bike shop, big back patio', false, 'https://www.google.com/maps/search/?api=1&query=Flat+Track+Coffee%2C+Austin%2C+TX'),
  (v_trip_id, v_leg_austin, 'Merfolk''s Specialty Coffee', 'coffee', 4.7, 262, 'Google, Sept 2026', 'S Congress', false, 'https://www.google.com/maps/search/?api=1&query=Merfolks+Specialty+Coffee%2C+Austin%2C+TX'),
  (v_trip_id, v_leg_austin, 'Terrible Love', 'coffee', 4.9, 426, 'Google, Sept 2026', 'Avenue B. Reviews report 15-20 min queues -- flag against the no-queues rule', false, 'https://www.google.com/maps/search/?api=1&query=Terrible+Love%2C+Austin%2C+TX'),
  (v_trip_id, v_leg_austin, 'Cuantos Tacos', 'restaurant', 4.7, 1266, 'Google, Sept 2026', 'E 12th St, Mexico City style, Michelin Bib Gourmand', false, 'https://www.google.com/maps/search/?api=1&query=Cuantos+Tacos%2C+Austin%2C+TX'),
  (v_trip_id, v_leg_austin, 'Las Trancas Taco Stand', 'restaurant', 4.7, 2768, 'Google, Sept 2026', 'E Cesar Chavez, counter service, open late', false, 'https://www.google.com/maps/search/?api=1&query=Las+Trancas+Taco+Stand%2C+Austin%2C+TX'),
  (v_trip_id, v_leg_austin, 'Micklethwait Barbecue', 'bbq', 4.7, 2051, 'Google, Sept 2026', 'E Austin. Reviewers specifically note no long waits -- fits the trip''s constraint', false, 'https://www.google.com/maps/search/?api=1&query=Micklethwait+Barbecue%2C+Austin%2C+TX'),
  (v_trip_id, v_leg_austin, 'KG BBQ', 'bbq', 4.7, 1671, 'Google, Sept 2026', 'Manor Rd, Egyptian-Texan crossover, closed Mon-Wed', false, 'https://www.google.com/maps/search/?api=1&query=KG+BBQ%2C+Austin%2C+TX'),
  (v_trip_id, v_leg_austin, 'The Roosevelt Room', 'bar', 4.6, 2315, 'Google, Sept 2026', 'W 5th St, cocktails', false, 'https://www.google.com/maps/search/?api=1&query=The+Roosevelt+Room%2C+Austin%2C+TX'),
  (v_trip_id, v_leg_austin, 'Midnight Cowboy', 'bar', 4.5, 890, 'Google, Sept 2026', 'E 6th St, speakeasy, reservation required, closed Mondays', false, 'https://www.google.com/maps/search/?api=1&query=Midnight+Cowboy%2C+Austin%2C+TX'),
  (v_trip_id, v_leg_austin, 'Elephant Room', 'bar', 4.6, 2621, 'Google, Sept 2026', 'Congress Ave, basement jazz, live nightly', false, 'https://www.google.com/maps/search/?api=1&query=Elephant+Room%2C+Austin%2C+TX'),
  (v_trip_id, v_leg_austin, 'The Continental Club', 'comedy', 4.6, 2335, 'Google, Sept 2026', 'S Congress, Austin institution (comedy/live music)', false, 'https://www.google.com/maps/search/?api=1&query=The+Continental+Club%2C+Austin%2C+TX'),
  (v_trip_id, v_leg_austin, 'Historic Scoot Inn', 'comedy', 4.6, 1055, 'Google, Sept 2026', 'E 4th St, outdoor gig venue (comedy/live music)', false, 'https://www.google.com/maps/search/?api=1&query=Historic+Scoot+Inn%2C+Austin%2C+TX');

insert into usa.places (trip_id, leg_id, name, category, rating, rating_count, rating_source, description, is_shortlisted, maps_url) values
  (v_trip_id, v_leg_vegas, 'Vesta Coffee Roasters', 'coffee', 4.7, 1295, 'Google, Sept 2026', 'Arts District, roasts on site', false, 'https://www.google.com/maps/search/?api=1&query=Vesta+Coffee+Roasters%2C+Las+Vegas%2C+NV'),
  (v_trip_id, v_leg_vegas, 'Iwana Specialty Coffee Roasters', 'coffee', 4.8, 479, 'Google, Sept 2026', 'Arts District', false, 'https://www.google.com/maps/search/?api=1&query=Iwana+Specialty+Coffee+Roasters%2C+Las+Vegas%2C+NV'),
  (v_trip_id, v_leg_vegas, 'Bungalow Coffee Co', 'coffee', 4.6, 668, 'Google, Sept 2026', 'Downtown, food menu', false, 'https://www.google.com/maps/search/?api=1&query=Bungalow+Coffee+Co%2C+Las+Vegas%2C+NV'),
  (v_trip_id, v_leg_vegas, 'Hash House A Go Go (The LINQ)', 'restaurant', 4.8, 34165, 'Google, Sept 2026', 'Walkable from Harrah''s, huge portions', false, 'https://www.google.com/maps/search/?api=1&query=Hash+House+A+Go+Go+The+LINQ%2C+Las+Vegas%2C+NV'),
  (v_trip_id, v_leg_vegas, 'Mon Ami Gabi', 'restaurant', 4.7, 33500, 'Google, Sept 2026', 'Paris LV, Strip-facing patio', false, 'https://www.google.com/maps/search/?api=1&query=Mon+Ami+Gabi%2C+Las+Vegas%2C+NV'),
  (v_trip_id, v_leg_vegas, 'Yardbird', 'restaurant', 4.5, 5611, 'Google, Sept 2026', 'The Venetian, southern', false, 'https://www.google.com/maps/search/?api=1&query=Yardbird%2C+The+Venetian%2C+Las+Vegas%2C+NV'),
  (v_trip_id, v_leg_vegas, 'Peppermill Fireside Lounge', 'bar', 4.5, 20413, 'Google, Sept 2026', 'N Strip, retro, open late', false, 'https://www.google.com/maps/search/?api=1&query=Peppermill+Fireside+Lounge%2C+Las+Vegas%2C+NV'),
  (v_trip_id, v_leg_vegas, 'The Chandelier', 'bar', 4.5, 3076, 'Google, Sept 2026', 'The Cosmopolitan, reservation advised', false, 'https://www.google.com/maps/search/?api=1&query=The+Chandelier%2C+The+Cosmopolitan%2C+Las+Vegas%2C+NV'),
  (v_trip_id, v_leg_vegas, 'The Golden Tiki', 'bar', 4.6, 4464, 'Google, Sept 2026', 'Spring Mountain Rd, off-Strip tiki', false, 'https://www.google.com/maps/search/?api=1&query=The+Golden+Tiki%2C+Las+Vegas%2C+NV'),
  (v_trip_id, v_leg_vegas, 'Valley of Fire State Park', 'national_park', 4.8, 18577, 'Google, Sept 2026', '~45 min drive. Second nature option alongside Red Rock', false, 'https://www.google.com/maps/search/?api=1&query=Valley+of+Fire+State+Park%2C+NV');

insert into usa.places (trip_id, leg_id, name, category, rating, rating_count, rating_source, description, is_shortlisted, maps_url) values
  (v_trip_id, v_leg_la, 'The Butcher, The Baker, The Cappuccino Maker', 'restaurant', 4.7, 5469, 'Google, Sept 2026', 'Sunset Blvd, minutes from the Comedy Store', false, 'https://www.google.com/maps/search/?api=1&query=The+Butcher+The+Baker+The+Cappuccino+Maker%2C+Los+Angeles%2C+CA'),
  (v_trip_id, v_leg_la, 'Oleander', 'restaurant', 4.6, 356, 'Google, Sept 2026', 'Sunset Blvd, rooftop, expensive', false, 'https://www.google.com/maps/search/?api=1&query=Oleander%2C+Sunset+Blvd%2C+Los+Angeles%2C+CA'),
  (v_trip_id, v_leg_la, 'La Boheme', 'restaurant', 4.5, 1895, 'Google, Sept 2026', 'Santa Monica Blvd, garden patio', false, 'https://www.google.com/maps/search/?api=1&query=La+Boheme%2C+Santa+Monica+Blvd%2C+Los+Angeles%2C+CA'),
  (v_trip_id, v_leg_la, 'Boxx Coffee Roasters', 'coffee', 4.6, 289, 'Google, Sept 2026', 'DTLA, E 3rd St', false, 'https://www.google.com/maps/search/?api=1&query=Boxx+Coffee+Roasters%2C+Los+Angeles%2C+CA'),
  (v_trip_id, v_leg_la, 'SORO Coffee', 'coffee', 4.8, 78, 'Google, Sept 2026', 'DTLA, Wilshire. Low review count -- treat as unproven', false, 'https://www.google.com/maps/search/?api=1&query=SORO+Coffee%2C+Los+Angeles%2C+CA'),
  (v_trip_id, v_leg_la, 'Jurassic Magic Coffee', 'coffee', 4.7, 454, 'Google, Sept 2026', 'Mid-City', false, 'https://www.google.com/maps/search/?api=1&query=Jurassic+Magic+Coffee%2C+Los+Angeles%2C+CA'),
  (v_trip_id, v_leg_la, 'Death & Co Los Angeles', 'bar', 4.5, 524, 'Google, Sept 2026', 'Arts District, closed Mondays', false, 'https://www.google.com/maps/search/?api=1&query=Death+%26+Co+Los+Angeles%2C+CA'),
  (v_trip_id, v_leg_la, 'Good Clean Fun', 'bar', 4.9, 365, 'Google, Sept 2026', 'DTLA, wine bar and all-day cafe', false, 'https://www.google.com/maps/search/?api=1&query=Good+Clean+Fun%2C+Los+Angeles%2C+CA'),
  (v_trip_id, v_leg_la, 'Griffith Observatory', 'activity', 4.7, 19633, 'Google, Sept 2026', 'Pairs directly with the planned Mount Hollywood Trail. Closed Mondays, parking is the problem', false, 'https://www.google.com/maps/search/?api=1&query=Griffith+Observatory%2C+Los+Angeles%2C+CA');

insert into usa.places (trip_id, leg_id, name, category, rating, rating_count, rating_source, description, is_shortlisted, maps_url) values
  (v_trip_id, v_leg_sb, 'Handlebar Coffee Roasters', 'coffee', 4.7, 1229, 'Google, Sept 2026', 'E Canon Perdido St', false, 'https://www.google.com/maps/search/?api=1&query=Handlebar+Coffee+Roasters%2C+Santa+Barbara%2C+CA'),
  (v_trip_id, v_leg_sb, 'Dune Coffee Roasters', 'coffee', 4.6, 940, 'Google, Sept 2026', 'Anacapa St', false, 'https://www.google.com/maps/search/?api=1&query=Dune+Coffee+Roasters%2C+Santa+Barbara%2C+CA'),
  (v_trip_id, v_leg_sb, 'Santa Barbara Roasting Company', 'coffee', 4.4, 962, 'Google, Sept 2026', 'Near the waterfront', false, 'https://www.google.com/maps/search/?api=1&query=Santa+Barbara+Roasting+Company%2C+Santa+Barbara%2C+CA'),
  (v_trip_id, v_leg_sb, 'Loquita', 'restaurant', 4.6, 1798, 'Google, Sept 2026', 'State St, Spanish, paella', false, 'https://www.google.com/maps/search/?api=1&query=Loquita%2C+Santa+Barbara%2C+CA'),
  (v_trip_id, v_leg_sb, 'The Lark', 'restaurant', 4.5, 1555, 'Google, Sept 2026', 'Funk Zone, seasonal menu', false, 'https://www.google.com/maps/search/?api=1&query=The+Lark%2C+Santa+Barbara%2C+CA'),
  (v_trip_id, v_leg_sb, 'Boathouse at Hendry''s Beach', 'restaurant', 4.5, 4947, 'Google, Sept 2026', 'Cliff Dr, on the sand, waits common at peak', false, 'https://www.google.com/maps/search/?api=1&query=Boathouse+at+Hendrys+Beach%2C+Santa+Barbara%2C+CA'),
  (v_trip_id, v_leg_sb, 'Fess Parker Funk Zone', 'bar', 4.8, 26, 'Google, Sept 2026', 'Funk Zone tasting room. Very low review count -- treat as unproven', false, 'https://www.google.com/maps/search/?api=1&query=Fess+Parker+Funk+Zone%2C+Santa+Barbara%2C+CA'),
  (v_trip_id, v_leg_sb, 'Channel Islands NP Visitor Center', 'national_park', 4.8, 888, 'Google, Sept 2026', 'Ventura, directly on the LA -> Santa Barbara drive', false, 'https://www.google.com/maps/search/?api=1&query=Channel+Islands+National+Park+Visitor+Center%2C+Ventura%2C+CA');

-- Fixed itinerary anchors -- dates the trip is built around, cannot move.
insert into usa.itinerary_items (trip_id, leg_id, day, title, place_id, type, sort_order) values
  (v_trip_id, v_leg_austin, '2027-05-17', 'Kill Tony, Comedy Mothership', v_place_comedy_mothership, 'fixed', 0),
  (v_trip_id, v_leg_vegas, '2027-05-23', 'Family wedding, Las Vegas', null, 'fixed', 0),
  (v_trip_id, v_leg_la, '2027-05-26', 'Comedy Store, Sunset Strip', v_place_comedy_store, 'fixed', 0);

-- One laundry day at the end of Austin, covering the whole trip.
insert into usa.itinerary_items (trip_id, leg_id, day, title, type, sort_order, notes) values
  (v_trip_id, v_leg_austin, '2027-05-19', 'Laundry day', 'planned', 10, 'Covers the whole trip -- Airbnb kitchen/laundry chosen for this reason.');

-- Checklist.
insert into usa.checklist_items (trip_id, title, category, sort_order) values
  (v_trip_id, 'Travel insurance', 'admin', 0),
  (v_trip_id, 'ESTA application', 'admin', 1),
  (v_trip_id, 'Hire car booking', 'tickets', 2),
  (v_trip_id, 'Book flights (before accommodation)', 'tickets', 3),
  (v_trip_id, 'Kill Tony tickets', 'tickets', 4),
  (v_trip_id, 'Confirm LA vs Santa Barbara night split', 'admin', 5),
  (v_trip_id, 'Book Austin accommodation', 'tickets', 6),
  (v_trip_id, 'Book LA accommodation', 'tickets', 7),
  (v_trip_id, 'Book Santa Barbara accommodation', 'tickets', 8);

update usa.checklist_items
  set notes = 'Drops 2-3 months out with 24-48 hours'' notice via Instagram. Standby queue is a genuine backup.'
  where trip_id = v_trip_id and title = 'Kill Tony tickets';

end $$;
