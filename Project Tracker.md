# MotoHub — Project Tracker

This file is the single source of truth for system state, feature tracking, and technical debt.

---

# 🧠 SYSTEM STATE SNAPSHOT

## Backend
- Supabase (Postgres + Auth + Storage)
- RLS enabled on all tables
- Client-side API layer (no backend server / Edge Functions)

## Realtime
- ❌ NOT implemented (no subscriptions / sockets)

## Mobile
- Web app only
- No native iOS/Android build
- No PWA support

## Media System
- Basic Supabase Storage uploads
- No compression / optimization pipeline

## Admin System
- Fully functional admin panel (admin.html)
- Direct DB moderation tools

## Auto Systems
- Client-side logic + DB triggers
- Notification system is event-based but not realtime

---

# 📦 FEATURE TRACKER

Legend:
- [x] Complete
- [~] Partial / buggy / incomplete
- [ ] Not implemented

---

## 🔐 Core Systems
- [x] Auth system (login, register, session handling)
- [x] Supabase client setup
- [x] Setup gate fallback (config missing protection)
- [x] Profile system (CRUD + avatar upload)
- [x] Admin detection system

---

## 👤 Profiles
- [x] Profile pages
- [x] Stats system (laps, trails, records, bikes, followers)
- [x] Avatar upload system
- [x] Edit profile modal
- [x] Member search system

---

## 🧑‍🤝‍🧑 Social System
- [x] Posts system
- [x] Likes system
- [x] Comments system
- [x] Followers / Following system
- [x] Feed generation
- [x] Trail-tagged posts
- [~] Comment deletion UI (backend exists, UI missing)

---

## 🖼 Media System
- [x] Image uploads (posts, avatars, trail requests)
- [x] Supabase storage buckets
- [~] No file validation / compression
- [~] No broken-image fallback handling
- [ ] Video uploads
- [ ] GIF support

---

## 🏁 Trail System
- [x] Trail database
- [x] Trail request system (wizard)
- [x] Trail approval workflow
- [x] Trail detail pages
- [x] Trail condition reports
- [x] Trail leaderboard system
- [x] KML / KMZ import
- [x] Trail tracer (map drawing system)
- [~] Trail sectors exist but no UI creation
- [~] Featured trails not used in UI

---

## 🏍 Bike System
- [x] Bike database
- [x] Bike profiles
- [x] Bike customizer UI
- [x] Canvas vehicle rendering system
- [~] Bike stats (rides/miles) not updated
- [~] Some schema fields unused (mods, parts system)
- [ ] Marketplace / listings system

---

## 🏆 Leaderboards
- [x] Trail leaderboards
- [x] Global leaderboard
- [x] Record progression charts
- [~] is_record flag exists but not displayed
- [ ] Seasonal leaderboards

---

## 🔔 Notifications
- [x] Notification system (DB-backed)
- [x] Notification types (followers, laps, trails, achievements)
- [x] Unread indicator
- [~] Notification links unused
- [ ] Real-time notifications

---

## 🌤 Weather / APIs
- [x] Open-Meteo integration
- [x] Riding score algorithm
- [x] Trail-specific weather UI
- [ ] Multi-provider weather fallback system

---

## 🎨 UI / UX
- [x] SPA router (hash-based)
- [x] Animated home hero
- [x] Canvas-based procedural visuals
- [x] Modal system
- [x] Toast system
- [x] Mobile navigation
- [~] No keyboard accessibility system (esc traps, focus lock missing)
- [~] No PWA support

---

## 🛠 Admin System
- [x] Trail request moderation
- [x] Lap approval system
- [x] Rider management
- [x] Trail management
- [x] Review moderation
- [~] Admin logging system missing
- [~] No audit trail for admin actions

---

## ⚙ Backend / Infra
- [x] 14 core database tables
- [x] 2 database views
- [x] Auth trigger system
- [x] Like/comment triggers
- [x] Storage buckets
- [~] Over-permissive notification insert policy
- [~] Some unused DB fields
- [ ] Edge Functions (not used at all)
- [ ] Server-side API layer

---

## 📱 Mobile / App
- [x] Responsive layout
- [x] Mobile nav system
- [~] No PWA
- [ ] Native app (iOS / Android)
- [ ] GPS tracking system
- [ ] Offline mode

---

## 🚧 TECH DEBT
- Notifications not real-time
- Some DB fields unused (bike stats, trail sectors, is_record)
- No media optimization pipeline
- No server-side logic layer
- No audit logs for admin actions
- Some security looseness in notification inserts
- Trail sectors not exposed in UI creation flow

---

# 📌 PRIORITY ROADMAP ALIGNMENT

## 1.02 (Current Focus)
- DMs system
- Notifications system (improve / real-time)
- Bike status + marketplace tags
- UI polish + update logs
- Profile/social enhancements

## 1.03
- Parts finder
- Video uploads
- Ratings system
- Motorsport expansion (cars / sim / MX hubs)

## Future
- GPS tracking app
- Native mobile app
- Marketplace system
- Track partnerships
