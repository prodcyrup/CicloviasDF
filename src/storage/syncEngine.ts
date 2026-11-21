import { hasSupabaseConfig } from '../config/providers';
import { CURATED_DF_ROUTES } from '../data/curatedRoutes';
import type {
  HazardReport,
  LocalMigrationSummary,
  RideSession,
  SavedPlace,
  SavedRoute,
  SyncEntityType,
  SyncOutboxItem,
  SyncStateSnapshot,
  SyncStatus,
  UserPreferences,
  VehicleSpec,
} from '../types';
import { indexedDbStorage } from './indexedDbAdapter';
import { CloudSyncError, supabaseAdapter } from './supabaseAdapter';

type SyncListener = (snapshot: SyncStateSnapshot) => void;
type HydrateCallback = () => Promise<void> | void;

const CURATED_BY_ID = new Map(CURATED_DF_ROUTES.map((r) => [r.id, r]));

export function isUntouchedCuratedRoute(route: SavedRoute): boolean {
  const staticRoute = CURATED_BY_ID.get(route.id);
  if (!staticRoute) return false;
  return (
    route.name === staticRoute.name &&
    Boolean(route.isFavorite) === Boolean(staticRoute.isFavorite)
  );
}

export function computeBackoffDelayMs(attempts: number): number {
  const exp = Math.max(0, Math.min(8, attempts));
  return Math.min(60_000, 1000 * Math.pow(2, exp));
}

function isAuthError(err: unknown): boolean {
  if (err instanceof CloudSyncError) {
    if (err.status === 401 || err.status === 403) return true;
    if (err.code === '42501' || err.code === 'PGRST301') return true;
  }
  const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase();
  return msg.includes('jwt expired') || msg.includes('invalid jwt') || msg.includes('authentication required');
}

function isOfflineNetwork(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

class SyncEngine {
  private currentUserId: string | null = null;
  private status: SyncStatus = hasSupabaseConfig() ? 'idle' : 'local';
  private pendingCount = 0;
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;

  private listeners = new Set<SyncListener>();
  private hydrateCallbacks = new Set<HydrateCallback>();
  private inFlightSync: Promise<boolean> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private listenersBound = false;

  getSnapshot(): SyncStateSnapshot {
    return {
      status: this.status,
      pendingCount: this.pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      error: this.lastError,
    };
  }

  getUserId(): string | null {
    return this.currentUserId;
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  onHydrate(cb: HydrateCallback): () => void {
    this.hydrateCallbacks.add(cb);
    return () => {
      this.hydrateCallbacks.delete(cb);
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  private async triggerHydrate(): Promise<void> {
    for (const cb of this.hydrateCallbacks) {
      await cb();
    }
  }

  bindBrowserListeners(): void {
    if (this.listenersBound || typeof window === 'undefined') return;
    this.listenersBound = true;

    window.addEventListener('online', () => {
      if (!hasSupabaseConfig()) return;
      if (this.currentUserId) {
        this.status = 'idle';
        this.lastError = null;
        this.emit();
        void this.syncNow({ force: true });
      }
    });

    window.addEventListener('offline', () => {
      if (!hasSupabaseConfig()) return;
      if (this.currentUserId) {
        this.status = 'offline';
        this.emit();
      }
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (
          document.visibilityState === 'visible' &&
          hasSupabaseConfig() &&
          this.currentUserId &&
          !isOfflineNetwork()
        ) {
          void this.syncNow();
        }
      });
    }
  }

  async initialize(userId: string | null): Promise<void> {
    this.bindBrowserListeners();
    this.currentUserId = userId;

    const savedLastSync = await indexedDbStorage.getMeta<string>('last_synced_at');
    if (savedLastSync) {
      this.lastSyncedAt = savedLastSync;
    }

    const outbox = await indexedDbStorage.getOutboxItems();
    this.pendingCount = outbox.length;

    if (!hasSupabaseConfig()) {
      this.status = 'local';
      this.lastError = null;
      this.emit();
      return;
    }

    if (!userId) {
      this.status = 'idle';
      this.lastError = null;
      this.emit();
      return;
    }

    if (isOfflineNetwork()) {
      this.status = 'offline';
      this.emit();
      return;
    }

    this.status = 'idle';
    this.emit();
  }

  async setAuthenticatedUser(userId: string | null): Promise<void> {
    this.currentUserId = userId;
    if (!hasSupabaseConfig()) {
      this.status = 'local';
      this.lastError = null;
      this.emit();
      return;
    }
    if (!userId) {
      this.status = 'idle';
      this.lastError = null;
      this.emit();
      return;
    }
    const outbox = await indexedDbStorage.getOutboxItems();
    this.pendingCount = outbox.length;
    this.status = isOfflineNetwork() ? 'offline' : 'idle';
    this.lastError = null;
    this.emit();
  }

  async enqueueMutation(
    entity: SyncEntityType,
    recordId: string,
    operation: 'upsert' | 'delete' | 'confirm',
    payload?: unknown,
    updatedAt = new Date().toISOString()
  ): Promise<void> {
    if (!hasSupabaseConfig() || !this.currentUserId) {
      return;
    }

    const id = `${entity}:${recordId}`;
    if (operation === 'delete') {
      await indexedDbStorage.putTombstone({
        key: id,
        entity,
        recordId,
        deletedAt: updatedAt,
      });
    } else if (operation === 'upsert') {
      // Remove any older tombstone if user re-saves the same ID
      await indexedDbStorage.removeTombstone(id);
    }

    const item: SyncOutboxItem = {
      id,
      entity,
      recordId,
      operation,
      payload,
      updatedAt,
      attempts: 0,
    };

    await indexedDbStorage.putOutboxItem(item);
    const outbox = await indexedDbStorage.getOutboxItems();
    this.pendingCount = outbox.length;

    if (isOfflineNetwork()) {
      this.status = 'offline';
      this.emit();
      return;
    }

    this.emit();
    this.scheduleFlush(250);
  }

  scheduleFlush(delayMs = 250): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.syncNow();
    }, delayMs);
  }

  async getLocalMigrationSummary(): Promise<LocalMigrationSummary> {
    const [routes, places, vehicles, hazards, rides] = await Promise.all([
      indexedDbStorage.getSavedRoutes(),
      indexedDbStorage.getSavedPlaces(),
      indexedDbStorage.getCustomVehicles(),
      indexedDbStorage.getHazards(),
      indexedDbStorage.getRideSessions(),
    ]);

    const userRoutes = routes.filter((r) => !isUntouchedCuratedRoute(r));
    const localHazards = hazards.filter((h) => !h.isCommunity || Boolean(h.userId));

    const summary: LocalMigrationSummary = {
      routes: userRoutes.length,
      places: places.length,
      vehicles: vehicles.length,
      hazards: localHazards.length,
      rides: rides.length,
      total: userRoutes.length + places.length + vehicles.length + localHazards.length + rides.length,
    };
    return summary;
  }

  async hasCompletedInitialMigration(userId: string): Promise<boolean> {
    const flag = await indexedDbStorage.getMeta<boolean>(`migrated_user_${userId}`);
    return Boolean(flag);
  }

  async markInitialMigrationCompleted(userId: string): Promise<void> {
    await indexedDbStorage.setMeta(`migrated_user_${userId}`, true);
  }

  /**
   * Enqueues all local Guest/IndexedDB user data into the sync outbox (skipping
   * untouched static CURATED_DF_ROUTES) and performs a full bidirectional LWW sync.
   */
  async migrateLocalToCloud(): Promise<boolean> {
    if (!hasSupabaseConfig() || !this.currentUserId) return false;
    const userId = this.currentUserId;

    const [routes, places, vehicles, hazards, rides, prefs] = await Promise.all([
      indexedDbStorage.getSavedRoutes(),
      indexedDbStorage.getSavedPlaces(),
      indexedDbStorage.getCustomVehicles(),
      indexedDbStorage.getHazards(),
      indexedDbStorage.getRideSessions(),
      indexedDbStorage.getPreferences(),
    ]);

    const now = new Date().toISOString();

    for (const route of routes) {
      if (isUntouchedCuratedRoute(route)) continue;
      await indexedDbStorage.putOutboxItem({
        id: `saved_routes:${route.id}`,
        entity: 'saved_routes',
        recordId: route.id,
        operation: 'upsert',
        payload: route,
        updatedAt: route.updatedAt || now,
        attempts: 0,
      });
    }

    for (const place of places) {
      await indexedDbStorage.putOutboxItem({
        id: `saved_places:${place.id}`,
        entity: 'saved_places',
        recordId: place.id,
        operation: 'upsert',
        payload: place,
        updatedAt: place.updatedAt || now,
        attempts: 0,
      });
    }

    for (const vehicle of vehicles) {
      await indexedDbStorage.putOutboxItem({
        id: `custom_vehicles:${vehicle.id}`,
        entity: 'custom_vehicles',
        recordId: vehicle.id,
        operation: 'upsert',
        payload: vehicle,
        updatedAt: vehicle.updatedAt || now,
        attempts: 0,
      });
    }

    for (const hazard of hazards) {
      if (hazard.isCommunity && hazard.userId && hazard.userId !== userId) continue;
      const enriched: HazardReport = { ...hazard, userId: hazard.userId || userId };
      await indexedDbStorage.saveHazard(enriched);
      await indexedDbStorage.putOutboxItem({
        id: `hazard_reports:${hazard.id}`,
        entity: 'hazard_reports',
        recordId: hazard.id,
        operation: 'upsert',
        payload: enriched,
        updatedAt: hazard.updatedAt || hazard.createdAt || now,
        attempts: 0,
      });
    }

    for (const ride of rides) {
      await indexedDbStorage.putOutboxItem({
        id: `ride_sessions:${ride.id}`,
        entity: 'ride_sessions',
        recordId: ride.id,
        operation: 'upsert',
        payload: ride,
        updatedAt: ride.updatedAt || ride.endedAt || now,
        attempts: 0,
      });
    }

    if (prefs && Object.keys(prefs).length > 0) {
      await indexedDbStorage.putOutboxItem({
        id: 'user_preferences:current',
        entity: 'user_preferences',
        recordId: 'current',
        operation: 'upsert',
        payload: prefs,
        updatedAt: prefs.updatedAt || now,
        attempts: 0,
      });
    }

    const ok = await this.syncNow({ force: true });
    if (ok) {
      await this.markInitialMigrationCompleted(userId);
    }
    return ok;
  }

  async syncNow(options: { force?: boolean } = {}): Promise<boolean> {
    if (!hasSupabaseConfig()) {
      this.status = 'local';
      this.lastError = null;
      this.emit();
      return false;
    }

    if (!this.currentUserId) {
      this.status = 'idle';
      this.emit();
      return false;
    }

    if (isOfflineNetwork()) {
      const outbox = await indexedDbStorage.getOutboxItems();
      this.pendingCount = outbox.length;
      this.status = 'offline';
      this.emit();
      return false;
    }

    if (this.inFlightSync) {
      return this.inFlightSync;
    }

    this.inFlightSync = this.performSync(this.currentUserId, Boolean(options.force)).finally(() => {
      this.inFlightSync = null;
    });
    return this.inFlightSync;
  }

  private async performSync(userId: string, force: boolean): Promise<boolean> {
    this.status = 'syncing';
    this.lastError = null;
    this.emit();

    let hadError = false;
    let earliestNextRetry: number | null = null;

    // 1. Push Outbox
    const outbox = await indexedDbStorage.getOutboxItems();
    this.pendingCount = outbox.length;
    this.emit();

    const nowMs = Date.now();
    for (const item of outbox) {
      if (!force && item.nextRetryAt && item.nextRetryAt > nowMs) {
        if (earliestNextRetry === null || item.nextRetryAt < earliestNextRetry) {
          earliestNextRetry = item.nextRetryAt;
        }
        continue;
      }

      try {
        await this.pushOutboxItem(userId, item);
        await indexedDbStorage.removeOutboxItem(item.id);
      } catch (err) {
        hadError = true;
        const msg = err instanceof Error ? err.message : String(err);

        if (isAuthError(err)) {
          this.lastError = 'Sessão expirada — entre novamente para sincronizar.';
          this.status = 'error';
          const remaining = await indexedDbStorage.getOutboxItems();
          this.pendingCount = remaining.length;
          this.emit();
          return false;
        }

        const attempts = (item.attempts || 0) + 1;
        const delay = computeBackoffDelayMs(attempts);
        const nextRetryAt = Date.now() + delay;
        if (earliestNextRetry === null || nextRetryAt < earliestNextRetry) {
          earliestNextRetry = nextRetryAt;
        }

        await indexedDbStorage.putOutboxItem({
          ...item,
          attempts,
          nextRetryAt,
          lastError: msg,
        });
        this.lastError = 'Falha temporária ao sincronizar com a nuvem.';
      }
    }

    // 2. Pull & LWW Merge from Cloud
    try {
      await this.pullAndMergeAll(userId);
    } catch (err) {
      hadError = true;
      if (isAuthError(err)) {
        this.lastError = 'Sessão expirada — entre novamente para sincronizar.';
      } else {
        this.lastError =
          this.lastError || 'Não foi possível buscar atualizações da nuvem. Tentaremos novamente.';
      }
    }

    const remainingOutbox = await indexedDbStorage.getOutboxItems();
    this.pendingCount = remainingOutbox.length;

    if (!hadError) {
      const syncedIso = new Date().toISOString();
      this.lastSyncedAt = syncedIso;
      this.lastError = null;
      this.status = 'synced';
      await indexedDbStorage.setMeta('last_synced_at', syncedIso);
    } else {
      this.status = isOfflineNetwork() ? 'offline' : 'error';
      if (earliestNextRetry !== null) {
        this.scheduleRetry(Math.max(500, earliestNextRetry - Date.now()));
      }
    }

    this.emit();
    await this.triggerHydrate();
    return !hadError;
  }

  private scheduleRetry(delayMs: number): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (hasSupabaseConfig() && this.currentUserId && !isOfflineNetwork()) {
        void this.syncNow();
      }
    }, delayMs);
  }

  private async pushOutboxItem(userId: string, item: SyncOutboxItem): Promise<void> {
    switch (item.entity) {
      case 'saved_routes': {
        if (item.operation === 'delete') {
          await supabaseAdapter.softDeleteSavedRoute(userId, item.recordId, item.updatedAt);
        } else if (item.payload) {
          const route = item.payload as SavedRoute;
          if (!isUntouchedCuratedRoute(route)) {
            await supabaseAdapter.upsertSavedRoute(userId, route);
          }
        }
        break;
      }
      case 'saved_places': {
        if (item.operation === 'delete') {
          await supabaseAdapter.softDeleteSavedPlace(userId, item.recordId, item.updatedAt);
        } else if (item.payload) {
          await supabaseAdapter.upsertSavedPlace(userId, item.payload as SavedPlace);
        }
        break;
      }
      case 'custom_vehicles': {
        if (item.operation === 'delete') {
          await supabaseAdapter.softDeleteCustomVehicle(userId, item.recordId, item.updatedAt);
        } else if (item.payload) {
          await supabaseAdapter.upsertCustomVehicle(userId, item.payload as VehicleSpec);
        }
        break;
      }
      case 'hazard_reports': {
        if (item.operation === 'delete') {
          await supabaseAdapter.softDeleteHazard(userId, item.recordId, item.updatedAt);
        } else if (item.operation === 'confirm') {
          await supabaseAdapter.confirmHazardRpc(item.recordId);
        } else if (item.payload) {
          await supabaseAdapter.upsertHazard(userId, item.payload as HazardReport);
        }
        break;
      }
      case 'ride_sessions': {
        if (item.operation === 'delete') {
          await supabaseAdapter.softDeleteRideSession(userId, item.recordId, item.updatedAt);
        } else if (item.payload) {
          await supabaseAdapter.upsertRideSession(userId, item.payload as RideSession);
        }
        break;
      }
      case 'user_preferences': {
        if (item.operation === 'upsert' && item.payload) {
          await supabaseAdapter.upsertPreferences(userId, item.payload as UserPreferences);
        }
        break;
      }
    }
  }

  private async pullAndMergeAll(userId: string): Promise<void> {
    const [
      cloudRoutes,
      cloudPlaces,
      cloudVehicles,
      cloudHazards,
      cloudRides,
      cloudPrefs,
      localRoutes,
      localPlaces,
      localVehicles,
      localHazards,
      localRides,
      localPrefs,
      tombstones,
      outbox,
    ] = await Promise.all([
      supabaseAdapter.pullSavedRoutes(userId),
      supabaseAdapter.pullSavedPlaces(userId),
      supabaseAdapter.pullCustomVehicles(userId),
      supabaseAdapter.pullHazards(),
      supabaseAdapter.pullRideSessions(userId).catch((err) => {
        if (isAuthError(err)) throw err;
        return { active: [] as RideSession[], deletedIds: [] as Array<{ id: string; deletedAt: string }> };
      }),
      supabaseAdapter.pullPreferences(userId),
      indexedDbStorage.getSavedRoutes(),
      indexedDbStorage.getSavedPlaces(),
      indexedDbStorage.getCustomVehicles(),
      indexedDbStorage.getHazards(),
      indexedDbStorage.getRideSessions(),
      indexedDbStorage.getPreferences(),
      indexedDbStorage.getTombstones(),
      indexedDbStorage.getOutboxItems(),
    ]);

    const tombstoneMap = new Map(tombstones.map((t) => [t.key, t.deletedAt]));
    const outboxMap = new Map(outbox.map((o) => [o.id, o]));

    // --- Merge Saved Routes (LWW) ---
    const localRouteMap = new Map(localRoutes.map((r) => [r.id, r]));
    for (const del of cloudRoutes.deletedIds) {
      const key = `saved_routes:${del.id}`;
      const local = localRouteMap.get(del.id);
      if (!local || (del.deletedAt || '') >= (local.updatedAt || '')) {
        await indexedDbStorage.deleteRoute(del.id);
        await indexedDbStorage.putTombstone({
          key,
          entity: 'saved_routes',
          recordId: del.id,
          deletedAt: del.deletedAt,
        });
      }
    }
    for (const remote of cloudRoutes.active) {
      const key = `saved_routes:${remote.id}`;
      const tombAt = tombstoneMap.get(key);
      if (tombAt && tombAt >= remote.updatedAt) continue;

      const pending = outboxMap.get(key);
      if (pending && pending.updatedAt > remote.updatedAt) continue;

      const local = localRouteMap.get(remote.id);
      if (!local || (remote.updatedAt || '') > (local.updatedAt || '')) {
        await indexedDbStorage.saveRoute(remote);
      }
    }

    // --- Merge Saved Places (LWW + Home/Work singleton demotion) ---
    const localPlaceMap = new Map(localPlaces.map((p) => [p.id, p]));
    for (const del of cloudPlaces.deletedIds) {
      const key = `saved_places:${del.id}`;
      const local = localPlaceMap.get(del.id);
      if (!local || (del.deletedAt || '') >= (local.updatedAt || '')) {
        await indexedDbStorage.deletePlace(del.id);
        await indexedDbStorage.putTombstone({
          key,
          entity: 'saved_places',
          recordId: del.id,
          deletedAt: del.deletedAt,
        });
      }
    }
    for (const remote of cloudPlaces.active) {
      const key = `saved_places:${remote.id}`;
      const tombAt = tombstoneMap.get(key);
      if (tombAt && tombAt >= remote.updatedAt) continue;

      const pending = outboxMap.get(key);
      if (pending && pending.updatedAt > remote.updatedAt) continue;

      const local = localPlaceMap.get(remote.id);
      if (!local || (remote.updatedAt || '') > (local.updatedAt || '')) {
        await indexedDbStorage.savePlace(remote);
      }
    }

    // Enforce at most one 'home' and one 'work' place (newest updatedAt wins; older demoted to 'favorite')
    const mergedPlaces = await indexedDbStorage.getSavedPlaces();
    for (const singletonCat of ['home', 'work'] as const) {
      const matches = mergedPlaces
        .filter((p) => p.category === singletonCat)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

      if (matches.length > 1) {
        for (let i = 1; i < matches.length; i++) {
          const demoted: SavedPlace = {
            ...matches[i],
            category: 'favorite',
            updatedAt: new Date().toISOString(),
          };
          await indexedDbStorage.savePlace(demoted);
          await indexedDbStorage.putOutboxItem({
            id: `saved_places:${demoted.id}`,
            entity: 'saved_places',
            recordId: demoted.id,
            operation: 'upsert',
            payload: demoted,
            updatedAt: demoted.updatedAt,
            attempts: 0,
          });
        }
      }
    }

    // --- Merge Custom Vehicles (LWW) ---
    const localVehicleMap = new Map(localVehicles.map((v) => [v.id, v]));
    for (const del of cloudVehicles.deletedIds) {
      const key = `custom_vehicles:${del.id}`;
      const local = localVehicleMap.get(del.id);
      if (!local || (del.deletedAt || '') >= (local.updatedAt || '')) {
        await indexedDbStorage.deleteCustomVehicle(del.id);
        await indexedDbStorage.putTombstone({
          key,
          entity: 'custom_vehicles',
          recordId: del.id,
          deletedAt: del.deletedAt,
        });
      }
    }
    for (const remote of cloudVehicles.active) {
      const key = `custom_vehicles:${remote.id}`;
      const tombAt = tombstoneMap.get(key);
      if (tombAt && tombAt >= (remote.updatedAt || '')) continue;

      const pending = outboxMap.get(key);
      if (pending && pending.updatedAt > (remote.updatedAt || '')) continue;

      const local = localVehicleMap.get(remote.id);
      if (!local || (remote.updatedAt || '') > (local.updatedAt || '')) {
        await indexedDbStorage.saveCustomVehicle(remote);
      }
    }

    // --- Merge Community Hazards (LWW) ---
    const localHazardMap = new Map(localHazards.map((h) => [h.id, h]));
    for (const del of cloudHazards.deletedIds) {
      const key = `hazard_reports:${del.id}`;
      const local = localHazardMap.get(del.id);
      if (!local || (del.deletedAt || '') >= (local.updatedAt || local.createdAt || '')) {
        await indexedDbStorage.deleteHazard(del.id);
        await indexedDbStorage.putTombstone({
          key,
          entity: 'hazard_reports',
          recordId: del.id,
          deletedAt: del.deletedAt,
        });
      }
    }
    for (const remote of cloudHazards.active) {
      const key = `hazard_reports:${remote.id}`;
      const tombAt = tombstoneMap.get(key);
      const remoteUpdated = remote.updatedAt || remote.createdAt;
      if (tombAt && tombAt >= remoteUpdated) continue;

      const pending = outboxMap.get(key);
      if (pending && pending.updatedAt > remoteUpdated) continue;

      const local = localHazardMap.get(remote.id);
      const localUpdated = local?.updatedAt || local?.createdAt || '';
      if (!local || remoteUpdated >= localUpdated || remote.confirmations !== local.confirmations) {
        await indexedDbStorage.saveHazard(remote);
      }
    }

    // --- Merge Ride Sessions (LWW) ---
    const localRideMap = new Map(localRides.map((r) => [r.id, r]));
    for (const del of cloudRides.deletedIds) {
      const key = `ride_sessions:${del.id}`;
      const local = localRideMap.get(del.id);
      if (!local || (del.deletedAt || '') >= (local.updatedAt || '')) {
        await indexedDbStorage.deleteRideSession(del.id);
        await indexedDbStorage.putTombstone({
          key,
          entity: 'ride_sessions',
          recordId: del.id,
          deletedAt: del.deletedAt,
        });
      }
    }
    for (const remote of cloudRides.active) {
      const key = `ride_sessions:${remote.id}`;
      const tombAt = tombstoneMap.get(key);
      if (tombAt && tombAt >= (remote.updatedAt || '')) continue;

      const pending = outboxMap.get(key);
      if (pending && pending.updatedAt > (remote.updatedAt || '')) continue;

      const local = localRideMap.get(remote.id);
      if (!local || (remote.updatedAt || '') > (local.updatedAt || '')) {
        await indexedDbStorage.saveRideSession(remote);
      }
    }

    // --- Merge User Preferences (LWW, preserving per-vehicle battery calibrations) ---
    if (cloudPrefs && cloudPrefs.prefs && Object.keys(cloudPrefs.prefs).length > 0) {
      const localUpdated = localPrefs.updatedAt || '';
      const pendingPref = outboxMap.get('user_preferences:current');
      if (!pendingPref && cloudPrefs.updatedAt > localUpdated) {
        const mergedCalibrations = {
          ...(localPrefs.batteryCalibrations ?? {}),
          ...(cloudPrefs.prefs.batteryCalibrations ?? {}),
        };
        const mergedPrefs = {
          ...localPrefs,
          ...cloudPrefs.prefs,
          batteryCalibrations: Object.keys(mergedCalibrations).length > 0 ? mergedCalibrations : undefined,
          updatedAt: cloudPrefs.updatedAt,
        } as UserPreferences;
        await indexedDbStorage.savePreferences(mergedPrefs);
      }
    }
  }

  async resetForTests(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.debounceTimer = null;
    this.retryTimer = null;
    this.inFlightSync = null;
    this.currentUserId = null;
    this.status = hasSupabaseConfig() ? 'idle' : 'local';
    this.pendingCount = 0;
    this.lastSyncedAt = null;
    this.lastError = null;
    this.listeners.clear();
    this.hydrateCallbacks.clear();
    await indexedDbStorage.resetForTests();
  }
}

export const syncEngine = new SyncEngine();
