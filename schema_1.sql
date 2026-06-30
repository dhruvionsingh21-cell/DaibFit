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
