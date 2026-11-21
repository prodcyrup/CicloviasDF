import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURATED_DF_ROUTES } from '../../data/curatedRoutes';
import type { RideSession, SavedPlace, SavedRoute } from '../../types';
import { indexedDbStorage } from '../indexedDbAdapter';
import { repository } from '../repository';
import { CloudSyncError, isMissingTableError, supabaseAdapter } from '../supabaseAdapter';
import { computeBackoffDelayMs, isUntouchedCuratedRoute, syncEngine } from '../syncEngine';

const sampleRoute: SavedRoute = {
  id: 'saved-test-1',
  name: 'SGAN 912 → Parque da Cidade',
  description: 'Ciclovia W4/W5 Norte',
  tag: 'Salva • 92% segura',
  createdAt: '2026-11-21T01:00:00.000Z',
  updatedAt: '2026-11-21T01:00:00.000Z',
  isFavorite: true,
  difficulty: 'Fácil',
  city: 'Brasília, DF',
  profile: 'safe',
  coords: [
    [-47.8992, -15.7524, 1070],
    [-47.9052, -15.8026, 1112],
  ],
  waypoints: [
    [-47.8992, -15.7524],
    [-47.9052, -15.8026],
  ],
  distanceKm: 7.68,
  ascentM: 52,
  descentM: 18,
  safetyScore: 92,
};

const sampleRide: RideSession = {
  id: 'ride-test-1',
  title: 'Pedal Asa Norte → Esplanada',
  mode: 'guided',
  isDemo: false,
  startedAt: '2026-11-21T10:00:00.000Z',
  endedAt: '2026-11-21T10:26:00.000Z',
  movingDurationSec: 1380,
  totalDurationSec: 1560,
  distanceKm: 7.9,
  avgSpeedKmh: 20.6,
  maxSpeedKmh: 25,
  ascentM: 82,
  descentM: 71,
  caloriesKcal: 42,
  co2SavedKg: 1.38,
  vehicleId: 'jet-aluguel',
  vehicleName: 'JET Compartilhado (20 km/h)',
  vehicleModeIndex: 1,
  isElectric: true,
  batteryStartPct: 95,
  batteryEndPct: 72,
  batteryUsedPct: 23,
  estimatedBatteryUsedPct: 21,
  track: [
    { lng: -47.8992, lat: -15.7524, ele: 1070, ts: 1700000000000, speedKmh: 18 },
    { lng: -47.8645, lat: -15.7983, ele: 1088, ts: 1700001560000, speedKmh: 21 },
  ],
  createdAt: '2026-11-21T10:26:00.000Z',
  updatedAt: '2026-11-21T10:26:00.000Z',
};

describe('syncEngine.ts & IndexedDB v4 Offline-First Sync', () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    await syncEngine.resetForTests();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await syncEngine.resetForTests();
  });

  it('keeps Guest/Local mode 100% isolated with zero outbox items when Supabase env is absent', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    await syncEngine.initialize(null);
    expect(syncEngine.getSnapshot().status).toBe('local');

    await repository.saveRoute(sampleRoute);
    const saved = await repository.getSavedRoutes();
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('SGAN 912 → Parque da Cidade');

    const outbox = await indexedDbStorage.getOutboxItems();
    expect(outbox).toHaveLength(0);
  });

  it('coalesces rapid edits to the same record into a single outbox entry when authenticated', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://tuocwnjnkihchlxxqmgi.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_Biywe21SerSFL7yZYtl4nw_8X-dxTest');

    // Prevent automatic background flush from draining the outbox during coalescing check
    vi.spyOn(syncEngine, 'scheduleFlush').mockImplementation(() => {});

    await syncEngine.initialize('user-df-1');
    await repository.saveRoute({ ...sampleRoute, name: 'Versão 1', updatedAt: '2026-11-21T01:01:00.000Z' });
    await repository.saveRoute({ ...sampleRoute, name: 'Versão 2', updatedAt: '2026-11-21T01:02:00.000Z' });
    await repository.saveRoute({ ...sampleRoute, name: 'Versão Final', updatedAt: '2026-11-21T01:03:00.000Z' });

    const outbox = await indexedDbStorage.getOutboxItems();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].id).toBe('saved_routes:saved-test-1');
    expect((outbox[0].payload as SavedRoute).name).toBe('Versão Final');
  });

  it('skips untouched static CURATED_DF_ROUTES but syncs user-favorited curated routes', () => {
    const untouched = CURATED_DF_ROUTES[1]; // Volta Completa — Parque da Cidade (isFavorite: false)
    expect(isUntouchedCuratedRoute(untouched)).toBe(true);

    const favorited: SavedRoute = { ...untouched, isFavorite: true };
    expect(isUntouchedCuratedRoute(favorited)).toBe(false);
  });

  it('pushes outbox, pulls cloud records, resolves LWW conflicts, and demotes duplicate Home/Work places', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://tuocwnjnkihchlxxqmgi.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_Biywe21SerSFL7yZYtl4nw_8X-dxTest');

    vi.spyOn(syncEngine, 'scheduleFlush').mockImplementation(() => {});
    await syncEngine.initialize('user-df-1');

    // Local has an older route and an older 'home' place
    await indexedDbStorage.saveRoute({
      ...sampleRoute,
      name: 'Rota Antiga Local',
      updatedAt: '2026-11-21T01:00:00.000Z',
    });
    const localHome: SavedPlace = {
      id: 'place-home-local',
      label: 'Casa Antiga',
      address: 'SGAN 912',
      coords: [-47.8992, -15.7524],
      category: 'home',
      createdAt: '2026-11-21T01:00:00.000Z',
      updatedAt: '2026-11-21T01:00:00.000Z',
    };
    await indexedDbStorage.savePlace(localHome);

    // Cloud has a newer version of the route AND a newer 'home' place on another device
    const cloudNewerRoute: SavedRoute = {
      ...sampleRoute,
      name: 'Rota Atualizada na Nuvem',
      updatedAt: '2026-11-21T02:00:00.000Z',
    };
    const cloudNewerHome: SavedPlace = {
      id: 'place-home-cloud',
      label: 'Casa Nova Noroeste',
      address: 'SQNW 111',
      coords: [-47.911, -15.744],
      category: 'home',
      createdAt: '2026-11-21T02:00:00.000Z',
      updatedAt: '2026-11-21T02:00:00.000Z',
    };

    vi.spyOn(supabaseAdapter, 'upsertSavedRoute').mockResolvedValue();
    vi.spyOn(supabaseAdapter, 'upsertSavedPlace').mockResolvedValue();
    vi.spyOn(supabaseAdapter, 'upsertCustomVehicle').mockResolvedValue();
    vi.spyOn(supabaseAdapter, 'upsertHazard').mockResolvedValue();
    vi.spyOn(supabaseAdapter, 'upsertRideSession').mockResolvedValue();
    vi.spyOn(supabaseAdapter, 'upsertPreferences').mockResolvedValue();

    vi.spyOn(supabaseAdapter, 'pullSavedRoutes').mockResolvedValue({
      active: [cloudNewerRoute],
      deletedIds: [],
    });
    vi.spyOn(supabaseAdapter, 'pullSavedPlaces').mockResolvedValue({
      active: [cloudNewerHome],
      deletedIds: [],
    });
    vi.spyOn(supabaseAdapter, 'pullCustomVehicles').mockResolvedValue({ active: [], deletedIds: [] });
    vi.spyOn(supabaseAdapter, 'pullHazards').mockResolvedValue({ active: [], deletedIds: [] });
    vi.spyOn(supabaseAdapter, 'pullRideSessions').mockResolvedValue({ active: [], deletedIds: [] });
    vi.spyOn(supabaseAdapter, 'pullPreferences').mockResolvedValue(null);

    const ok = await syncEngine.syncNow({ force: true });
    expect(ok).toBe(true);
    expect(syncEngine.getSnapshot().status).toBe('synced');

    const routes = await indexedDbStorage.getSavedRoutes();
    expect(routes.find((r) => r.id === sampleRoute.id)?.name).toBe('Rota Atualizada na Nuvem');

    // Both places must exist, with only the newer one as 'home' and the older demoted to 'favorite'
    const places = await indexedDbStorage.getSavedPlaces();
    expect(places).toHaveLength(2);
    expect(places.find((p) => p.id === 'place-home-cloud')?.category).toBe('home');
    expect(places.find((p) => p.id === 'place-home-local')?.category).toBe('favorite');
  });

  it('prevents tombstoned local deletions from being resurrected by stale cloud rows', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://tuocwnjnkihchlxxqmgi.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_Biywe21SerSFL7yZYtl4nw_8X-dxTest');
    vi.spyOn(syncEngine, 'scheduleFlush').mockImplementation(() => {});
    await syncEngine.initialize('user-df-1');

    // Delete route locally at 03:00Z
    await syncEngine.enqueueMutation('saved_routes', sampleRoute.id, 'delete', undefined, '2026-11-21T03:00:00.000Z');

    vi.spyOn(supabaseAdapter, 'softDeleteSavedRoute').mockResolvedValue();
    vi.spyOn(supabaseAdapter, 'pullSavedRoutes').mockResolvedValue({
      // Stale cloud snapshot from 02:00Z
      active: [{ ...sampleRoute, updatedAt: '2026-11-21T02:00:00.000Z' }],
      deletedIds: [],
    });
    vi.spyOn(supabaseAdapter, 'pullSavedPlaces').mockResolvedValue({ active: [], deletedIds: [] });
    vi.spyOn(supabaseAdapter, 'pullCustomVehicles').mockResolvedValue({ active: [], deletedIds: [] });
    vi.spyOn(supabaseAdapter, 'pullHazards').mockResolvedValue({ active: [], deletedIds: [] });
    vi.spyOn(supabaseAdapter, 'pullRideSessions').mockResolvedValue({ active: [], deletedIds: [] });
    vi.spyOn(supabaseAdapter, 'pullPreferences').mockResolvedValue(null);

    await syncEngine.syncNow({ force: true });
    const routes = await indexedDbStorage.getSavedRoutes();
    expect(routes.find((r) => r.id === sampleRoute.id)).toBeUndefined();
  });

  it('handles 401/403 expired JWT without spinning retry loops or losing local IndexedDB data', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://tuocwnjnkihchlxxqmgi.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_Biywe21SerSFL7yZYtl4nw_8X-dxTest');
    vi.spyOn(syncEngine, 'scheduleFlush').mockImplementation(() => {});
    await syncEngine.initialize('user-df-1');

    await repository.saveRoute(sampleRoute);
    vi.spyOn(supabaseAdapter, 'upsertSavedRoute').mockRejectedValue(
      new CloudSyncError('JWT expired', 401, 'PGRST301')
    );

    const ok = await syncEngine.syncNow({ force: true });
    expect(ok).toBe(false);
    expect(syncEngine.getSnapshot().status).toBe('error');
    expect(syncEngine.getSnapshot().error).toContain('Sessão expirada');

    // Local data is 100% preserved
    const routes = await indexedDbStorage.getSavedRoutes();
    expect(routes).toHaveLength(1);
    expect(computeBackoffDelayMs(3)).toBe(8000);
    expect(computeBackoffDelayMs(20)).toBe(60000);
  });

  it('syncs ride_sessions bidirectionally and degrades gracefully if ride_sessions SQL migration is missing', async () => {
    expect(isMissingTableError({ code: 'PGRST205', message: "Could not find the table 'public.ride_sessions' in the schema cache" })).toBe(true);
    expect(isMissingTableError({ code: '42P01', message: 'relation "public.ride_sessions" does not exist' })).toBe(true);
    expect(isMissingTableError({ code: 'PGRST301', status: 401, message: 'JWT expired' })).toBe(false);

    vi.stubEnv('VITE_SUPABASE_URL', 'https://tuocwnjnkihchlxxqmgi.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_Biywe21SerSFL7yZYtl4nw_8X-dxTest');
    vi.spyOn(syncEngine, 'scheduleFlush').mockImplementation(() => {});
    await syncEngine.initialize('user-df-1');

    await repository.saveRideSession(sampleRide);
    const upsertRideSpy = vi.spyOn(supabaseAdapter, 'upsertRideSession').mockResolvedValue();
    vi.spyOn(supabaseAdapter, 'pullSavedRoutes').mockResolvedValue({ active: [], deletedIds: [] });
    vi.spyOn(supabaseAdapter, 'pullSavedPlaces').mockResolvedValue({ active: [], deletedIds: [] });
    vi.spyOn(supabaseAdapter, 'pullCustomVehicles').mockResolvedValue({ active: [], deletedIds: [] });
    vi.spyOn(supabaseAdapter, 'pullHazards').mockResolvedValue({ active: [], deletedIds: [] });
    vi.spyOn(supabaseAdapter, 'pullRideSessions').mockResolvedValue({
      active: [{ ...sampleRide, id: 'ride-cloud-2', title: 'Pedal Nuvem Lago Sul' }],
      deletedIds: [],
    });
    vi.spyOn(supabaseAdapter, 'pullPreferences').mockResolvedValue(null);

    const ok = await syncEngine.syncNow({ force: true });
    expect(ok).toBe(true);
    expect(upsertRideSpy).toHaveBeenCalledTimes(1);

    const rides = await repository.getRideSessions();
    expect(rides.map((r) => r.id)).toContain('ride-test-1');
    expect(rides.map((r) => r.id)).toContain('ride-cloud-2');
  });
});
