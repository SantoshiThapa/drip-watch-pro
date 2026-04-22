
-- Drip readings table
create table public.drip_readings (
  id uuid primary key default gen_random_uuid(),
  weight numeric not null,
  drip_rate numeric not null default 0,
  led_status boolean not null default false,
  buzzer_status boolean not null default false,
  gsm_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index drip_readings_created_at_idx on public.drip_readings (created_at desc);

alter table public.drip_readings enable row level security;

-- Public read (dashboard is open / monitoring screen)
create policy "Anyone can read drip readings"
  on public.drip_readings for select
  using (true);

-- No public insert/update/delete; writes go via server route w/ service role + API key

-- Settings table (single row, configurable threshold)
create table public.drip_settings (
  id int primary key default 1,
  empty_threshold numeric not null default 50,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

insert into public.drip_settings (id, empty_threshold) values (1, 50);

alter table public.drip_settings enable row level security;

create policy "Anyone can read settings"
  on public.drip_settings for select
  using (true);

create policy "Anyone can update settings"
  on public.drip_settings for update
  using (true)
  with check (true);

-- Realtime
alter publication supabase_realtime add table public.drip_readings;
alter publication supabase_realtime add table public.drip_settings;
alter table public.drip_readings replica identity full;
alter table public.drip_settings replica identity full;
