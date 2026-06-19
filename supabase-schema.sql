-- ============================================================
-- MOTOHUB — DATABASE SCHEMA
-- ============================================================
-- Run this entire file ONCE in your Supabase project's SQL Editor:
--   Supabase Dashboard → SQL Editor → New Query → paste this file → Run
--
-- This creates every table, security rule, and trigger MotoHub needs.
-- Nothing else is required to make the backend functional.
-- ============================================================

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. PROFILES  (one row per registered rider, linked to auth.users)
-- ============================================================
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        varchar(32) unique not null,
  display_name    varchar(80) not null,
  avatar_color    varchar(9) default '#FF6B00',
  avatar_initials varchar(3) default '??',
  location        varchar(120) default '',
  bio             text default '',
  riding_level    varchar(20) default 'beginner'
                  check (riding_level in ('beginner','intermediate','advanced','expert')),
  is_admin        boolean default false,
  is_verified     boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select using (true);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up.
-- Username/display name/etc come from the metadata passed at signUp().
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name, location, riding_level, avatar_initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'location', ''),
    coalesce(new.raw_user_meta_data->>'riding_level', 'beginner'),
    upper(left(coalesce(new.raw_user_meta_data->>'display_name', new.email), 2))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper used by RLS policies below to check admin status
create or replace function public.is_admin(uid uuid)
returns boolean as $$
  select coalesce((select is_admin from public.profiles where id = uid), false);
$$ language sql security definer stable;


-- ============================================================
-- 2. TRAILS  (only created when an admin approves a trail_request)
-- ============================================================
create table public.trails (
  id                uuid primary key default gen_random_uuid(),
  slug              varchar(100) unique not null,
  name              varchar(120) not null,
  description       text default '',
  difficulty        varchar(20) check (difficulty in ('beginner','intermediate','advanced','expert')),
  terrain_type      varchar(40) default 'mixed',
  surface_tags      text[] default '{}',
  distance_miles    numeric(6,2) default 0,
  elevation_gain_ft integer default 0,
  location_name     varchar(120) default '',
  county            varchar(80) default '',
  state             varchar(2) default 'TX',
  lat               numeric(10,7),
  lng               numeric(10,7),
  coords            jsonb not null,              -- [[lat,lng], [lat,lng], ...]
  conditions        varchar(40) default 'Unknown',
  accent_color      varchar(9) default '#FF6B00',
  is_verified       boolean default true,
  is_featured       boolean default false,
  submitted_by      uuid references public.profiles(id),
  approved_by       uuid references public.profiles(id),
  request_id        uuid,                         -- originating trail_request, if any
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.trails enable row level security;

create policy "Verified trails are publicly readable"
  on public.trails for select using (is_verified = true);

create policy "Admins can do anything with trails"
  on public.trails for all using (public.is_admin(auth.uid()));


-- ============================================================
-- 3. TRAIL SECTORS  (auto-generated when a trail is created, editable by admin)
-- ============================================================
create table public.trail_sectors (
  id           uuid primary key default gen_random_uuid(),
  trail_id     uuid references public.trails(id) on delete cascade,
  name         varchar(80) not null,
  sort_order   integer not null default 0,
  start_pct    numeric(4,3) not null,
  end_pct      numeric(4,3) not null,
  terrain      varchar(60) default '',
  difficulty   varchar(20) default 'intermediate',
  created_at   timestamptz default now()
);

alter table public.trail_sectors enable row level security;

create policy "Sectors of verified trails are publicly readable"
  on public.trail_sectors for select using (
    exists (select 1 from public.trails t where t.id = trail_id and t.is_verified = true)
  );

create policy "Admins manage sectors"
  on public.trail_sectors for all using (public.is_admin(auth.uid()));


-- ============================================================
-- 4. TRAIL REQUESTS  (community submissions awaiting admin review)
-- ============================================================
create table public.trail_requests (
  id                    uuid primary key default gen_random_uuid(),
  submitted_by          uuid references public.profiles(id) not null,
  trail_name            varchar(120) not null,
  description           text default '',
  location_name         varchar(120) default '',
  county                varchar(80) default '',
  state                 varchar(2) default 'TX',
  terrain_type          varchar(40) default 'mixed',
  suggested_difficulty  varchar(20) default 'intermediate',
  surface_tags          text[] default '{}',
  coords                jsonb not null,            -- traced route [[lat,lng],...]
  distance_miles        numeric(6,2) default 0,
  elevation_gain_ft     integer default 0,
  photos                text[] default '{}',       -- Supabase Storage public URLs
  notes                 text default '',
  status                varchar(20) default 'pending'
                        check (status in ('pending','under_review','approved','rejected','needs_info')),
  admin_notes           text default '',
  reviewed_by           uuid references public.profiles(id),
  reviewed_at           timestamptz,
  resulting_trail_id    uuid references public.trails(id),
  created_at            timestamptz default now()
);

alter table public.trail_requests enable row level security;

create policy "Users see their own requests, admins see all"
  on public.trail_requests for select using (
    submitted_by = auth.uid() or public.is_admin(auth.uid())
  );

create policy "Authenticated users can submit trail requests"
  on public.trail_requests for insert with check (submitted_by = auth.uid());

create policy "Admins can update any trail request"
  on public.trail_requests for update using (public.is_admin(auth.uid()));

create policy "Users can delete their own pending requests"
  on public.trail_requests for delete using (submitted_by = auth.uid() and status = 'pending');


-- ============================================================
-- 5. BIKES  (rider garage)
-- ============================================================
create table public.bikes (
  id                uuid primary key default gen_random_uuid(),
  rider_id          uuid references public.profiles(id) on delete cascade not null,
  year              smallint not null,
  make              varchar(40) not null,
  model             varchar(80) not null,
  displacement_cc   smallint,
  color_primary     varchar(9) default '#FF6B00',
  color_secondary   varchar(9) default '#000000',
  plastics          varchar(40) default 'stock',
  graphics          varchar(40) default 'stock',
  wheels            varchar(40) default 'stock',
  tires             varchar(40) default 'stock',
  handguards        varchar(40) default 'none',
  exhaust           varchar(40) default 'stock',
  number_plate      varchar(10) default '',
  number_plate_color varchar(9) default '#FFFFFF',
  mods              text[] default '{}',
  notes             text default '',
  is_active         boolean default true,
  total_rides       integer default 0,
  total_miles       numeric(8,1) default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.bikes enable row level security;

create policy "Bikes are publicly readable"
  on public.bikes for select using (true);

create policy "Riders manage their own bikes"
  on public.bikes for all using (rider_id = auth.uid());


-- ============================================================
-- 6. LAP TIMES  (submissions → leaderboards)
-- ============================================================
create table public.lap_times (
  id              uuid primary key default gen_random_uuid(),
  trail_id        uuid references public.trails(id) on delete cascade not null,
  rider_id        uuid references public.profiles(id) not null,
  bike_id         uuid references public.bikes(id),
  time_ms         integer not null,
  time_display    varchar(20) not null,
  notes           text default '',
  video_url       text default '',
  conditions      varchar(40) default '',
  status          varchar(20) default 'pending' check (status in ('pending','approved','rejected')),
  is_record       boolean default false,
  reviewed_by     uuid references public.profiles(id),
  recorded_at     timestamptz default now(),
  created_at      timestamptz default now()
);

alter table public.lap_times enable row level security;

create policy "Approved laps are public, riders see their own pending laps"
  on public.lap_times for select using (
    status = 'approved' or rider_id = auth.uid() or public.is_admin(auth.uid())
  );

create policy "Authenticated riders can submit lap times"
  on public.lap_times for insert with check (rider_id = auth.uid());

create policy "Admins can update lap time status"
  on public.lap_times for update using (public.is_admin(auth.uid()));


-- ============================================================
-- 7. TRAIL REVIEWS
-- ============================================================
create table public.trail_reviews (
  id            uuid primary key default gen_random_uuid(),
  trail_id      uuid references public.trails(id) on delete cascade not null,
  rider_id      uuid references public.profiles(id) not null,
  rating        smallint check (rating between 1 and 5) not null,
  body          text default '',
  conditions    varchar(40) default '',
  created_at    timestamptz default now(),
  unique(trail_id, rider_id)
);

alter table public.trail_reviews enable row level security;

create policy "Reviews are publicly readable"
  on public.trail_reviews for select using (true);

create policy "Authenticated riders can leave one review per trail"
  on public.trail_reviews for insert with check (rider_id = auth.uid());

create policy "Riders can update their own review"
  on public.trail_reviews for update using (rider_id = auth.uid());


-- ============================================================
-- 8. COMMUNITY POSTS
-- ============================================================
create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  rider_id       uuid references public.profiles(id) not null,
  trail_id       uuid references public.trails(id),
  body           text not null,
  image_url      text,
  like_count     integer default 0,
  comment_count  integer default 0,
  created_at     timestamptz default now()
);

alter table public.posts enable row level security;

create policy "Posts are publicly readable"
  on public.posts for select using (true);

create policy "Authenticated riders can create posts"
  on public.posts for insert with check (rider_id = auth.uid());

create policy "Riders can edit or delete their own posts"
  on public.posts for update using (rider_id = auth.uid());

create policy "Riders can delete their own posts"
  on public.posts for delete using (rider_id = auth.uid());


create table public.post_likes (
  post_id     uuid references public.posts(id) on delete cascade,
  rider_id    uuid references public.profiles(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (post_id, rider_id)
);

alter table public.post_likes enable row level security;

create policy "Likes are publicly readable"
  on public.post_likes for select using (true);

create policy "Riders can like/unlike posts"
  on public.post_likes for insert with check (rider_id = auth.uid());

create policy "Riders can remove their own like"
  on public.post_likes for delete using (rider_id = auth.uid());

-- Keep posts.like_count in sync automatically
create or replace function public.handle_like_change()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif (tg_op = 'DELETE') then
    update public.posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger on_post_like_change
  after insert or delete on public.post_likes
  for each row execute procedure public.handle_like_change();


create table public.post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid references public.posts(id) on delete cascade,
  rider_id    uuid references public.profiles(id),
  body        text not null,
  created_at  timestamptz default now()
);

alter table public.post_comments enable row level security;

create policy "Comments are publicly readable"
  on public.post_comments for select using (true);

create policy "Authenticated riders can comment"
  on public.post_comments for insert with check (rider_id = auth.uid());

create policy "Riders can delete their own comments"
  on public.post_comments for delete using (rider_id = auth.uid());

create or replace function public.handle_comment_change()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif (tg_op = 'DELETE') then
    update public.posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger on_post_comment_change
  after insert or delete on public.post_comments
  for each row execute procedure public.handle_comment_change();


-- ============================================================
-- 9. NOTIFICATIONS
-- ============================================================
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  rider_id    uuid references public.profiles(id) on delete cascade not null,
  type        varchar(40) not null,
  message     text not null,
  link        text default '',
  read        boolean default false,
  created_at  timestamptz default now()
);

alter table public.notifications enable row level security;

create policy "Riders see only their own notifications"
  on public.notifications for select using (rider_id = auth.uid());

create policy "Riders can mark their own notifications read"
  on public.notifications for update using (rider_id = auth.uid());

create policy "System/admin can create notifications"
  on public.notifications for insert with check (true);


-- ============================================================
-- 10. ACHIEVEMENTS  (catalog + earned join table)
-- ============================================================
create table public.achievements (
  id           varchar(40) primary key,
  name         varchar(80) not null,
  description  text not null,
  icon         varchar(10) not null,
  category     varchar(30) default 'milestone',
  rarity       varchar(20) default 'common'
);

insert into public.achievements (id, name, description, icon, category, rarity) values
  ('first_lap',            'First Lap',              'Complete your first approved lap time.',              '🏁','milestone','common'),
  ('first_trail_request',  'Trail Scout',             'Submit your first trail request.',                    '🗺','exploration','common'),
  ('record_holder',        'Record Holder',          'Hold the fastest approved time on any trail.',         '⚡','competition','legendary'),
  ('garage_starter',       'Gear Head',               'Add 3 bikes to your garage.',                          '🔧','garage','uncommon'),
  ('community_voice',      'Community Contributor',  'Publish 10 posts to the community feed.',              '👥','community','uncommon'),
  ('trail_explorer',       'Trail Explorer',         'Record an approved lap on 5 different trails.',       '🧭','exploration','rare'),
  ('reviewer',             'Trail Critic',            'Leave 5 trail reviews.',                               '⭐','community','uncommon');

alter table public.achievements enable row level security;
create policy "Achievement catalog is publicly readable"
  on public.achievements for select using (true);

create table public.rider_achievements (
  rider_id        uuid references public.profiles(id) on delete cascade,
  achievement_id  varchar(40) references public.achievements(id),
  earned_at       timestamptz default now(),
  primary key (rider_id, achievement_id)
);

alter table public.rider_achievements enable row level security;
create policy "Earned achievements are publicly readable"
  on public.rider_achievements for select using (true);
create policy "System can grant achievements"
  on public.rider_achievements for insert with check (true);


-- ============================================================
-- 11. TRAIL CONDITION REPORTS  (riders report live conditions)
-- ============================================================
create table public.trail_condition_reports (
  id            uuid primary key default gen_random_uuid(),
  trail_id      uuid references public.trails(id) on delete cascade not null,
  rider_id      uuid references public.profiles(id) not null,
  category      varchar(20) check (category in ('dust','mud','sand','ruts','visibility','closed','clear')),
  note          text default '',
  created_at    timestamptz default now()
);

alter table public.trail_condition_reports enable row level security;

create policy "Condition reports are publicly readable"
  on public.trail_condition_reports for select using (true);

create policy "Authenticated riders can file condition reports"
  on public.trail_condition_reports for insert with check (rider_id = auth.uid());


-- ============================================================
-- VIEWS — convenient pre-joined reads for the frontend
-- ============================================================

-- Best (current record) lap per trail
create or replace view public.trail_records as
select distinct on (lt.trail_id)
  lt.trail_id, lt.id as lap_id, lt.time_ms, lt.time_display, lt.recorded_at,
  p.id as rider_id, p.display_name as rider_name, p.username as rider_username,
  p.avatar_color, p.avatar_initials,
  b.year, b.make, b.model
from public.lap_times lt
join public.profiles p on p.id = lt.rider_id
left join public.bikes b on b.id = lt.bike_id
where lt.status = 'approved'
order by lt.trail_id, lt.time_ms asc;

-- Trail rating aggregate
create or replace view public.trail_ratings as
select trail_id, round(avg(rating)::numeric,2) as rating_avg, count(*) as rating_count
from public.trail_reviews
group by trail_id;


-- ============================================================
-- STORAGE — bucket for trail request photos & profile avatars
-- ============================================================
insert into storage.buckets (id, name, public)
values ('motohub-uploads', 'motohub-uploads', true)
on conflict (id) do nothing;

create policy "Public read access to uploads"
  on storage.objects for select using (bucket_id = 'motohub-uploads');

create policy "Authenticated users can upload files"
  on storage.objects for insert with check (
    bucket_id = 'motohub-uploads' and auth.role() = 'authenticated'
  );

create policy "Users can delete their own uploads"
  on storage.objects for delete using (
    bucket_id = 'motohub-uploads' and owner = auth.uid()
  );

-- ============================================================
-- DONE.
-- Next: create your first admin account by signing up normally
-- through the site, then run this once (replace the email):
--
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
-- ============================================================
