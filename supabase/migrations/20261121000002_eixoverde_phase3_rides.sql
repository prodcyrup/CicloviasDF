-- ============================================================================
-- EixoVerde — Phase 3: Ride History, Telemetry & PostGIS Track Sync
-- Migration: 20261121000002_eixoverde_phase3_rides.sql
--
-- 100% idempotent: safe to re-run via Supabase SQL Editor or `supabase db push`.
-- Requires Phase 2 migration (20261121000001_eixoverde_phase2.sql) for PostGIS
-- and `public.set_updated_at()`.
-- ============================================================================

SET search_path = public, extensions;

-- Ensure helper exists if run standalone
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Helper: build a PostGIS LineString(4326) from a JSONB array of RideTrackPoint objects
-- [{ "lng": -47.88, "lat": -15.79, ... }, ...]
CREATE OR REPLACE FUNCTION public.set_ride_session_geom()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_line geometry(LineString, 4326);
BEGIN
  IF NEW.track IS NULL
     OR jsonb_typeof(NEW.track) <> 'array'
     OR jsonb_array_length(NEW.track) < 2 THEN
    NEW.geom := NULL;
    RETURN NEW;
  END IF;

  SELECT ST_SetSRID(
           ST_MakeLine(
             ST_MakePoint((pt->>'lng')::double precision, (pt->>'lat')::double precision)
             ORDER BY ord
           ),
           4326
         )
    INTO v_line
  FROM jsonb_array_elements(NEW.track) WITH ORDINALITY AS t(pt, ord)
  WHERE (pt->>'lng') IS NOT NULL
    AND (pt->>'lat') IS NOT NULL;

  NEW.geom := v_line;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  NEW.geom := NULL;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Table: public.ride_sessions (PostGIS LineString + Composite PK + Private RLS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ride_sessions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'guided'
    CHECK (mode IN ('guided', 'free_ride', 'demo')),
  is_demo BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  moving_duration_sec INTEGER NOT NULL DEFAULT 0
    CHECK (moving_duration_sec >= 0),
  total_duration_sec INTEGER NOT NULL DEFAULT 0
    CHECK (total_duration_sec >= 0),
  distance_km DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (distance_km >= 0),
  avg_speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (avg_speed_kmh >= 0),
  max_speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (max_speed_kmh >= 0),
  ascent_m INTEGER NOT NULL DEFAULT 0
    CHECK (ascent_m >= 0),
  descent_m INTEGER NOT NULL DEFAULT 0
    CHECK (descent_m >= 0),
  calories_kcal INTEGER NOT NULL DEFAULT 0
    CHECK (calories_kcal >= 0),
  co2_saved_kg DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (co2_saved_kg >= 0),
  vehicle_id TEXT NOT NULL,
  vehicle_name TEXT NOT NULL,
  vehicle_mode_index INTEGER NOT NULL DEFAULT 1,
  is_electric BOOLEAN NOT NULL DEFAULT false,
  battery_start_pct INTEGER
    CHECK (battery_start_pct IS NULL OR battery_start_pct BETWEEN 0 AND 100),
  battery_end_pct INTEGER
    CHECK (battery_end_pct IS NULL OR battery_end_pct BETWEEN 0 AND 100),
  battery_used_pct INTEGER
    CHECK (battery_used_pct IS NULL OR battery_used_pct BETWEEN 0 AND 100),
  estimated_battery_used_pct INTEGER
    CHECK (estimated_battery_used_pct IS NULL OR estimated_battery_used_pct BETWEEN 0 AND 100),
  weather_summary JSONB,
  route_id TEXT,
  origin_name TEXT,
  dest_name TEXT,
  track JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(track) = 'array'),
  geom geometry(LineString, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ride_sessions_geom
  ON public.ride_sessions USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_ride_sessions_user_started
  ON public.ride_sessions (user_id, started_at DESC);

DROP TRIGGER IF EXISTS trg_ride_sessions_updated_at ON public.ride_sessions;
CREATE TRIGGER trg_ride_sessions_updated_at
  BEFORE UPDATE ON public.ride_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ride_sessions_geom ON public.ride_sessions;
CREATE TRIGGER trg_ride_sessions_geom
  BEFORE INSERT OR UPDATE OF track ON public.ride_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ride_session_geom();

ALTER TABLE public.ride_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ride_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ride_sessions TO authenticated;

DROP POLICY IF EXISTS "ride_sessions_select_own" ON public.ride_sessions;
CREATE POLICY "ride_sessions_select_own"
  ON public.ride_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ride_sessions_insert_own" ON public.ride_sessions;
CREATE POLICY "ride_sessions_insert_own"
  ON public.ride_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ride_sessions_update_own" ON public.ride_sessions;
CREATE POLICY "ride_sessions_update_own"
  ON public.ride_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ride_sessions_delete_own" ON public.ride_sessions;
CREATE POLICY "ride_sessions_delete_own"
  ON public.ride_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
