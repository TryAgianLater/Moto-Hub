# 🏍 MotoHub

**The home of off-road riding.** A real, working community platform for dirt bike and ATV trail riders — trail discovery, an interactive route tracer, lap time leaderboards, a bike garage, live weather, and a moderation-backed trail request system.

No demo data. No mock content. Everything you see after setup is real data created by real accounts.

---

## What this actually is

- **Frontend:** Plain HTML/CSS/JS. No build step, no npm install, no server. Open `index.html` and it runs.
- **Backend:** [Supabase](https://supabase.com) — a real, hosted PostgreSQL database with authentication, file storage, and row-level security. Free to start. You are not running or paying for a server; Supabase is.
- **Weather:** [Open-Meteo](https://open-meteo.com) — free, real, no API key needed.
- **Maps:** [Leaflet](https://leafletjs.com) + free OpenStreetMap tiles by default. Optional Mapbox upgrade.

This is the same architecture pattern used by a huge number of real, funded startups — a static frontend talking directly to a managed backend. There is no fake server pretending to be real; Supabase **is** the real server.

---

## Setup (about 10 minutes, one time)

### 1. Create a free Supabase project
Go to [supabase.com](https://supabase.com) → New Project. Pick any name/region/password (save the DB password somewhere). Wait ~2 minutes for it to spin up.

### 2. Run the database schema
In your new project, go to **SQL Editor** → **New Query**. Open `supabase-schema.sql` from this folder, copy the entire file, paste it in, and click **Run**. This creates every table, security rule, and storage bucket MotoHub needs.

### 3. Get your API keys
Go to **Project Settings → API**. Copy:
- **Project URL**
- **anon public** key

### 4. Edit `config.js`
Open `config.js` in this folder and paste your two values in:

```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGci...",
```

Save the file.

### 5. Open it
Double-click `index.html`, or push this whole folder to GitHub Pages / Netlify / Vercel and visit the URL. That's it — the site is live and fully functional.

### 6. Make yourself an admin
1. On the live site, click **Sign Up** and create your own account normally.
2. Back in Supabase, go to **SQL Editor** and run (replacing the email):

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

3. Open `admin.html` and log in with that same account. You now have full admin access — approving trail requests, lap times, reviews, and managing riders.

> **Note on email confirmation:** Supabase requires email confirmation by default. For quick testing, go to **Authentication → Providers → Email** in your Supabase dashboard and turn off "Confirm email" — new signups will be able to log in immediately. Turn it back on before a real public launch.

---

## File structure

```
motohub/
├── index.html              # The entire public site (home, trails, map, leaderboards,
│                            #   community, garage, profiles, dashboard, auth, trail
│                            #   request wizard with the route tracer)
├── admin.html               # Admin panel — login-gated, approves/rejects real submissions
├── app.js                   # Shared logic: Supabase calls, map engine, route tracer,
│                            #   weather fetching, formatting helpers, toast notifications
├── config.js                # ⚠️ THE ONLY FILE YOU EDIT — your Supabase URL + key
├── supabase-schema.sql      # Run once in Supabase's SQL Editor to build the database
├── css/
│   └── styles.css           # All visual styling
└── README.md                # This file
```

Keep all files in the same folder, in this same relative structure — `index.html` loads `css/styles.css`, `config.js`, and `app.js` by relative path.

---

## What's real vs. what's a thin honest layer

| Feature | How it works |
|---|---|
| Accounts, login, sessions | Real Supabase Auth (email + password) |
| Trails, lap times, reviews, posts | Real Postgres rows, governed by row-level security policies in the schema |
| Trail request → admin approval → live trail | Real workflow: a `trail_requests` row only becomes a public `trails` row when an admin clicks Approve in `admin.html` |
| Route tracer | Click-to-draw on a real Leaflet map; distance computed with the Haversine formula from your actual clicked points; elevation gain is a terrain-based estimate (clearly labeled as such) |
| Weather & riding score | Live current conditions + 7-day forecast from Open-Meteo for the trail's real coordinates; the riding score is computed from that live wind/rain/heat/visibility data, not canned |
| Lap "replay" | Animates a marker along the trail's real traced route, paced to match the rider's actual recorded total time (labeled as estimated-pace, since no second-by-second GPS exists unless you add GPX upload later) |
| Bike garage customizer | Real saved bike records (year/make/model/colors/mods/number plate) with a live canvas preview |
| Achievements | Defined in the database (`achievements` table); awarding logic is intentionally left for you to wire into a Postgres trigger or a small Edge Function once you decide the exact rules (e.g. "first approved lap" → insert into `rider_achievements`) — the schema, UI, and display are fully built and ready for it |

---

## Admin panel

Open `admin.html`. Only accounts with `is_admin = true` in the database can get past login — this is enforced both in the UI and by the database's row-level security, not just hidden client-side.

From there you can:
- Approve, reject, or request more info on submitted trails — approving instantly creates the live, public trail
- Approve or reject submitted lap times before they appear on any leaderboard
- Remove reviews
- Feature/unfeature or delete trails
- Promote other riders to admin, or mark them verified
- See exactly which external services are connected (Supabase, weather, maps, storage, auth) under **Connections**

---

## Upgrading the map later (optional)

By default, maps use free OpenStreetMap tiles — no signup, works immediately. If you want premium terrain/satellite tiles:

1. Get a free token at [account.mapbox.com](https://account.mapbox.com)
2. In `config.js`, set:
```js
MAP_PROVIDER: "mapbox",
MAPBOX_TOKEN: "pk.your_token_here",
```

No other code changes needed.

---

## Roadmap ideas (not built yet, schema is ready for them)

- GPX file upload for real second-by-second replay
- Riding clubs and group events
- Push notifications
- Achievement auto-awarding via Postgres triggers
- Native mobile app

---

*Built for West Texas riders. Seminole, TX 🤠*
