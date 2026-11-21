import type {
  HazardReport,
  RideSession,
  SavedPlace,
  SavedRoute,
  UserPreferences,
  VehicleSpec,
} from '../types';

/**
 * Clean persistence contract for EixoVerde.
 * Phase 1 uses IndexedDB (local-first PWA).
 * Phase 2/3 implement Supabase Cloud Sync against the exact same offline-first model
 * (Auth + Postgres/PostGIS tables for saved_routes, saved_places, custom_vehicles,
 * hazard_reports, ride_sessions, and user_preferences).
 */
export interface StorageAdapter {
  getSavedRoutes(): Promise<SavedRoute[]>;
  saveRoute(route: SavedRoute): Promise<void>;
  deleteRoute(id: string): Promise<void>;

  getSavedPlaces(): Promise<SavedPlace[]>;
  savePlace(place: SavedPlace): Promise<void>;
  deletePlace(id: string): Promise<void>;

  getCustomVehicles(): Promise<VehicleSpec[]>;
  saveCustomVehicle(vehicle: VehicleSpec): Promise<void>;
  deleteCustomVehicle(id: string): Promise<void>;

  getHazards(): Promise<HazardReport[]>;
  saveHazard(hazard: HazardReport): Promise<void>;
  deleteHazard(id: string): Promise<void>;

  getRideSessions(): Promise<RideSession[]>;
  saveRideSession(ride: RideSession): Promise<void>;
  deleteRideSession(id: string): Promise<void>;

  getPreferences(): Promise<Partial<UserPreferences>>;
  savePreferences(prefs: UserPreferences): Promise<void>;
}
