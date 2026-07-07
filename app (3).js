/**
 * ============================================================
 * MOTOHUB — APPLICATION CORE
 * ============================================================
 * Shared by index.html and admin.html.
 * Contains: Supabase client, all data access functions (API),
 * the map engine + trail tracer, weather fetching, and utilities.
 *
 * Nothing in this file renders HTML — it's pure data/logic.
 * Page rendering lives inside index.html / admin.html.
 * ============================================================
 */

// ── Supabase Client ────────────────────────────────────────────────────────
const CFG = window.MOTOHUB_CONFIG || {};
const SUPABASE_READY = CFG.SUPABASE_URL &&
  CFG.SUPABASE_URL !== "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE" &&
  CFG.SUPABASE_ANON_KEY &&
  CFG.SUPABASE_ANON_KEY !== "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";

let sb = null;
if (SUPABASE_READY && window.supabase) {
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
}

/**
 * Call this at the top of any page render to block usage until configured.
 * Returns true if blocked (caller should stop rendering normal content).
 */
function renderSetupGateIfNeeded(targetEl) {
  if (SUPABASE_READY) return false;
  targetEl.innerHTML = `
    <div style="min-height:80vh;display:flex;align-items:center;justify-content:center;padding:40px 20px">
      <div style="max-width:560px;text-align:center">
        <div style="font-size:40px;margin-bottom:16px">🔧</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:36px;letter-spacing:0.04em;color:#fff;margin-bottom:12px">SETUP REQUIRED</div>
        <p style="color:#B8B3AC;font-size:14px;line-height:1.8;margin-bottom:24px">
          MotoHub needs to be connected to a database before it can run.
          Open <code style="background:#1E1E1E;padding:2px 8px;border-radius:4px;color:#FF6B00">config.js</code>
          in this folder and paste in your Supabase project URL and anon key.
        </p>
        <p style="color:#7A7570;font-size:13px;line-height:1.8">
          Full setup instructions are in <strong style="color:#B8B3AC">README.md</strong> —
          it takes about 10 minutes and the free tier is more than enough to launch on.
        </p>
      </div>
    </div>`;
  return true;
}

// ── Auth API ───────────────────────────────────────────────────────────────
const Auth = {
  _currentProfile: null,

  async getSession() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session || null;
  },

  async getCurrentProfile(force = false) {
    if (!sb) return null;
    if (this._currentProfile && !force) return this._currentProfile;
    const session = await this.getSession();
    if (!session) { this._currentProfile = null; return null; }
    const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    if (error) { this._currentProfile = null; return null; }
    this._currentProfile = data;
    return data;
  },

  async register({ email, password, username, displayName, location, ridingLevel }) {
    if (!sb) return { error: 'Not connected to database.' };
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { username, display_name: displayName, location, riding_level: ridingLevel } }
    });
    if (error) return { error: error.message };
    return { data };
  },

  async login(email, password) {
    if (!sb) return { error: 'Not connected to database.' };
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    this._currentProfile = null;
    return { data };
  },

  async logout() {
    if (!sb) return;
    await sb.auth.signOut();
    this._currentProfile = null;
  },

  async updateProfile(updates) {
    const profile = await this.getCurrentProfile();
    if (!profile) return { error: 'Not logged in.' };
    const { data, error } = await sb.from('profiles').update(updates).eq('id', profile.id).select().single();
    if (error) return { error: error.message };
    this._currentProfile = data;
    return { data };
  },

  async uploadAvatar(file) {
    if (!sb) return { error: 'Not connected.' };
    const profile = await this.getCurrentProfile();
    if (!profile) return { error: 'Not logged in.' };
    const ext = file.name.split('.').pop();
    const path = `avatars/${profile.id}_${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from('motohub-uploads').upload(path, file, { upsert: true });
    if (upErr) return { error: upErr.message };
    const { data: pub } = sb.storage.from('motohub-uploads').getPublicUrl(path);
    return this.updateProfile({ avatar_url: pub.publicUrl });
  },
};

// ── Trails API ─────────────────────────────────────────────────────────────
const TrailsAPI = {
  async getAll() {
    if (!sb) return [];
    const { data, error } = await sb.from('trails').select('*').eq('is_verified', true).order('created_at', { ascending: false });
    return error ? [] : data;
  },

  async getBySlug(slug) {
    if (!sb) return null;
    const { data, error } = await sb.from('trails').select('*').eq('slug', slug).single();
    return error ? null : data;
  },

  async getSectors(trailId) {
    if (!sb) return [];
    const { data, error } = await sb.from('trail_sectors').select('*').eq('trail_id', trailId).order('sort_order');
    return error ? [] : data;
  },

  async getRecord(trailId) {
    if (!sb) return null;
    const { data, error } = await sb.from('trail_records').select('*').eq('trail_id', trailId).single();
    return error ? null : data;
  },

  async getReviews(trailId) {
    if (!sb) return [];
    const { data, error } = await sb
      .from('trail_reviews')
      .select('*, profiles!trail_reviews_rider_id_fkey(display_name, avatar_color, avatar_initials)')
      .eq('trail_id', trailId)
      .order('created_at', { ascending: false });
    return error ? [] : data;
  },

  async getRatingSummary(trailId) {
    if (!sb) return { rating_avg: 0, rating_count: 0 };
    const { data, error } = await sb.from('trail_ratings').select('*').eq('trail_id', trailId).single();
    return error || !data ? { rating_avg: 0, rating_count: 0 } : data;
  },

  async submitReview(trailId, rating, body, conditions) {
    const profile = await Auth.getCurrentProfile();
    if (!profile) return { error: 'You must be logged in to leave a review.' };
    const { data, error } = await sb.from('trail_reviews')
      .upsert({ trail_id: trailId, rider_id: profile.id, rating, body, conditions }, { onConflict: 'trail_id,rider_id' })
      .select().single();
    return error ? { error: error.message } : { data };
  },

  async getConditionReports(trailId) {
    if (!sb) return [];
    const { data, error } = await sb
      .from('trail_condition_reports')
      .select('*, profiles!trail_condition_reports_rider_id_fkey(display_name, avatar_initials)')
      .eq('trail_id', trailId)
      .order('created_at', { ascending: false })
      .limit(10);
    return error ? [] : data;
  },

  async submitConditionReport(trailId, category, note) {
    const profile = await Auth.getCurrentProfile();
    if (!profile) return { error: 'You must be logged in to submit a report.' };
    const { data, error } = await sb.from('trail_condition_reports')
      .insert({ trail_id: trailId, rider_id: profile.id, category, note }).select().single();
    return error ? { error: error.message } : { data };
  },
};

// ── Trail Requests API ─────────────────────────────────────────────────────
const TrailRequestsAPI = {
  async submit(payload) {
    const profile = await Auth.getCurrentProfile();
    if (!profile) return { error: 'You must be logged in to request a trail.' };
    const { data, error } = await sb.from('trail_requests').insert({
      submitted_by: profile.id,
      trail_name: payload.trailName,
      description: payload.description,
      location_name: payload.locationName,
      county: payload.county || '',
      state: payload.state || 'TX',
      terrain_type: payload.terrainType,
      suggested_difficulty: payload.difficulty,
      surface_tags: payload.surfaceTags || [],
      coords: payload.coords,
      distance_miles: payload.distanceMiles,
      elevation_gain_ft: payload.elevationGainFt || 0,
      photos: payload.photos || [],
      notes: payload.notes || '',
    }).select().single();
    return error ? { error: error.message } : { data };
  },

  async getMine() {
    const profile = await Auth.getCurrentProfile();
    if (!profile || !sb) return [];
    const { data, error } = await sb.from('trail_requests').select('*').eq('submitted_by', profile.id).order('created_at', { ascending: false });
    return error ? [] : data;
  },

  async getAll() {
    if (!sb) return [];
    const { data, error } = await sb.from('trail_requests')
      .select('*, submitter:profiles!trail_requests_submitted_by_fkey(id,display_name,username)')
      .order('created_at', { ascending: false });
    return error ? [] : data;
  },

  async uploadPhoto(file) {
    if (!sb) return { error: 'Not connected.' };
    const profile = await Auth.getCurrentProfile();
    const ext = file.name.split('.').pop();
    const path = `trail-requests/${profile.id}_${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('motohub-uploads').upload(path, file);
    if (error) return { error: error.message };
    const { data } = sb.storage.from('motohub-uploads').getPublicUrl(path);
    return { url: data.publicUrl };
  },
};

// ── Lap Times API ──────────────────────────────────────────────────────────
const LapTimesAPI = {
  async submit(payload) {
    const profile = await Auth.getCurrentProfile();
    if (!profile) return { error: 'You must be logged in to submit a time.' };
    const { data, error } = await sb.from('lap_times').insert({
      trail_id: payload.trailId,
      rider_id: profile.id,
      bike_id: payload.bikeId || null,
      time_ms: payload.timeMs,
      time_display: Utils.msToDisplay(payload.timeMs),
      notes: payload.notes || '',
      video_url: payload.videoUrl || '',
      conditions: payload.conditions || '',
    }).select().single();
    return error ? { error: error.message } : { data };
  },

  async getLeaderboard(trailId, limit = 25) {
    if (!sb) return [];
    const { data, error } = await sb
      .from('lap_times')
      .select('*, profiles!lap_times_rider_id_fkey(display_name, username, avatar_color, avatar_initials, location), bikes(year, make, model)')
      .eq('trail_id', trailId)
      .eq('status', 'approved')
      .order('time_ms', { ascending: true })
      .limit(limit);
    return error ? [] : data;
  },

  async getRecordHistory(trailId) {
    if (!sb) return [];
    const { data, error } = await sb
      .from('lap_times')
      .select('time_ms, time_display, recorded_at, profiles!lap_times_rider_id_fkey(display_name, avatar_color, avatar_initials)')
      .eq('trail_id', trailId)
      .eq('status', 'approved')
      .order('recorded_at', { ascending: true });
    if (error || !data) return [];
    let best = Infinity;
    const progression = [];
    data.forEach(lap => {
      if (lap.time_ms < best) { best = lap.time_ms; progression.push(lap); }
    });
    return progression;
  },

  async getGlobalLeaderboard(limit = 50) {
    if (!sb) return [];
    const { data, error } = await sb
      .from('lap_times')
      .select('rider_id, time_ms, trail_id, profiles!lap_times_rider_id_fkey(display_name, username, avatar_color, avatar_initials, location)')
      .eq('status', 'approved');
    if (error || !data) return [];
    const byRider = {};
    data.forEach(lap => {
      if (!byRider[lap.rider_id]) byRider[lap.rider_id] = { profile: lap.profiles, laps: 0, trails: new Set(), bestMs: Infinity };
      byRider[lap.rider_id].laps++;
      byRider[lap.rider_id].trails.add(lap.trail_id);
      if (lap.time_ms < byRider[lap.rider_id].bestMs) byRider[lap.rider_id].bestMs = lap.time_ms;
    });
    return Object.values(byRider)
      .sort((a, b) => b.laps - a.laps)
      .slice(0, limit)
      .map(r => ({ ...r, trailsRidden: r.trails.size }));
  },

  async getMine() {
    const profile = await Auth.getCurrentProfile();
    if (!profile || !sb) return [];
    const { data, error } = await sb.from('lap_times').select('*, trails(name, slug)').eq('rider_id', profile.id).order('created_at', { ascending: false });
    return error ? [] : data;
  },
};

// ── Bikes API ──────────────────────────────────────────────────────────────
const BikesAPI = {
  async getForRider(riderId) {
    if (!sb) return [];
    const { data, error } = await sb.from('bikes').select('*').eq('rider_id', riderId).order('created_at', { ascending: false });
    return error ? [] : data;
  },

  async create(payload) {
    const profile = await Auth.getCurrentProfile();
    if (!profile) return { error: 'You must be logged in.' };
    const { data, error } = await sb.from('bikes').insert({ ...payload, rider_id: profile.id }).select().single();
    return error ? { error: error.message } : { data };
  },

  async update(bikeId, updates) {
    const { data, error } = await sb.from('bikes').update(updates).eq('id', bikeId).select().single();
    return error ? { error: error.message } : { data };
  },

  async delete(bikeId) {
    const { error } = await sb.from('bikes').delete().eq('id', bikeId);
    return error ? { error: error.message } : { success: true };
  },
};

// ── Community API ──────────────────────────────────────────────────────────
const CommunityAPI = {
  async getFeed(limit = 30) {
    if (!sb) return [];
    const { data, error } = await sb
      .from('posts')
      .select('*, profiles!posts_rider_id_fkey(display_name, username, avatar_color, avatar_initials), trails(name, slug)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];

    // attach whether current user liked each post
    const profile = await Auth.getCurrentProfile();
    if (profile) {
      const { data: likes } = await sb.from('post_likes').select('post_id').eq('rider_id', profile.id);
      const likedIds = new Set((likes || []).map(l => l.post_id));
      data.forEach(p => p.liked = likedIds.has(p.id));
    }
    return data;
  },

  async create(body, trailId, imageUrl) {
    const profile = await Auth.getCurrentProfile();
    if (!profile) return { error: 'You must be logged in to post.' };
    const { data, error } = await sb.from('posts').insert({
      rider_id: profile.id, trail_id: trailId || null, body, image_url: imageUrl || null,
    }).select().single();
    return error ? { error: error.message } : { data };
  },

  async toggleLike(postId, currentlyLiked) {
    const profile = await Auth.getCurrentProfile();
    if (!profile) return { error: 'You must be logged in.' };
    if (currentlyLiked) {
      await sb.from('post_likes').delete().eq('post_id', postId).eq('rider_id', profile.id);
      return { liked: false };
    } else {
      await sb.from('post_likes').insert({ post_id: postId, rider_id: profile.id });
      return { liked: true };
    }
  },

  async getComments(postId) {
    if (!sb) return [];
    const { data, error } = await sb
      .from('post_comments')
      .select('*, profiles!post_comments_rider_id_fkey(display_name, avatar_initials, avatar_color)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    return error ? [] : data;
  },

  async addComment(postId, body) {
    const profile = await Auth.getCurrentProfile();
    if (!profile) return { error: 'You must be logged in to comment.' };
    const { data, error } = await sb.from('post_comments').insert({ post_id: postId, rider_id: profile.id, body }).select().single();
    return error ? { error: error.message } : { data };
  },

  async uploadImage(file) {
    if (!sb) return { error: 'Not connected.' };
    const profile = await Auth.getCurrentProfile();
    const ext = file.name.split('.').pop();
    const path = `posts/${profile.id}_${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('motohub-uploads').upload(path, file);
    if (error) return { error: error.message };
    const { data } = sb.storage.from('motohub-uploads').getPublicUrl(path);
    return { url: data.publicUrl };
  },
};

// ── Profiles / Riders API ──────────────────────────────────────────────────
const RidersAPI = {
  async getByUsername(username) {
    if (!sb) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('username', username).single();
    return error ? null : data;
  },

  async getAll() {
    if (!sb) return [];
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    return error ? [] : data;
  },

  async getStats(riderId) {
    if (!sb) return { trails: 0, laps: 0, records: 0 };
    const { data: laps } = await sb.from('lap_times').select('trail_id, time_ms').eq('rider_id', riderId).eq('status', 'approved');
    const { data: records } = await sb.from('trail_records').select('trail_id').eq('rider_id', riderId);
    const trailSet = new Set((laps || []).map(l => l.trail_id));
    return { trails: trailSet.size, laps: (laps || []).length, records: (records || []).length };
  },

  async getAchievements(riderId) {
    if (!sb) return [];
    const { data, error } = await sb.from('rider_achievements').select('*, achievements(*)').eq('rider_id', riderId);
    return error ? [] : data.map(d => d.achievements);
  },

  /**
   * Search riders by username or display name. Used by the Members page.
   */
  async search(query, limit = 24) {
    if (!sb || !query || !query.trim()) return [];
    // Strip characters that would break the PostgREST .or() filter syntax
    const q = query.trim().replace(/[,()%]/g, '');
    if (!q) return [];
    const { data, error } = await sb.from('profiles')
      .select('*')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(limit);
    return error ? [] : data;
  },

  /**
   * Return up to 5 riders who share a similar location string,
   * excluding the profile owner and anyone they already follow.
   * Simple ilike match only — no geocoding, no external APIs.
   */
  async getSuggested(excludeId, location, limit = 5) {
    if (!sb || !excludeId || !location || !location.trim()) return [];
    const keyword = location.trim().split(/[\s,]+/)[0];
    if (!keyword || keyword.length < 3) return [];
    const { data, error } = await sb.from('profiles')
      .select('*')
      .ilike('location', `%${keyword}%`)
      .neq('id', excludeId)
      .limit(limit + 10);
    if (error || !data) return [];
    try {
      const { data: following } = await sb.from('follows').select('following_id').eq('follower_id', excludeId);
      const followingIds = new Set((following || []).map(f => f.following_id));
      return data.filter(r => !followingIds.has(r.id)).slice(0, limit);
    } catch {
      return data.slice(0, limit);
    }
  },
};

// ── Follow API (followers / following) ──────────────────────────────────────
const FollowAPI = {
  async follow(targetId) {
    const profile = await Auth.getCurrentProfile();
    if (!profile) return { error: 'You must be logged in to follow riders.' };
    if (profile.id === targetId) return { error: "You can't follow yourself." };
    const { error } = await sb.from('follows').insert({ follower_id: profile.id, following_id: targetId });
    if (error && !/duplicate/i.test(error.message)) return { error: error.message };
    sb.from('notifications').insert({
      rider_id: targetId, type: 'new_follower',
      message: `${profile.display_name} started following you.`,
    }).then(() => {});
    return { success: true };
  },

  async unfollow(targetId) {
    const profile = await Auth.getCurrentProfile();
    if (!profile) return { error: 'Not logged in.' };
    const { error } = await sb.from('follows').delete().eq('follower_id', profile.id).eq('following_id', targetId);
    return error ? { error: error.message } : { success: true };
  },

  async isFollowing(targetId) {
    const profile = await Auth.getCurrentProfile();
    if (!profile || !sb) return false;
    const { data } = await sb.from('follows').select('follower_id').eq('follower_id', profile.id).eq('following_id', targetId).maybeSingle();
    return !!data;
  },

  async getFollowerCount(riderId) {
    if (!sb) return 0;
    const { count } = await sb.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', riderId);
    return count || 0;
  },

  async getFollowingCount(riderId) {
    if (!sb) return 0;
    const { count } = await sb.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', riderId);
    return count || 0;
  },

  async getFollowers(riderId, limit = 100) {
    if (!sb) return [];
    const { data, error } = await sb.from('follows').select('profiles!follows_follower_id_fkey(*)').eq('following_id', riderId).limit(limit);
    return error ? [] : data.map(d => d.profiles).filter(Boolean);
  },

  async getFollowing(riderId, limit = 100) {
    if (!sb) return [];
    const { data, error } = await sb.from('follows').select('profiles!follows_following_id_fkey(*)').eq('follower_id', riderId).limit(limit);
    return error ? [] : data.map(d => d.profiles).filter(Boolean);
  },
};

// ── Notifications API ──────────────────────────────────────────────────────
const NotificationsAPI = {
  async getMine(limit = 20) {
    const profile = await Auth.getCurrentProfile();
    if (!profile || !sb) return [];
    const { data, error } = await sb.from('notifications').select('*').eq('rider_id', profile.id).order('created_at', { ascending: false }).limit(limit);
    return error ? [] : data;
  },

  async getUnreadCount() {
    const profile = await Auth.getCurrentProfile();
    if (!profile || !sb) return 0;
    const { count } = await sb.from('notifications').select('*', { count: 'exact', head: true }).eq('rider_id', profile.id).eq('read', false);
    return count || 0;
  },

  async markAllRead() {
    const profile = await Auth.getCurrentProfile();
    if (!profile || !sb) return;
    await sb.from('notifications').update({ read: true }).eq('rider_id', profile.id).eq('read', false);
  },
};

// ── Stats API (platform-wide, real counts) ─────────────────────────────────
const StatsAPI = {
  async getPlatformStats() {
    if (!sb) return { trails: 0, riders: 0, laps: 0, bikes: 0 };
    const [{ count: trails }, { count: riders }, { count: laps }, { count: bikes }] = await Promise.all([
      sb.from('trails').select('*', { count: 'exact', head: true }).eq('is_verified', true),
      sb.from('profiles').select('*', { count: 'exact', head: true }),
      sb.from('lap_times').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      sb.from('bikes').select('*', { count: 'exact', head: true }),
    ]);
    return { trails: trails || 0, riders: riders || 0, laps: laps || 0, bikes: bikes || 0 };
  },
};


// ── Achievements (catalog + the actual awarding logic) ─────────────────────
// NOTE: the catalog and rider_achievements tables existed in the original
// schema, but nothing ever inserted a row — this is the missing piece that
// actually grants them. checkAndAward() is safe to call repeatedly: it only
// inserts achievements the rider doesn't already have.
const AchievementsAPI = {
  async getAll() {
    if (!sb) return [];
    const { data, error } = await sb.from('achievements').select('*');
    return error ? [] : data;
  },

  async getForRider(riderId) {
    if (!sb || !riderId) return [];
    const { data, error } = await sb.from('rider_achievements').select('achievement_id, earned_at, achievements(*)').eq('rider_id', riderId);
    return error ? [] : data.map(d => ({ ...d.achievements, earned_at: d.earned_at }));
  },

  /**
   * Computes which achievements a rider has actually qualified for based on
   * their real data, and inserts any newly-earned ones. Returns the list of
   * achievement objects newly awarded (empty if none).
   */
  async checkAndAward(riderId) {
    if (!sb || !riderId) return [];

    const [{ data: existing }, { data: laps }, { data: bikes }, { data: posts },
           { data: reviews }, { data: requests }, { data: records }, catalog] = await Promise.all([
      sb.from('rider_achievements').select('achievement_id').eq('rider_id', riderId),
      sb.from('lap_times').select('trail_id').eq('rider_id', riderId).eq('status', 'approved'),
      sb.from('bikes').select('id').eq('rider_id', riderId),
      sb.from('posts').select('id').eq('rider_id', riderId),
      sb.from('trail_reviews').select('id').eq('rider_id', riderId),
      sb.from('trail_requests').select('id').eq('submitted_by', riderId),
      sb.from('trail_records').select('trail_id').eq('rider_id', riderId),
      this.getAll(),
    ]);

    const have = new Set((existing || []).map(e => e.achievement_id));
    const distinctTrails = new Set((laps || []).map(l => l.trail_id));
    const qualifies = {
      first_lap:           (laps || []).length >= 1,
      first_trail_request: (requests || []).length >= 1,
      garage_starter:       (bikes || []).length >= 3,
      community_voice:       (posts || []).length >= 10,
      trail_explorer:        distinctTrails.size >= 5,
      reviewer:             (reviews || []).length >= 5,
      record_holder:        (records || []).length >= 1,
    };

    const toAward = Object.keys(qualifies).filter(id => qualifies[id] && !have.has(id) && catalog.some(c => c.id === id));
    if (!toAward.length) return [];

    const { error } = await sb.from('rider_achievements').insert(
      toAward.map(id => ({ rider_id: riderId, achievement_id: id }))
    );
    if (error) { console.error('[AchievementsAPI] award failed', error); return []; }

    const awardedObjs = catalog.filter(c => toAward.includes(c.id));
    awardedObjs.forEach(a => {
      sb.from('notifications').insert({
        rider_id: riderId, type: 'achievement_earned',
        message: `You earned the "${a.name}" achievement!`,
      }).then(() => {});
    });

    return awardedObjs;
  },
};


// ── Weather (Open-Meteo — free, real, no API key required) ─────────────────
const WeatherAPI = {
  async getForLocation(lat, lng) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,uv_index,visibility,weather_code` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,weather_code` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather request failed');
      const json = await res.json();
      return this._transform(json);
    } catch (e) {
      console.error('[Weather] fetch failed', e);
      return null;
    }
  },

  _weatherIcon(code) {
    if (code === 0) return '☀️';
    if ([1,2,3].includes(code)) return '🌤';
    if ([45,48].includes(code)) return '🌫';
    if ([51,53,55,56,57].includes(code)) return '🌦';
    if ([61,63,65,66,67,80,81,82].includes(code)) return '🌧';
    if ([71,73,75,77,85,86].includes(code)) return '🌨';
    if ([95,96,99].includes(code)) return '⛈';
    return '⛅';
  },

  _windDir(deg) {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  },

  _transform(json) {
    const c = json.current;
    const d = json.daily;
    const current = {
      temp_f: Math.round(c.temperature_2m),
      humidity: c.relative_humidity_2m,
      wind_mph: Math.round(c.wind_speed_10m),
      wind_dir: this._windDir(c.wind_direction_10m),
      uv: Math.round(c.uv_index ?? 0),
      visibility_mi: c.visibility ? Math.round(c.visibility / 1609.34) : 10,
      condition_icon: this._weatherIcon(c.weather_code),
    };
    const forecast = d.time.map((date, i) => ({
      date,
      day: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      high: Math.round(d.temperature_2m_max[i]),
      low: Math.round(d.temperature_2m_min[i]),
      rain_pct: d.precipitation_probability_max[i] ?? 0,
      wind_mph: Math.round(d.wind_speed_10m_max[i]),
      icon: this._weatherIcon(d.weather_code[i]),
    }));

    // Compute a real riding score from the fetched data (not fabricated)
    const score = this._computeRidingScore(current, forecast[0]);

    return { current, forecast, ridingScore: score };
  },

  _computeRidingScore(current, today) {
    let score = 100;
    // Wind penalty
    if (current.wind_mph > 25) score -= 30;
    else if (current.wind_mph > 15) score -= 12;
    // Rain penalty
    if (today.rain_pct > 60) score -= 40;
    else if (today.rain_pct > 30) score -= 18;
    else if (today.rain_pct > 10) score -= 6;
    // Heat penalty
    if (current.temp_f > 100) score -= 30;
    else if (current.temp_f > 92) score -= 15;
    else if (current.temp_f < 35) score -= 20;
    // Visibility penalty
    if (current.visibility_mi < 3) score -= 25;
    score = Math.max(0, Math.min(100, score));

    let label, color, stars;
    if (score >= 85) { label = 'Excellent'; color = '#4ade80'; stars = 5; }
    else if (score >= 68) { label = 'Good'; color = '#a3e635'; stars = 4; }
    else if (score >= 50) { label = 'Fair'; color = '#fbbf24'; stars = 3; }
    else if (score >= 30) { label = 'Poor'; color = '#f97316'; stars = 2; }
    else { label = 'Avoid'; color = '#f87171'; stars = 1; }

    let bestWindow = '7:00 AM – 11:00 AM';
    if (current.temp_f > 95) bestWindow = '6:00 AM – 9:30 AM';
    if (current.temp_f < 50) bestWindow = '10:00 AM – 3:00 PM';

    const dustLevel = current.wind_mph > 20 ? 'High' : current.wind_mph > 10 ? 'Moderate' : 'Low';
    const heatRisk  = current.temp_f > 95 ? 'High' : current.temp_f > 85 ? 'Moderate' : 'Low';

    return { score, label, color, stars, bestWindow, dustLevel, heatRisk };
  },
};


// ── Utilities ──────────────────────────────────────────────────────────────
const Utils = {
  msToDisplay(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const millis = ms % 1000;
    return `${min}:${String(sec).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
  },

  displayToMs(min, sec, ms) {
    return (parseInt(min||0) * 60000) + (parseInt(sec||0) * 1000) + parseInt(ms||0);
  },

  slugify(text) {
    return text.toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs  < 24) return `${hrs}h ago`;
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  darken(hex, amt = 40) {
    const n = parseInt(hex.replace('#',''), 16);
    const r = Math.max(0, (n>>16) - amt);
    const g = Math.max(0, ((n>>8)&255) - amt);
    const b = Math.max(0, (n&255) - amt);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  },

  haversineMiles(p1, p2) {
    const R = 3958.8;
    const dLat = (p2[0]-p1[0]) * Math.PI/180;
    const dLng = (p2[1]-p1[1]) * Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(p1[0]*Math.PI/180)*Math.cos(p2[0]*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  },

  routeDistanceMiles(coords) {
    let total = 0;
    for (let i = 1; i < coords.length; i++) total += this.haversineMiles(coords[i-1], coords[i]);
    return total;
  },

  centroid(coords) {
    const lat = coords.reduce((s,c) => s + c[0], 0) / coords.length;
    const lng = coords.reduce((s,c) => s + c[1], 0) / coords.length;
    return [lat, lng];
  },

  diffBadgeClass(d) {
    return { beginner:'badge-beginner', intermediate:'badge-intermediate', advanced:'badge-advanced', expert:'badge-expert' }[d] || 'badge-beginner';
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  initialsOf(name) {
    return (name || '??').trim().split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase();
  },

  validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  /**
   * Evenly downsample a coordinate array to at most maxPoints,
   * always keeping the first and last point. Used when importing
   * dense GPS/KML tracks so the tracer stays responsive.
   */
  simplifyPoints(coords, maxPoints = 150) {
    if (coords.length <= maxPoints) return coords;
    const step = (coords.length - 1) / (maxPoints - 1);
    const out = [];
    for (let i = 0; i < maxPoints; i++) out.push(coords[Math.round(i * step)]);
    return out;
  },
};


// ── Toast notifications ───────────────────────────────────────────────────
const Toast = {
  show(message, icon = '🏍', type = '') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${message}</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s, transform 0.3s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },
  success(msg) { this.show(msg, '✅', 'success'); },
  error(msg)   { this.show(msg, '⚠️', 'error'); },
  info(msg)    { this.show(msg, 'ℹ️', 'info'); },
};


// ── Geo Import (Google Earth KML / KMZ → route coordinates) ─────────────────
// .kmz files are zip archives; KMZ support requires the JSZip library
// (loaded via CDN in index.html). .kml files are plain XML and need nothing extra.
const GeoImport = {
  parseKML(text) {
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    const coordEls = xml.getElementsByTagName('coordinates');
    let raw = '';
    for (let i = 0; i < coordEls.length; i++) {
      if (coordEls[i].textContent && coordEls[i].textContent.trim()) { raw = coordEls[i].textContent.trim(); break; }
    }
    if (!raw) return [];
    return raw.split(/\s+/).map(triplet => {
      const parts = triplet.split(',');
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      return [lat, lng];
    }).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
  },

  async fromFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.kmz')) {
      if (!window.JSZip) throw new Error('KMZ support library did not load. Try exporting as .kml instead.');
      const zip = await window.JSZip.loadAsync(file);
      const entry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.kml'));
      if (!entry) throw new Error('No .kml file found inside that .kmz archive.');
      const text = await entry.async('text');
      return this.parseKML(text);
    }
    const text = await file.text();
    return this.parseKML(text);
  },
};


// ── Map Engine (Leaflet) ───────────────────────────────────────────────────
class MotoMap {
  constructor(containerId, opts = {}) {
    this.containerId = containerId;
    this.opts = opts;
    this.map = null;
    this.trailLayers = new Map();
  }

  init() {
    const lat = CFG.MAP_DEFAULT_LAT || 33.175;
    const lng = CFG.MAP_DEFAULT_LNG || -102.730;
    const zoom = this.opts.zoom || CFG.MAP_DEFAULT_ZOOM || 11;

    this.map = L.map(this.containerId, {
      center: [lat, lng],
      zoom,
      zoomControl: this.opts.zoomControl !== false,
      attributionControl: true,
    });

    if (CFG.MAP_PROVIDER === 'mapbox' && CFG.MAPBOX_TOKEN) {
      this._streetLayer = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=${CFG.MAPBOX_TOKEN}`, {
        attribution: '© Mapbox © OpenStreetMap', maxZoom: 20, tileSize: 512, zoomOffset: -1,
      });
    } else {
      this._streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 19,
      });
    }

    // Free satellite imagery — Esri World Imagery, no API key required
    this._satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics', maxZoom: 19,
    });

    this.currentLayer = 'street';
    this._streetLayer.addTo(this.map);
    return this;
  }

  /**
   * Switch between 'street' and 'satellite' base tiles.
   * Also toggles a CSS class so the dark-mode tile filter (which would
   * otherwise invert satellite photo colors into a garish negative)
   * is suspended while satellite is active.
   */
  setLayer(type) {
    if (!this.map || type === this.currentLayer) return;
    const container = this.map.getContainer();
    if (type === 'satellite') {
      this.map.removeLayer(this._streetLayer);
      this._satLayer.addTo(this.map);
      container.classList.add('satellite-mode');
      this.currentLayer = 'satellite';
    } else {
      this.map.removeLayer(this._satLayer);
      this._streetLayer.addTo(this.map);
      container.classList.remove('satellite-mode');
      this.currentLayer = 'street';
    }
  }

  toggleLayer() {
    this.setLayer(this.currentLayer === 'satellite' ? 'street' : 'satellite');
    return this.currentLayer;
  }

  addTrail(trail, onClick) {
    const coords = typeof trail.coords === 'string' ? JSON.parse(trail.coords) : trail.coords;
    const color = trail.accent_color || '#FF6B00';
    const line = L.polyline(coords, { color, weight: 4, opacity: 0.85 }).addTo(this.map);
    line.on('mouseover', () => line.setStyle({ weight: 7, opacity: 1 }));
    line.on('mouseout',  () => line.setStyle({ weight: 4, opacity: 0.85 }));
    if (onClick) line.on('click', () => onClick(trail));

    const icon = L.divIcon({
      className: '',
      html: `<div style="background:${color};color:#000;font-family:'Bebas Neue',sans-serif;font-size:11px;letter-spacing:0.07em;padding:4px 10px;border-radius:3px;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,0.5);cursor:pointer">${Utils.escapeHtml(trail.name).toUpperCase()}</div>`,
      iconAnchor: [0, 20],
    });
    const marker = L.marker(coords[0], { icon }).addTo(this.map);
    if (onClick) marker.on('click', () => onClick(trail));

    this.trailLayers.set(trail.id, { line, marker, coords });
    return line;
  }

  fitTrail(trailId, coordsFallback) {
    const layer = this.trailLayers.get(trailId);
    if (layer) { this.map.fitBounds(layer.line.getBounds(), { padding: [50,50] }); return; }
    if (coordsFallback) this.map.fitBounds(L.latLngBounds(coordsFallback), { padding: [50,50] });
  }

  clearAll() {
    this.trailLayers.forEach(({ line, marker }) => { this.map.removeLayer(line); this.map.removeLayer(marker); });
    this.trailLayers.clear();
  }

  /**
   * Animate a marker along a trail's route at constant pace,
   * scaled to match the rider's total recorded time.
   * This is an estimated-pace replay (no real per-second GPS exists),
   * clearly labeled as such in the UI.
   */
  animateReplay(coords, totalMs, callbacks = {}) {
    const marker = L.circleMarker(coords[0], { radius: 9, fillColor: '#FF6B00', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(this.map);
    const pulse  = L.circleMarker(coords[0], { radius: 16, fillOpacity: 0, color: '#FF6B00', weight: 2, opacity: 0.5 }).addTo(this.map);
    const playbackMs = Math.min(totalMs, 30000); // cap visual playback at 30s regardless of real lap time
    let startTs = null;
    let raf;

    const step = (ts) => {
      if (!startTs) startTs = ts;
      const progress = Math.min((ts - startTs) / playbackMs, 1);
      const idx = Math.floor(progress * (coords.length - 1));
      const pos = coords[idx];
      marker.setLatLng(pos);
      pulse.setLatLng(pos);
      if (callbacks.onProgress) callbacks.onProgress(progress, totalMs * progress);
      if (progress < 1) raf = requestAnimationFrame(step);
      else {
        this.map.removeLayer(marker); this.map.removeLayer(pulse);
        if (callbacks.onComplete) callbacks.onComplete();
      }
    };
    raf = requestAnimationFrame(step);
    return { stop: () => { cancelAnimationFrame(raf); this.map.removeLayer(marker); this.map.removeLayer(pulse); } };
  }
}


// ── Trail Tracer (interactive route drawing tool) ──────────────────────────
class TrailTracer {
  constructor(motoMap) {
    this.motoMap = motoMap;
    this.map = motoMap.map;
    this.points = [];
    this.markers = [];
    this.polyline = null;
    this.active = false;
    this.terrain = 'mixed';
    this.listeners = {};
  }

  /**
   * Activate the tracer. Placement no longer happens via map clicks —
   * clicking/dragging the map is left free for normal pan & zoom.
   * Points are placed with placeAtCenter(), which drops a point wherever
   * the on-screen crosshair currently sits (i.e. the exact map center).
   */
  activate(terrain = 'mixed') {
    this.active = true;
    this.terrain = terrain;
  }

  deactivate() {
    this.active = false;
  }

  /**
   * Place a new point at the current center of the map.
   * This is what the "Place Point" button calls.
   */
  placeAtCenter() {
    if (!this.map) return;
    const c = this.map.getCenter();
    this.addPoint([c.lat, c.lng]);
  }

  addPoint(latlng) {
    this.points.push(latlng);
    const idx = this.points.length - 1;
    const marker = L.circleMarker(latlng, {
      radius: idx === 0 ? 10 : 7,
      fillColor: idx === 0 ? '#FF6B00' : '#fff',
      color: '#FF6B00', weight: 2, fillOpacity: 1,
    }).addTo(this.map);
    marker.on('contextmenu', (e) => { e.originalEvent.preventDefault(); this.removePoint(idx); });
    this.markers.push(marker);
    this._redraw();
    this._emit('change', this.getStats());
  }

  removePoint(idx) {
    this.points.splice(idx, 1);
    const [m] = this.markers.splice(idx, 1);
    if (m) this.map.removeLayer(m);
    this._redraw();
    this._emit('change', this.getStats());
  }

  undo() {
    if (!this.points.length) return;
    const m = this.markers.pop();
    if (m) this.map.removeLayer(m);
    this.points.pop();
    this._redraw();
    this._emit('change', this.getStats());
  }

  clear() {
    this.points = [];
    this.markers.forEach(m => this.map.removeLayer(m));
    this.markers = [];
    if (this.polyline) { this.map.removeLayer(this.polyline); this.polyline = null; }
    this._emit('change', this.getStats());
  }

  closeLoop() {
    if (this.points.length < 3) return;
    this.addPoint([...this.points[0]]);
  }

  /**
   * Replace the entire route at once — used by KML/KMZ import.
   * Dense imported tracks are downsampled first so the map stays responsive.
   */
  setPoints(coordsArray) {
    this.clear();
    const simplified = Utils.simplifyPoints(coordsArray, 150);
    simplified.forEach(p => this.addPoint(p));
    if (simplified.length) {
      this.map.fitBounds(L.latLngBounds(simplified), { padding: [40, 40] });
    }
  }

  _redraw() {
    if (this.polyline) this.map.removeLayer(this.polyline);
    if (this.points.length < 2) { this.polyline = null; return; }
    this.polyline = L.polyline(this.points, { color: '#FF6B00', weight: 3, opacity: 0.9, dashArray: '8,6' }).addTo(this.map);
  }

  getStats() {
    const dist = Utils.routeDistanceMiles(this.points);
    const speeds = { 'deep-sand':14, 'sand':16, 'rock':12, 'hardpack':24, 'mixed':18 };
    const avgSpeed = speeds[this.terrain] || 18;
    const estMin = dist > 0 ? (dist / avgSpeed) * 60 : 0;
    let difficulty = 'beginner';
    if (this.terrain === 'deep-sand' || this.terrain === 'rock') difficulty = dist > 2 ? 'advanced' : 'intermediate';
    else if (dist > 4) difficulty = 'advanced';
    else if (dist > 2) difficulty = 'intermediate';

    return {
      pointCount: this.points.length,
      distanceMiles: parseFloat(dist.toFixed(2)),
      estMinutes: parseFloat(estMin.toFixed(1)),
      estTimeDisplay: estMin < 60 ? `${Math.round(estMin)} min` : `${Math.floor(estMin/60)}h ${Math.round(estMin%60)}m`,
      elevationGainFt: Math.round(dist * 20),
      difficulty,
      canClose: this.points.length >= 3,
      canSubmit: this.points.length >= 4 && dist >= 0.1,
    };
  }

  getCoords() { return this.points.map(p => [...p]); }
  on(evt, fn) { this.listeners[evt] = fn; }
  _emit(evt, data) { if (this.listeners[evt]) this.listeners[evt](data); }
}

// Expose globally (no module bundler — plain script include)
window.MotoHub = {
  sb, Auth, TrailsAPI, TrailRequestsAPI, LapTimesAPI, BikesAPI, CommunityAPI,
  RidersAPI, FollowAPI, NotificationsAPI, StatsAPI, AchievementsAPI, WeatherAPI, Utils, Toast,
  MotoMap, TrailTracer, GeoImport, SUPABASE_READY, renderSetupGateIfNeeded, CFG,
};
