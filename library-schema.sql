-- ════════════════════════════════════════════════════════════════
-- DIABFIT KNOWLEDGE CENTRE — articles, admin control, image storage
-- Run this in Supabase SQL Editor. Independent of Journey tables —
-- safe to run regardless of what's already in your project.
-- ════════════════════════════════════════════════════════════════

-- 1. ADMIN CHECK FUNCTION
-- Edit the email list below to add/remove admins. Only these Google
-- accounts (via Supabase Auth) can publish, edit, or approve articles.
create or replace function public.is_admin()
returns boolean as $$
begin
  return (auth.jwt() ->> 'email') in (
    'harmeetsingh.lubana3@gmail.com'
    -- add more admin emails here, comma-separated, e.g.:
    -- , 'priyanka@example.com'
  );
end;
$$ language plpgsql security definer stable;

-- 2. ARTICLES TABLE
create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('traditional','research','community')),
  author_name text,
  cover_image_url text,
  video_url text,              -- YouTube/Vimeo embed link, optional
  body text not null,          -- simple markdown: **bold**, line breaks, - bullets
  status text not null default 'pending' check (status in ('pending','published','draft')),
  submitted_by text not null default 'admin' check (submitted_by in ('admin','public')),
  ai_summary text,             -- cached AI summary — generated once, reused for all
  ai_summary_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table articles enable row level security;

-- Anyone can read published articles
drop policy if exists "Public can read published articles" on articles;
create policy "Public can read published articles" on articles
  for select using (status = 'published');

-- Admins can read everything (including pending submissions to review)
drop policy if exists "Admins read all articles" on articles;
create policy "Admins read all articles" on articles
  for select using (public.is_admin());

-- Public (anonymous) can submit articles — always forced to 'pending' via trigger below
drop policy if exists "Public can submit articles" on articles;
create policy "Public can submit articles" on articles
  for insert with check (submitted_by = 'public');

-- Only admins can insert admin-authored (auto-published) articles
drop policy if exists "Admins can publish directly" on articles;
create policy "Admins can publish directly" on articles
  for insert with check (public.is_admin() and submitted_by = 'admin');

-- Only admins can update or delete
drop policy if exists "Admins can update articles" on articles;
create policy "Admins can update articles" on articles
  for update using (public.is_admin());
drop policy if exists "Admins can delete articles" on articles;
create policy "Admins can delete articles" on articles
  for delete using (public.is_admin());

-- Safety trigger: public submissions are ALWAYS pending, never auto-published,
-- and never carry a pre-set AI summary — no matter what the client sends.
create or replace function public.force_pending_on_public_submit()
returns trigger as $$
begin
  if new.submitted_by = 'public' then
    new.status := 'pending';
    new.ai_summary := null;
    new.ai_summary_generated_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_force_pending on articles;
create trigger trg_force_pending
  before insert or update on articles
  for each row execute procedure public.force_pending_on_public_submit();

create index if not exists idx_articles_category_status on articles(category, status);
create index if not exists idx_articles_created on articles(created_at desc);

-- 3. IMAGE STORAGE BUCKET (for admin cover image uploads)
insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do nothing;

drop policy if exists "Public can view article images" on storage.objects;
create policy "Public can view article images" on storage.objects
  for select using (bucket_id = 'article-images');

drop policy if exists "Admins can upload article images" on storage.objects;
create policy "Admins can upload article images" on storage.objects
  for insert with check (bucket_id = 'article-images' and public.is_admin());

drop policy if exists "Admins can delete article images" on storage.objects;
create policy "Admins can delete article images" on storage.objects
  for delete using (bucket_id = 'article-images' and public.is_admin());

-- Sanity check after setup:
-- select id, title, category, status from articles order by created_at desc;
