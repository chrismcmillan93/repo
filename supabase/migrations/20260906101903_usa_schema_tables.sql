-- USA 2027 trip planner: tables.
-- Every table: uuid pk, created_at/updated_at, and a nullable user_id so
-- auth can be added later as a migration rather than a rewrite.

create table usa.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  start_date date not null,
  end_date date not null,
  home_currency text not null default 'GBP',
  spend_currency text not null default 'USD',
  -- Units of spend_currency per 1 unit of home_currency, e.g. 1.27 means £1 = $1.27.
  -- Editable from the settings panel; used for all display-time conversion. Never store a converted value.
  fx_rate numeric(10,4) not null default 1.27 check (fx_rate > 0),
  notes text
);
comment on column usa.trips.fx_rate is 'Home currency to spend currency rate: 1 home_currency unit = fx_rate spend_currency units (e.g. 1 GBP = 1.27 USD).';

create table usa.legs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trip_id uuid not null references usa.trips(id) on delete cascade,
  name text not null,
  city text not null,
  region text,
  arrive_date date,
  depart_date date,
  sort_order int not null default 0,
  colour_token text
);

create table usa.flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trip_id uuid not null references usa.trips(id) on delete cascade,
  label text not null,
  booking_reference text,
  airline text,
  flight_number text,
  from_airport text,
  from_city text,
  to_airport text,
  to_city text,
  depart_at timestamptz,
  arrive_at timestamptz,
  budget_amount numeric(12,2),
  actual_amount numeric(12,2),
  currency text not null default 'GBP',
  is_paid boolean not null default false,
  booking_url text,
  notes text,
  status usa.booking_status not null default 'placeholder'
);

create table usa.accommodations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trip_id uuid not null references usa.trips(id) on delete cascade,
  leg_id uuid references usa.legs(id) on delete set null,
  name text not null,
  type usa.accommodation_type not null default 'other',
  booking_reference text,
  address text,
  maps_url text,
  check_in date,
  check_out date,
  nights int generated always as (check_out - check_in) stored,
  has_gym boolean not null default false,
  free_cancellation boolean not null default false,
  cancellation_deadline date,
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  rating_count int,
  rating_source text,
  budget_amount numeric(12,2),
  actual_amount numeric(12,2),
  currency text not null default 'GBP',
  is_paid boolean not null default false,
  status usa.booking_status not null default 'placeholder'
);

create table usa.transport (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trip_id uuid not null references usa.trips(id) on delete cascade,
  leg_id uuid references usa.legs(id) on delete set null,
  type usa.transport_type not null default 'other',
  provider text,
  booking_reference text,
  pickup_location text,
  pickup_at timestamptz,
  dropoff_location text,
  dropoff_at timestamptz,
  notes text,
  budget_amount numeric(12,2),
  actual_amount numeric(12,2),
  currency text not null default 'GBP',
  is_paid boolean not null default false,
  status usa.booking_status not null default 'placeholder'
);

create table usa.places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trip_id uuid not null references usa.trips(id) on delete cascade,
  leg_id uuid references usa.legs(id) on delete set null,
  name text not null,
  category usa.place_category not null default 'other',
  description text,
  address text,
  maps_url text,
  website_url text,
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  rating_count int,
  rating_source text,
  price_indicator text check (price_indicator is null or price_indicator in ('$','$$','$$$','$$$$')),
  booking_required boolean not null default false,
  is_shortlisted boolean not null default false,
  is_rejected boolean not null default false,
  rejection_reason text,
  estimated_cost numeric(12,2),
  currency text not null default 'USD',
  notes text
);

create table usa.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trip_id uuid not null references usa.trips(id) on delete cascade,
  leg_id uuid references usa.legs(id) on delete set null,
  day date not null,
  start_time time,
  end_time time,
  title text not null,
  place_id uuid references usa.places(id) on delete set null,
  type usa.itinerary_item_type not null default 'idea',
  sort_order int not null default 0,
  notes text,
  estimated_cost numeric(12,2),
  currency text not null default 'USD'
);

create table usa.checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trip_id uuid not null references usa.trips(id) on delete cascade,
  title text not null,
  category usa.checklist_category not null default 'other',
  is_done boolean not null default false,
  due_date date,
  url text,
  notes text,
  sort_order int not null default 0
);

create table usa.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trip_id uuid not null references usa.trips(id) on delete cascade,
  leg_id uuid references usa.legs(id) on delete set null,
  date date not null default current_date,
  description text not null,
  category usa.expense_category not null default 'other',
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  is_estimate boolean not null default false
);

-- updated_at triggers
create trigger set_updated_at before update on usa.trips for each row execute function usa.set_updated_at();
create trigger set_updated_at before update on usa.legs for each row execute function usa.set_updated_at();
create trigger set_updated_at before update on usa.flights for each row execute function usa.set_updated_at();
create trigger set_updated_at before update on usa.accommodations for each row execute function usa.set_updated_at();
create trigger set_updated_at before update on usa.transport for each row execute function usa.set_updated_at();
create trigger set_updated_at before update on usa.places for each row execute function usa.set_updated_at();
create trigger set_updated_at before update on usa.itinerary_items for each row execute function usa.set_updated_at();
create trigger set_updated_at before update on usa.checklist_items for each row execute function usa.set_updated_at();
create trigger set_updated_at before update on usa.expenses for each row execute function usa.set_updated_at();

-- lookups the UI will hit constantly
create index on usa.legs (trip_id, sort_order);
create index on usa.flights (trip_id);
create index on usa.accommodations (trip_id, leg_id);
create index on usa.transport (trip_id, leg_id);
create index on usa.places (trip_id, leg_id, category);
create index on usa.itinerary_items (trip_id, day, sort_order);
create index on usa.itinerary_items (place_id);
create index on usa.checklist_items (trip_id, sort_order);
create index on usa.expenses (trip_id, leg_id, date);
