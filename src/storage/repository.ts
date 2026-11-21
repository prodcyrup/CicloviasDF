import type {
  HazardReport,
  RideSession,
  SavedPlace,
  SavedRoute,
  UserPreferences,
  VehicleSpec,
} from '../types';
import type { StorageAdapter } from './adapter';
import { indexedDbStorage } from './indexedDbAdapter';
import { isUntouchedCuratedRoute, syncEngine } from './syncEngine';

export interface UnifiedRepository extends StorageAdapter {
  confirmHazard(hazard: HazardReport): Promise<void>;
}

export const repository: UnifiedRepository = {
  async getSavedRoutes() {
    return indexedDbStorage.getSavedRoutes();
  },
  async saveRoute(route: SavedRoute) {
    const now = new Date().toISOString();
    const enriched: SavedRoute = {
      ...route,
      createdAt: route.createdAt || now,
      updatedAt: route.updatedAt || now,
    };
    await indexedDbStorage.saveRoute(enriched);
    if (!isUntouchedCuratedRoute(enriched)) {
      await syncEngine.enqueueMutation(
        'saved_routes',
        enriched.id,
        'upsert',
        enriched,
        enriched.updatedAt
      );
    }
  },
  async deleteRoute(id: string) {
    await indexedDbStorage.deleteRoute(id);
    await syncEngine.enqueueMutation('saved_routes', id, 'delete');
  },

  async getSavedPlaces() {
    return indexedDbStorage.getSavedPlaces();
  },
  async savePlace(place: SavedPlace) {
    const now = new Date().toISOString();
    const enriched: SavedPlace = {
      ...place,
      createdAt: place.createdAt || now,
      updatedAt: place.updatedAt || now,
    };
    await indexedDbStorage.savePlace(enriched);
    await syncEngine.enqueueMutation(
      'saved_places',
      enriched.id,
      'upsert',
      enriched,
      enriched.updatedAt
    );
  },
  async deletePlace(id: string) {
    await indexedDbStorage.deletePlace(id);
    await syncEngine.enqueueMutation('saved_places', id, 'delete');
  },

  async getCustomVehicles() {
    return indexedDbStorage.getCustomVehicles();
  },
  async saveCustomVehicle(vehicle: VehicleSpec) {
    const now = new Date().toISOString();
    const enriched: VehicleSpec = {
      ...vehicle,
      createdAt: vehicle.createdAt || now,
      updatedAt: vehicle.updatedAt || now,
    };
    await indexedDbStorage.saveCustomVehicle(enriched);
    await syncEngine.enqueueMutation(
      'custom_vehicles',
      enriched.id,
      'upsert',
      enriched,
      enriched.updatedAt
    );
  },
  async deleteCustomVehicle(id: string) {
    await indexedDbStorage.deleteCustomVehicle(id);
    await syncEngine.enqueueMutation('custom_vehicles', id, 'delete');
  },

  async getHazards() {
    return indexedDbStorage.getHazards();
  },
  async saveHazard(hazard: HazardReport) {
    const now = new Date().toISOString();
    const userId = syncEngine.getUserId();
    const enriched: HazardReport = {
      ...hazard,
      userId: hazard.userId || userId || undefined,
      isCommunity: Boolean(hazard.isCommunity || userId),
      createdAt: hazard.createdAt || now,
      updatedAt: hazard.updatedAt || hazard.createdAt || now,
    };
    await indexedDbStorage.saveHazard(enriched);
    await syncEngine.enqueueMutation(
      'hazard_reports',
      enriched.id,
      'upsert',
      enriched,
      enriched.updatedAt
    );
  },
  async confirmHazard(hazard: HazardReport) {
    const now = new Date().toISOString();
    const enriched: HazardReport = {
      ...hazard,
      updatedAt: now,
      confirmedByMe: true,
    };
    await indexedDbStorage.saveHazard(enriched);
    await syncEngine.enqueueMutation('hazard_reports', enriched.id, 'confirm', enriched, now);
  },
  async deleteHazard(id: string) {
    await indexedDbStorage.deleteHazard(id);
    await syncEngine.enqueueMutation('hazard_reports', id, 'delete');
  },

  async getRideSessions() {
    return indexedDbStorage.getRideSessions();
  },
  async saveRideSession(ride: RideSession) {
    const now = new Date().toISOString();
    const enriched: RideSession = {
      ...ride,
      createdAt: ride.createdAt || now,
      updatedAt: ride.updatedAt || now,
    };
    await indexedDbStorage.saveRideSession(enriched);
    await syncEngine.enqueueMutation(
      'ride_sessions',
      enriched.id,
      'upsert',
      enriched,
      enriched.updatedAt
    );
  },
  async deleteRideSession(id: string) {
    await indexedDbStorage.deleteRideSession(id);
    await syncEngine.enqueueMutation('ride_sessions', id, 'delete');
  },

  async getPreferences() {
    return indexedDbStorage.getPreferences();
  },
  async savePreferences(prefs: UserPreferences) {
    const now = new Date().toISOString();
    const enriched: UserPreferences = {
      ...prefs,
      updatedAt: prefs.updatedAt || now,
    };
    await indexedDbStorage.savePreferences(enriched);
    await syncEngine.enqueueMutation(
      'user_preferences',
      'current',
      'upsert',
      enriched,
      enriched.updatedAt
    );
  },
};
