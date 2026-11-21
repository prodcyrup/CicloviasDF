import { getSupabaseClient } from '../cloud/supabaseClient';
import type {
  Coord3D,
  HazardKind,
  HazardReport,
  LngLat,
  RouteProfileId,
  SavedPlace,
  SavedPlaceCategory,
  SavedRoute,
  UserPreferences,
  VehicleCategory,
  VehicleSpec,
} from '../types';

export interface CloudPullResult<T> {
  active: T[];
  deletedIds: Array<{ id: string; deletedAt: string }>;
}

export class CloudSyncError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'CloudSyncError';
    this.status = status;
    this.code = code;
  }
}

function throwFromSupabaseError(err: { message?: string; code?: string; status?: number } | null): never {
  const msg = err?.message || 'Erro de comunicação com o Supabase';
  const code = err?.code;
  const status =
    err?.status ??
    (code === '42501' || code === 'PGRST301' || msg.toLowerCase().includes('jwt') ? 401 : undefined);
  throw new CloudSyncError(msg, status, code);
}

interface SavedRouteRow {
  user_id: string;
  id: string;
  name: string;
  description: string | null;
  tag: string;
  is_favorite: boolean;
  difficulty: 'Fácil' | 'Moderado' | 'Desafiador';
  city: string;
  profile: RouteProfileId;
  coords: Coord3D[];
  waypoints: LngLat[];
  distance_km: number;
  ascent_m: number;
  descent_m: number;
  safety_score: number;
  origin_name: string | null;
  dest_name: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface SavedPlaceRow {
  user_id: string;
  id: string;
  label: string;
  address: string;
  lng: number;
  lat: number;
  category: SavedPlaceCategory;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface CustomVehicleRow {
  user_id: string;
  id: string;
  name: string;
  category: VehicleCategory;
  is_electric: boolean;
  spec: VehicleSpec;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface HazardReportRow {
  id: string;
  user_id: string | null;
  kind: HazardKind;
  title: string;
  note: string | null;
  lng: number;
  lat: number;
  confirmations: number;
  confirmed_by_me?: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

function rowToSavedRoute(r: SavedRouteRow): SavedRoute {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    tag: r.tag || 'Salva',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    isFavorite: Boolean(r.is_favorite),
    isCurated: r.id.startsWith('curated-'),
    difficulty: r.difficulty || 'Fácil',
    city: r.city || 'Brasil',
    profile: r.profile || 'safe',
    coords: Array.isArray(r.coords) ? r.coords : [],
    waypoints: Array.isArray(r.waypoints) ? r.waypoints : [],
    distanceKm: Number(r.distance_km) || 0,
    ascentM: Number(r.ascent_m) || 0,
    descentM: Number(r.descent_m) || 0,
    safetyScore: Number(r.safety_score) || 50,
    originName: r.origin_name ?? undefined,
    destName: r.dest_name ?? undefined,
  };
}

function rowToSavedPlace(r: SavedPlaceRow): SavedPlace {
  return {
    id: r.id,
    label: r.label,
    address: r.address || '',
    coords: [Number(r.lng), Number(r.lat)],
    category: r.category || 'favorite',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToCustomVehicle(r: CustomVehicleRow): VehicleSpec {
  const spec = (r.spec && typeof r.spec === 'object' ? r.spec : {}) as VehicleSpec;
  return {
    ...spec,
    id: r.id,
    name: r.name || spec.name || 'Veículo Personalizado',
    category: r.category || spec.category || 'patinete',
    isElectric: typeof r.is_electric === 'boolean' ? r.is_electric : Boolean(spec.isElectric),
    isCustom: true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToHazardReport(r: HazardReportRow): HazardReport {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    note: r.note ?? undefined,
    coords: [Number(r.lng), Number(r.lat)],
    createdAt: r.created_at,
    updatedAt: r.updated_at || r.created_at,
    confirmations: Math.max(1, Number(r.confirmations) || 1),
    userId: r.user_id ?? undefined,
    isCommunity: true,
    confirmedByMe: Boolean(r.confirmed_by_me),
  };
}

export const supabaseAdapter = {
  async pullSavedRoutes(userId: string): Promise<CloudPullResult<SavedRoute>> {
    const client = getSupabaseClient();
    if (!client) return { active: [], deletedIds: [] };

    const { data, error } = await client
      .from('saved_routes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throwFromSupabaseError(error);
    const rows = (data ?? []) as SavedRouteRow[];
    const active: SavedRoute[] = [];
    const deletedIds: Array<{ id: string; deletedAt: string }> = [];

    for (const row of rows) {
      if (row.deleted_at) {
        deletedIds.push({ id: row.id, deletedAt: row.deleted_at });
      } else {
        active.push(rowToSavedRoute(row));
      }
    }
    return { active, deletedIds };
  },

  async upsertSavedRoute(userId: string, route: SavedRoute): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const payload = {
      user_id: userId,
      id: route.id,
      name: route.name,
      description: route.description ?? null,
      tag: route.tag || 'Salva',
      is_favorite: Boolean(route.isFavorite),
      difficulty: route.difficulty || 'Fácil',
      city: route.city || 'Brasil',
      profile: route.profile || 'safe',
      coords: route.coords,
      waypoints: route.waypoints,
      distance_km: route.distanceKm,
      ascent_m: Math.max(0, Math.round(route.ascentM || 0)),
      descent_m: Math.max(0, Math.round(route.descentM || 0)),
      safety_score: Math.min(100, Math.max(0, Math.round(route.safetyScore || 50))),
      origin_name: route.originName ?? null,
      dest_name: route.destName ?? null,
      created_at: route.createdAt || new Date().toISOString(),
      updated_at: route.updatedAt || new Date().toISOString(),
      deleted_at: null,
    };

    const { error } = await client
      .from('saved_routes')
      .upsert(payload, { onConflict: 'user_id,id' });

    if (error) throwFromSupabaseError(error);
  },

  async softDeleteSavedRoute(userId: string, id: string, deletedAt: string): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const { error } = await client
      .from('saved_routes')
      .update({ deleted_at: deletedAt, updated_at: deletedAt })
      .eq('user_id', userId)
      .eq('id', id);

    if (error) throwFromSupabaseError(error);
  },

  async pullSavedPlaces(userId: string): Promise<CloudPullResult<SavedPlace>> {
    const client = getSupabaseClient();
    if (!client) return { active: [], deletedIds: [] };

    const { data, error } = await client
      .from('saved_places')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throwFromSupabaseError(error);
    const rows = (data ?? []) as SavedPlaceRow[];
    const active: SavedPlace[] = [];
    const deletedIds: Array<{ id: string; deletedAt: string }> = [];

    for (const row of rows) {
      if (row.deleted_at) {
        deletedIds.push({ id: row.id, deletedAt: row.deleted_at });
      } else {
        active.push(rowToSavedPlace(row));
      }
    }
    return { active, deletedIds };
  },

  async upsertSavedPlace(userId: string, place: SavedPlace): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const payload = {
      user_id: userId,
      id: place.id,
      label: place.label,
      address: place.address || '',
      lng: place.coords[0],
      lat: place.coords[1],
      category: place.category || 'favorite',
      created_at: place.createdAt || new Date().toISOString(),
      updated_at: place.updatedAt || new Date().toISOString(),
      deleted_at: null,
    };

    const { error } = await client
      .from('saved_places')
      .upsert(payload, { onConflict: 'user_id,id' });

    if (error) throwFromSupabaseError(error);
  },

  async softDeleteSavedPlace(userId: string, id: string, deletedAt: string): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const { error } = await client
      .from('saved_places')
      .update({ deleted_at: deletedAt, updated_at: deletedAt })
      .eq('user_id', userId)
      .eq('id', id);

    if (error) throwFromSupabaseError(error);
  },

  async pullCustomVehicles(userId: string): Promise<CloudPullResult<VehicleSpec>> {
    const client = getSupabaseClient();
    if (!client) return { active: [], deletedIds: [] };

    const { data, error } = await client
      .from('custom_vehicles')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throwFromSupabaseError(error);
    const rows = (data ?? []) as CustomVehicleRow[];
    const active: VehicleSpec[] = [];
    const deletedIds: Array<{ id: string; deletedAt: string }> = [];

    for (const row of rows) {
      if (row.deleted_at) {
        deletedIds.push({ id: row.id, deletedAt: row.deleted_at });
      } else {
        active.push(rowToCustomVehicle(row));
      }
    }
    return { active, deletedIds };
  },

  async upsertCustomVehicle(userId: string, vehicle: VehicleSpec): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const now = new Date().toISOString();
    const payload = {
      user_id: userId,
      id: vehicle.id,
      name: vehicle.name,
      category: vehicle.category,
      is_electric: Boolean(vehicle.isElectric),
      spec: vehicle,
      created_at: vehicle.createdAt || now,
      updated_at: vehicle.updatedAt || now,
      deleted_at: null,
    };

    const { error } = await client
      .from('custom_vehicles')
      .upsert(payload, { onConflict: 'user_id,id' });

    if (error) throwFromSupabaseError(error);
  },

  async softDeleteCustomVehicle(userId: string, id: string, deletedAt: string): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const { error } = await client
      .from('custom_vehicles')
      .update({ deleted_at: deletedAt, updated_at: deletedAt })
      .eq('user_id', userId)
      .eq('id', id);

    if (error) throwFromSupabaseError(error);
  },

  async pullHazards(
    bounds: [number, number, number, number] = [-74.0, -34.0, -34.0, 5.5]
  ): Promise<CloudPullResult<HazardReport>> {
    const client = getSupabaseClient();
    if (!client) return { active: [], deletedIds: [] };

    // Use the PostGIS GIST spatial RPC first; fall back to direct table select if RPC is mocked/unavailable
    const rpcRes = await client.rpc('get_hazards_in_bounds', {
      min_lng: bounds[0],
      min_lat: bounds[1],
      max_lng: bounds[2],
      max_lat: bounds[3],
      max_results: 250,
    });

    if (!rpcRes.error && Array.isArray(rpcRes.data)) {
      const active = (rpcRes.data as HazardReportRow[]).map(rowToHazardReport);
      return { active, deletedIds: [] };
    }

    const { data, error } = await client
      .from('hazard_reports')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(250);

    if (error) throwFromSupabaseError(error);
    const rows = (data ?? []) as HazardReportRow[];
    const active: HazardReport[] = [];
    const deletedIds: Array<{ id: string; deletedAt: string }> = [];

    for (const row of rows) {
      if (row.deleted_at) {
        deletedIds.push({ id: row.id, deletedAt: row.deleted_at });
      } else {
        active.push(rowToHazardReport(row));
      }
    }
    return { active, deletedIds };
  },

  async upsertHazard(userId: string, hazard: HazardReport): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const now = new Date().toISOString();
    const payload = {
      id: hazard.id,
      user_id: hazard.userId || userId,
      kind: hazard.kind,
      title: hazard.title,
      note: hazard.note ?? null,
      lng: hazard.coords[0],
      lat: hazard.coords[1],
      confirmations: Math.max(1, hazard.confirmations || 1),
      created_at: hazard.createdAt || now,
      updated_at: hazard.updatedAt || hazard.createdAt || now,
      deleted_at: null,
    };

    const { error } = await client
      .from('hazard_reports')
      .upsert(payload, { onConflict: 'id' });

    if (error) throwFromSupabaseError(error);
  },

  async confirmHazardRpc(hazardId: string): Promise<number | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    const { data, error } = await client.rpc('confirm_hazard', {
      p_hazard_id: hazardId,
    });
    if (error) throwFromSupabaseError(error);
    return typeof data === 'number' ? data : null;
  },

  async softDeleteHazard(userId: string, id: string, deletedAt: string): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const { error } = await client
      .from('hazard_reports')
      .update({ deleted_at: deletedAt, updated_at: deletedAt })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throwFromSupabaseError(error);
  },

  async pullPreferences(userId: string): Promise<{ prefs: Partial<UserPreferences>; updatedAt: string } | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    const { data, error } = await client
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throwFromSupabaseError(error);
    if (!data) return null;
    const row = data as { prefs?: Partial<UserPreferences>; updated_at?: string };
    return {
      prefs: row.prefs ?? {},
      updatedAt: row.updated_at || new Date(0).toISOString(),
    };
  },

  async upsertPreferences(userId: string, prefs: UserPreferences): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const updatedAt = prefs.updatedAt || new Date().toISOString();
    const { error } = await client
      .from('user_preferences')
      .upsert(
        {
          user_id: userId,
          prefs: { ...prefs, updatedAt },
          updated_at: updatedAt,
        },
        { onConflict: 'user_id' }
      );

    if (error) throwFromSupabaseError(error);
  },
};
