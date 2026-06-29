-- ============================================================
-- MOTOHUB — MIGRATION 2
-- ============================================================
-- Run this ONCE in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New Query → paste this → Run).
--
-- This is additive only — it does not touch any existing data,
-- tables, or rows from your original supabase-schema.sql.
-- Adds: profile photos, bike vehicle types, and the
-- followers/following system.
-- ============================================================

-- ── Profile photos ────────────────────────────────────────────
alter table public.profiles
  add column if not exists avatar_url text;

-- Helps the Members search page run quickly as your rider count grows
create index if not exists profiles_username_idx on public.profiles (lower(username));
create index if not exists profiles_display_name_idx on public.profiles (lower(display_name));


-- ── Vehicle type on bikes (dirt bike / four wheeler / side-by-side) ──
alter table public.bikes
  add column if not exists vehicle_type varchar(20) default 'dirt_bike'
  check (vehicle_type in ('dirt_bike','atv','side_by_side'));


-- ── Followers / Following ─────────────────────────────────────
create table if not exists public.follows (
  follower_id  uuid references public.profiles(id) on delete cascade not null,
  following_id uuid references public.profiles(id) on delete cascade not null,
  created_at   timestamptz default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);

alter table public.follows enable row level security;

create policy "Follows are publicly readable"
  on public.follows for select using (true);

create policy "Riders can follow others"
  on public.follows for insert with check (follower_id = auth.uid());

create policy "Riders can unfollow"
  on public.follows for delete using (follower_id = auth.uid());

-- ============================================================
-- DONE. Nothing else to configure — config.js does not need changes
-- for any of these features (avatars/post photos reuse the existing
-- motohub-uploads storage bucket; satellite imagery and the Google
-- Earth KML/KMZ import both run entirely client-side).
-- ============================================================
