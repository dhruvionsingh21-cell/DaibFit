-- ════════════════════════════════════════════════════════════════
-- DiabFit Supabase schema
-- Run this in: Supabase dashboard → SQL Editor → New query → paste → Run
-- ════════════════════════════════════════════════════════════════

-- Main table: one row per completed screening
create table if not exists screenings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  state text,
  risk_level text not null check (risk_level in ('low','moderate','high')),
  score integer,
  consent_given boolean not null default false,
  diet_plan_generated boolean default false,
  created_at timestamptz not null default now()
);

-- Index for fast city-based aggregation queries
create index if not exists idx_screenings_city on screenings(city);
create index if not exists idx_screenings_created on screenings(created_at);

-- Row Level Security — allow anonymous inserts (from your public website)
-- but block anonymous reads of individual rows (privacy protection).
alter table screenings enable row level security;

create policy "Allow public insert"
  on screenings for insert
  to anon
  with check (true);

-- This view is what your admin dashboard reads — aggregated counts only,
-- no individual names exposed. Safe to make publicly readable later if needed.
create or replace view city_stats as
select
  city,
  state,
  count(*) as total_tested,
  sum(case when risk_level = 'high' then 1 else 0 end) as high_risk_count,
  sum(case when risk_level = 'moderate' then 1 else 0 end) as moderate_risk_count,
  sum(case when risk_level = 'low' then 1 else 0 end) as low_risk_count,
  round(
    100.0 * sum(case when risk_level = 'high' then 1 else 0 end) / count(*),
    1
  ) as high_risk_percentage
from screenings
group by city, state
order by total_tested desc;

-- Allow the view to be read publicly (for your "Indore: 40 tested, 20 high risk" dashboard)
grant select on city_stats to anon;

-- Quick sanity check query — run this after inserting test data to confirm it works:
-- select * from city_stats;

-- ════════════════════════════════════════════════════════════
-- Integrated plan requests table (add this in Supabase SQL Editor)
-- ════════════════════════════════════════════════════════════
create table if not exists plan_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  city text,
  notes text,
  plan_type text,
  plan_name text,
  payment_id text,
  risk_level text,
  score integer,
  promo_used boolean default false,
  status text default 'pending_review',
  created_at timestamptz not null default now()
);

alter table plan_requests enable row level security;
create policy "Allow public insert on plan_requests"
  on plan_requests for insert to anon with check (true);

-- Only admins can read plan requests (contains contact info)
-- Do NOT add a public read policy here.

-- ════════════════════════════════════════════════════════════════
-- DAIBFIT JOURNEY — user tracker tables
-- Run this in Supabase SQL Editor. Requires Google OAuth enabled
-- in Supabase Dashboard → Authentication → Providers → Google.
-- ════════════════════════════════════════════════════════════════

-- 1. PROFILES — one row per logged-in user, extends Supabase auth.users
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  -- Latest assessment snapshot (synced from the free screening on index.html)
  last_risk_level text,          -- 'low' | 'moderate' | 'high'
  last_risk_score integer,
  last_body_age integer,
  last_actual_age integer,
  last_body_age_gap integer,
  last_assessment_at timestamptz,
  -- Reminder preferences
  daily_reminder_enabled boolean default true,
  weekly_reminder_enabled boolean default true,
  monthly_reminder_enabled boolean default true,
  reminder_hour integer default 19, -- 24hr format, local browser time
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "Users manage own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- 2. DAILY_LOGS — one row per user per day
create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  walk_minutes integer default 0,
  water_glasses integer default 0,
  veggie_servings integer default 0,   -- 0,1,2,3 (3 = "every meal")
  sugar_control integer default 0,     -- 0=none,1=reduced,2=avoided
  sleep_hours numeric(3,1),
  weight_kg numeric(5,1),
  medication_taken boolean default false,
  stress_relief_done boolean default false,
  mood text,                            -- 'great'|'good'|'okay'|'tired'|'stressed'
  created_at timestamptz not null default now(),
  unique(user_id, log_date)
);
alter table daily_logs enable row level security;
create policy "Users manage own daily logs" on daily_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_daily_logs_user_date on daily_logs(user_id, log_date desc);

-- 3. WEEKLY_REPORTS — auto-generated summary per ISO week
create table if not exists weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  consistency_score integer,      -- 0-100
  total_walk_minutes integer,
  total_km numeric(6,1),
  avg_sleep_hours numeric(3,1),
  insights jsonb,                 -- array of rule-based insight strings
  created_at timestamptz not null default now(),
  unique(user_id, week_start)
);
alter table weekly_reports enable row level security;
create policy "Users manage own weekly reports" on weekly_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. MONTHLY_REPORTS — auto-generated summary per calendar month
create table if not exists monthly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  consistency_score integer,
  total_walk_minutes integer,
  total_km numeric(6,1),
  weight_change_kg numeric(5,1),
  insights jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, month_start)
);
alter table monthly_reports enable row level security;
create policy "Users manage own monthly reports" on monthly_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. ACHIEVEMENTS — unlocked badges per user
create table if not exists achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,   -- 'streak_7'|'streak_30'|'streak_90'|'walk_100km'|'weight_loss_5kg'
  achieved_at timestamptz not null default now(),
  unique(user_id, achievement_key)
);
alter table achievements enable row level security;
create policy "Users manage own achievements" on achievements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create a profile row whenever a new user signs up via Google
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
