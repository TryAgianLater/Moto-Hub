-- ============================================================
-- MOTOHUB — MIGRATION 3: Founders Badge
-- ============================================================
-- Run ONCE in Supabase SQL Editor.
-- Adds is_founder flag and marks the first 50 registered users.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ============================================================

-- 1. Add the column (additive only, existing data unaffected)
alter table public.profiles
  add column if not exists is_founder boolean default false;

-- 2. Backfill: mark the earliest 50 registered users as founders.
--    Uses created_at from profiles (set by the auto-create trigger).
update public.profiles
set is_founder = true
where id in (
  select id from public.profiles
  order by created_at asc
  limit 50
);

-- 3. Auto-grant founder status to new signups while the platform
--    still has fewer than 50 total users. Once the 50th slot is
--    taken this function returns false for everyone and stops firing.
create or replace function public.maybe_grant_founder()
returns trigger as $$
begin
  if (select count(*) from public.profiles where is_founder = true) < 50 then
    new.is_founder := true;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Drop first so re-running this migration doesn't error
drop trigger if exists on_profile_check_founder on public.profiles;

create trigger on_profile_check_founder
  before insert on public.profiles
  for each row execute procedure public.maybe_grant_founder();

-- ============================================================
-- DONE. No other files need changing for the badge to appear —
-- index.html reads is_founder from the profiles row it already fetches.
-- ============================================================
