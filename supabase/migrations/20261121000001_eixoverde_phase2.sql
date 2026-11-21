-- ============================================================================
-- EixoVerde — Phase 2: Cloud Accounts, Offline-First Sync, PostGIS & RLS
-- Migration: 20261121000001_eixoverde_phase2.sql
--
-- 100% idempotent: safe to re-run via Supabase SQL Editor or `supabase db push`.
-- Dual-environment PostGIS compatible (Supabase Cloud `extensions` schema and
-- vanilla PostgreSQL `public` schema).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PostGIS Extension & Schema Search Path
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    CREATE EXTENSION postgis WITH SCHEMA extensions;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

SET search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 2. Shared Trigger Helper Functions (pinned search_path)
-- ----------------------------------------------------------------------------

-- Updates `updated_at` strictly on UPDATE so INSERT preserves client timestamps
-- (important for initial Guest -> Cloud migration and LWW merge fidelity).
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

-- Synchronizes PostGIS Point(4326) geometry from lng/lat columns.
CREATE OR REPLACE FUNCTION public.sync_point_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.lng IS NOT NULL AND NEW.lat IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Synchronizes PostGIS LineString(4326) geometry from `saved_routes.coords` JSONB.
-- Handles 2D [lng, lat], 3D [lng, lat, elev], mixed arrays, and malformed elements
-- safely using CASE short-circuiting so PostgreSQL's planner never throws 22P02.
CREATE OR REPLACE FUNCTION public.sync_saved_route_geom()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_geom geometry(LineString, 4326);
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.coords IS NOT DISTINCT FROM OLD.coords
     AND NEW.geom IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.coords IS NULL OR jsonb_typeof(NEW.coords) <> 'array' THEN
    NEW.geom := NULL;
    RETURN NEW;
  END IF;

  IF jsonb_array_length(NEW.coords) < 2 THEN
    NEW.geom := NULL;
    RETURN NEW;
  END IF;

  WITH parsed AS (
    SELECT
      ord,
      CASE
        WHEN jsonb_typeof(elem) = 'array' THEN
          CASE
            WHEN jsonb_typeof(elem->0) = 'number'
             AND jsonb_typeof(elem->1) = 'number'
            THEN (elem->>0)::double precision
            ELSE NULL
          END
        ELSE NULL
      END AS lng,
      CASE
        WHEN jsonb_typeof(elem) = 'array' THEN
          CASE
            WHEN jsonb_typeof(elem->0) = 'number'
             AND jsonb_typeof(elem->1) = 'number'
            THEN (elem->>1)::double precision
            ELSE NULL
          END
        ELSE NULL
      END AS lat
    FROM jsonb_array_elements(NEW.coords) WITH ORDINALITY AS arr(elem, ord)
  )
  SELECT
    CASE
      WHEN count(*) >= 2
      THEN ST_SetSRID(ST_MakeLine(ST_MakePoint(lng, lat) ORDER BY ord), 4326)
      ELSE NULL
    END
  INTO v_geom
  FROM parsed
  WHERE lng IS NOT NULL
    AND lat IS NOT NULL
    AND lng BETWEEN -180 AND 180
    AND lat BETWEEN -90 AND 90;

  NEW.geom := v_geom;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Table: public.profiles + auth.users signup trigger
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Ciclista'
    )
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 4. Table: public.saved_routes (PostGIS LineString + Composite PK + Private RLS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_routes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tag TEXT NOT NULL DEFAULT 'Salva',
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  difficulty TEXT NOT NULL DEFAULT 'Fácil'
    CHECK (difficulty IN ('Fácil', 'Moderado', 'Desafiador')),
  city TEXT NOT NULL DEFAULT 'Brasil',
  profile TEXT NOT NULL DEFAULT 'safe'
    CHECK (profile IN ('safe', 'balanced', 'fast')),
  coords JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(coords) = 'array'),
  waypoints JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(waypoints) = 'array'),
  geom geometry(LineString, 4326),
  distance_km DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (distance_km >= 0),
  ascent_m INTEGER NOT NULL DEFAULT 0
    CHECK (ascent_m >= 0),
  descent_m INTEGER NOT NULL DEFAULT 0
    CHECK (descent_m >= 0),
  safety_score INTEGER NOT NULL DEFAULT 50
    CHECK (safety_score BETWEEN 0 AND 100),
  origin_name TEXT,
  dest_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_saved_routes_geom
  ON public.saved_routes USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_saved_routes_user_updated
  ON public.saved_routes (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_saved_routes_updated_at ON public.saved_routes;
CREATE TRIGGER trg_saved_routes_updated_at
  BEFORE UPDATE ON public.saved_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_saved_routes_geom ON public.saved_routes;
CREATE TRIGGER trg_saved_routes_geom
  BEFORE INSERT OR UPDATE ON public.saved_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_saved_route_geom();

ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.saved_routes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_routes TO authenticated;

DROP POLICY IF EXISTS "saved_routes_select_own" ON public.saved_routes;
CREATE POLICY "saved_routes_select_own"
  ON public.saved_routes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_routes_insert_own" ON public.saved_routes;
CREATE POLICY "saved_routes_insert_own"
  ON public.saved_routes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_routes_update_own" ON public.saved_routes;
CREATE POLICY "saved_routes_update_own"
  ON public.saved_routes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_routes_delete_own" ON public.saved_routes;
CREATE POLICY "saved_routes_delete_own"
  ON public.saved_routes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. Table: public.saved_places (PostGIS Point + Composite PK + Private RLS)
-- Note: Intentionally NO unique DB constraint on (user_id, category) for
-- 'home'/'work' so multi-device offline edits merge and demote cleanly in sync.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_places (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  lng DOUBLE PRECISION NOT NULL
    CHECK (lng BETWEEN -180 AND 180),
  lat DOUBLE PRECISION NOT NULL
    CHECK (lat BETWEEN -90 AND 90),
  location geometry(Point, 4326),
  category TEXT NOT NULL DEFAULT 'favorite'
    CHECK (category IN ('home', 'work', 'favorite')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_saved_places_location
  ON public.saved_places USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_saved_places_user_updated
  ON public.saved_places (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_saved_places_updated_at ON public.saved_places;
CREATE TRIGGER trg_saved_places_updated_at
  BEFORE UPDATE ON public.saved_places
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_saved_places_location ON public.saved_places;
CREATE TRIGGER trg_saved_places_location
  BEFORE INSERT OR UPDATE ON public.saved_places
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_point_location();

ALTER TABLE public.saved_places ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.saved_places FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_places TO authenticated;

DROP POLICY IF EXISTS "saved_places_select_own" ON public.saved_places;
CREATE POLICY "saved_places_select_own"
  ON public.saved_places
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_places_insert_own" ON public.saved_places;
CREATE POLICY "saved_places_insert_own"
  ON public.saved_places
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_places_update_own" ON public.saved_places;
CREATE POLICY "saved_places_update_own"
  ON public.saved_places
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_places_delete_own" ON public.saved_places;
CREATE POLICY "saved_places_delete_own"
  ON public.saved_places
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 6. Table: public.custom_vehicles (Composite PK + Private RLS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_vehicles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN (
      'patinete',
      'ebike',
      'compartilhado',
      'bike_urbana',
      'bike_speed',
      'bike_mtb',
      'eskate'
    )),
  is_electric BOOLEAN NOT NULL DEFAULT true,
  spec JSONB NOT NULL
    CHECK (jsonb_typeof(spec) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_custom_vehicles_user_updated
  ON public.custom_vehicles (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_custom_vehicles_updated_at ON public.custom_vehicles;
CREATE TRIGGER trg_custom_vehicles_updated_at
  BEFORE UPDATE ON public.custom_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.custom_vehicles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.custom_vehicles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_vehicles TO authenticated;

DROP POLICY IF EXISTS "custom_vehicles_select_own" ON public.custom_vehicles;
CREATE POLICY "custom_vehicles_select_own"
  ON public.custom_vehicles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "custom_vehicles_insert_own" ON public.custom_vehicles;
CREATE POLICY "custom_vehicles_insert_own"
  ON public.custom_vehicles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "custom_vehicles_update_own" ON public.custom_vehicles;
CREATE POLICY "custom_vehicles_update_own"
  ON public.custom_vehicles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "custom_vehicles_delete_own" ON public.custom_vehicles;
CREATE POLICY "custom_vehicles_delete_own"
  ON public.custom_vehicles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 7. Table: public.hazard_reports (PostGIS Point + Community Read / Owner Write RLS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hazard_reports (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL
    CHECK (kind IN ('buraco', 'bloqueio', 'iluminacao', 'raizes', 'cruzamento', 'agua')),
  title TEXT NOT NULL,
  note TEXT,
  lng DOUBLE PRECISION NOT NULL
    CHECK (lng BETWEEN -180 AND 180),
  lat DOUBLE PRECISION NOT NULL
    CHECK (lat BETWEEN -90 AND 90),
  location geometry(Point, 4326),
  confirmations INTEGER NOT NULL DEFAULT 1
    CHECK (confirmations >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hazard_reports_location
  ON public.hazard_reports USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_hazard_reports_updated
  ON public.hazard_reports (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hazard_reports_active_updated
  ON public.hazard_reports (updated_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_hazard_reports_updated_at ON public.hazard_reports;
CREATE TRIGGER trg_hazard_reports_updated_at
  BEFORE UPDATE ON public.hazard_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_hazard_reports_location ON public.hazard_reports;
CREATE TRIGGER trg_hazard_reports_location
  BEFORE INSERT OR UPDATE ON public.hazard_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_point_location();

ALTER TABLE public.hazard_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hazard_reports FROM anon;
GRANT SELECT ON public.hazard_reports TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hazard_reports TO authenticated;

-- Allows public read of active hazards AND owner read of their own soft-deleted
-- rows (required for PostgREST soft-delete UPDATE + cross-device tombstone pulls).
DROP POLICY IF EXISTS "hazard_reports_select_active_or_own" ON public.hazard_reports;
CREATE POLICY "hazard_reports_select_active_or_own"
  ON public.hazard_reports
  FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "hazard_reports_insert_own" ON public.hazard_reports;
CREATE POLICY "hazard_reports_insert_own"
  ON public.hazard_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "hazard_reports_update_own" ON public.hazard_reports;
CREATE POLICY "hazard_reports_update_own"
  ON public.hazard_reports
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "hazard_reports_delete_own" ON public.hazard_reports;
CREATE POLICY "hazard_reports_delete_own"
  ON public.hazard_reports
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 8. Table: public.hazard_confirmations + Count Sync Trigger
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hazard_confirmations (
  hazard_id TEXT NOT NULL REFERENCES public.hazard_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (hazard_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hazard_confirmations_user
  ON public.hazard_confirmations (user_id);

-- Runs as SECURITY DEFINER because non-owner users confirming a hazard do not
-- have UPDATE privileges on `public.hazard_reports`. Uses IS DISTINCT FROM so
-- orphaned hazards (`h.user_id IS NULL`) still count confirmations accurately.
CREATE OR REPLACE FUNCTION public.sync_hazard_confirmation_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hazard_id TEXT;
BEGIN
  v_hazard_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.hazard_id ELSE NEW.hazard_id END;

  UPDATE public.hazard_reports h
  SET
    confirmations = 1 + (
      SELECT count(*)::integer
      FROM public.hazard_confirmations c
      WHERE c.hazard_id = h.id
        AND c.user_id IS DISTINCT FROM h.user_id
    ),
    updated_at = now()
  WHERE h.id = v_hazard_id
    AND h.deleted_at IS NULL;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_hazard_confirmations_sync ON public.hazard_confirmations;
CREATE TRIGGER trg_hazard_confirmations_sync
  AFTER INSERT OR DELETE ON public.hazard_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_hazard_confirmation_count();

ALTER TABLE public.hazard_confirmations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hazard_confirmations FROM anon;
GRANT SELECT, INSERT, DELETE ON public.hazard_confirmations TO authenticated;

DROP POLICY IF EXISTS "hazard_confirmations_select_own" ON public.hazard_confirmations;
CREATE POLICY "hazard_confirmations_select_own"
  ON public.hazard_confirmations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "hazard_confirmations_insert_own" ON public.hazard_confirmations;
CREATE POLICY "hazard_confirmations_insert_own"
  ON public.hazard_confirmations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.hazard_reports h
      WHERE h.id = hazard_id
        AND h.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hazard_confirmations_delete_own" ON public.hazard_confirmations;
CREATE POLICY "hazard_confirmations_delete_own"
  ON public.hazard_confirmations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 9. Table: public.user_preferences (Private RLS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prefs JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(prefs) = 'object'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER trg_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;

DROP POLICY IF EXISTS "user_preferences_select_own" ON public.user_preferences;
CREATE POLICY "user_preferences_select_own"
  ON public.user_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_insert_own" ON public.user_preferences;
CREATE POLICY "user_preferences_insert_own"
  ON public.user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_update_own" ON public.user_preferences;
CREATE POLICY "user_preferences_update_own"
  ON public.user_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_delete_own" ON public.user_preferences;
CREATE POLICY "user_preferences_delete_own"
  ON public.user_preferences
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 10. PostGIS Spatial & Community RPCs
-- ----------------------------------------------------------------------------

-- Queries active community hazards within a bounding box using the GIST index
-- on `public.hazard_reports(location)`. Safely guards NULL / NaN / Infinity.
CREATE OR REPLACE FUNCTION public.get_hazards_in_bounds(
  min_lng DOUBLE PRECISION,
  min_lat DOUBLE PRECISION,
  max_lng DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  max_results INTEGER DEFAULT 200
)
RETURNS TABLE (
  id TEXT,
  user_id UUID,
  kind TEXT,
  title TEXT,
  note TEXT,
  lng DOUBLE PRECISION,
  lat DOUBLE PRECISION,
  confirmations INTEGER,
  confirmed_by_me BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_min_lng DOUBLE PRECISION;
  v_max_lng DOUBLE PRECISION;
  v_min_lat DOUBLE PRECISION;
  v_max_lat DOUBLE PRECISION;
  v_limit INTEGER;
BEGIN
  IF min_lng IS NULL OR min_lat IS NULL OR max_lng IS NULL OR max_lat IS NULL THEN
    RETURN;
  END IF;

  IF min_lng = 'NaN'::double precision
     OR min_lat = 'NaN'::double precision
     OR max_lng = 'NaN'::double precision
     OR max_lat = 'NaN'::double precision
     OR abs(min_lng) = 'Infinity'::double precision
     OR abs(min_lat) = 'Infinity'::double precision
     OR abs(max_lng) = 'Infinity'::double precision
     OR abs(max_lat) = 'Infinity'::double precision THEN
    RETURN;
  END IF;

  v_min_lng := GREATEST(-180.0, LEAST(180.0, LEAST(min_lng, max_lng)));
  v_max_lng := GREATEST(-180.0, LEAST(180.0, GREATEST(min_lng, max_lng)));
  v_min_lat := GREATEST(-90.0, LEAST(90.0, LEAST(min_lat, max_lat)));
  v_max_lat := GREATEST(-90.0, LEAST(90.0, GREATEST(min_lat, max_lat)));
  v_limit := LEAST(GREATEST(COALESCE(max_results, 200), 1), 500);

  IF auth.uid() IS NULL OR NOT has_table_privilege('public.hazard_confirmations', 'SELECT') THEN
    RETURN QUERY
    SELECT
      h.id,
      h.user_id,
      h.kind,
      h.title,
      h.note,
      h.lng,
      h.lat,
      h.confirmations,
      false AS confirmed_by_me,
      h.created_at,
      h.updated_at
    FROM public.hazard_reports h
    WHERE h.deleted_at IS NULL
      AND h.location IS NOT NULL
      AND h.location && ST_MakeEnvelope(v_min_lng, v_min_lat, v_max_lng, v_max_lat, 4326)
    ORDER BY h.updated_at DESC
    LIMIT v_limit;
  ELSE
    RETURN QUERY
    SELECT
      h.id,
      h.user_id,
      h.kind,
      h.title,
      h.note,
      h.lng,
      h.lat,
      h.confirmations,
      EXISTS (
        SELECT 1
        FROM public.hazard_confirmations hc
        WHERE hc.hazard_id = h.id
          AND hc.user_id = auth.uid()
      ) AS confirmed_by_me,
      h.created_at,
      h.updated_at
    FROM public.hazard_reports h
    WHERE h.deleted_at IS NULL
      AND h.location IS NOT NULL
      AND h.location && ST_MakeEnvelope(v_min_lng, v_min_lat, v_max_lng, v_max_lat, 4326)
    ORDER BY h.updated_at DESC
    LIMIT v_limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hazards_in_bounds(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_hazards_in_bounds(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  INTEGER
) TO anon, authenticated;

-- Idempotently confirms an active hazard report for the authenticated user and
-- returns the updated confirmation count.
CREATE OR REPLACE FUNCTION public.confirm_hazard(p_hazard_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid UUID;
  v_confirmations INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_hazard_id IS NULL OR length(trim(p_hazard_id)) = 0 THEN
    RAISE EXCEPTION 'Hazard not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.hazard_reports h
    WHERE h.id = p_hazard_id
      AND h.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Hazard not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.hazard_confirmations (hazard_id, user_id)
  VALUES (p_hazard_id, v_uid)
  ON CONFLICT (hazard_id, user_id) DO NOTHING;

  SELECT h.confirmations
  INTO v_confirmations
  FROM public.hazard_reports h
  WHERE h.id = p_hazard_id;

  RETURN COALESCE(v_confirmations, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_hazard(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_hazard(TEXT) TO authenticated;
