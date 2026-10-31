-- USA trip: fill flight placeholders (status stays 'placeholder' until booked)
-- Fares checked on Google Flights, 3 Oct 2026
--
-- Note on applying this: the notes values below avoid embedded semicolons
-- (commas used instead) because the Supabase MCP tooling available in this
-- session splits multi-statement SQL on ";" without respecting quoted
-- string literals -- a semicolon inside a text value corrupts the batch and
-- hangs/cancels the query. Not a database issue; just don't put a literal
-- ";" inside a string value run through that tooling.

update usa.flights set
  airline='British Airways', flight_number='BA1381 + BA191', from_airport='MAN', from_city='Manchester',
  to_airport='AUS', to_city='Austin',
  depart_at='2027-05-15 07:45:00+01', arrive_at='2027-05-15 15:25:00-05',
  budget_amount=558, currency='GBP',
  booking_url='https://www.britishairways.com/travel/home/public/en_gb/',
  notes='BA1381 MAN 07:45 -> LHR 09:00, 2h10 connection, BA191 LHR 11:10 -> AUS 15:25 nonstop (777). Book on BA.com as multi-city with the LAX-MAN return. Pay with Amex Gold (2x points). Fare checked 3 Oct 2026.',
  updated_at=now()
where id='fee8ce2c-27a7-44b2-a319-97c0efa70dbe';

update usa.flights set
  airline='Southwest', flight_number='WN314',
  depart_at='2027-05-20 21:55:00-05', arrive_at='2027-05-20 22:55:00-07',
  budget_amount=135, currency='GBP',
  booking_url='https://www.southwest.com/',
  notes='Nonstop 21:55 -> 22:55 (737 MAX 8), leaves a full last day in Austin. Book direct at southwest.com, pay with Monzo/Revolut (USD, avoids Amex FX fee). Fare checked 3 Oct 2026.',
  updated_at=now()
where id='f72ba3e7-980f-4bb1-b24e-540ccf3dd401';

update usa.flights set
  airline='British Airways', flight_number='BA280 + BA1368',
  to_airport='MAN', to_city='Manchester',
  depart_at='2027-05-29 17:05:00-07', arrive_at='2027-05-30 15:45:00+01',
  budget_amount=432, currency='GBP',
  booking_url='https://www.britishairways.com/travel/home/public/en_gb/',
  notes='BA280 LAX 17:05 -> LHR 11:35 (+1) nonstop (777), 3h05 connection, BA1368 LHR 14:40 -> MAN 15:45. Same multi-city BA booking as outbound. Fare checked 3 Oct 2026.',
  updated_at=now()
where id='a73a3ddd-67d8-4fb8-b32b-53b3d3bac246';
