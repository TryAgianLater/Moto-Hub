/**
 * ============================================================
 * MOTOHUB — CONFIGURATION
 * ============================================================
 * This is the ONLY file you need to edit.
 *
 * 1. Create a free project at https://supabase.com
 * 2. Go to SQL Editor → paste the contents of supabase-schema.sql → Run
 * 3. Go to Project Settings → API
 * 4. Copy your "Project URL" and "anon public" key below
 * 5. Save this file and push to GitHub — you're live.
 *
 * See README.md for full step-by-step setup instructions.
 * ============================================================
 */

window.MOTOHUB_CONFIG = {

  // ── Required: paste your Supabase values here ──────────────
  SUPABASE_URL: "https://supabase.com/dashboard/project/eapfopkcdgeakpdpdzny",
  SUPABASE_ANON_KEY: "eapfopkcdgeakpdpdzny",

  // ── Optional: map provider ──────────────────────────────────
  // Default (leaflet) requires no key and works immediately.
  // To use Mapbox satellite/terrain tiles instead, set MAP_PROVIDER
  // to "mapbox" and paste a token from https://account.mapbox.com
  MAP_PROVIDER: "leaflet",
  MAPBOX_TOKEN: "",

  // ── Optional: default map center (West Texas) ───────────────
  MAP_DEFAULT_LAT: 33.175,
  MAP_DEFAULT_LNG: -102.730,
  MAP_DEFAULT_ZOOM: 11,

  // ── Weather ──────────────────────────────────────────────────
  // Uses Open-Meteo (open-meteo.com) by default — it's free,
  // requires no signup or API key, and works immediately for
  // real, live weather and forecast data.
  WEATHER_PROVIDER: "open-meteo",

  // App info
  APP_NAME: "MotoHub",
  APP_REGION: "West Texas",
};
