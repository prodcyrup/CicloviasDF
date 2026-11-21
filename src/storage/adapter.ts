import type { HazardReport, SavedRoute, UserPreferences, VehicleSpec } from '../types';

/**
 * Clean persistence contract for EixoVerde.
 * Phase 1 uses IndexedDB (local-first PWA).
 * Phase 2 can implement SupabaseStorageAdapter against the exact same interface
 * (Auth + Postgres/PostGIS tables for saved_routes, custom_vehicles, hazard_reports, preferences).
 */
export interface StorageAdapter {
  getSavedRoutes(): Promise<SavedRoute[]>;
  saveRoute(route: SavedRoute): Promise<void>;
  deleteRoute(id: string): Promise<void>;

  getCustomVehicles(): Promise<VehicleSpec[]>;
  saveCustomVehicle(vehicle: VehicleSpec): Promise<void>;
  deleteCustomVehicle(id: string): Promise<void>;

  getHazards(): Promise<HazardReport[]>;
  saveHazard(hazard: HazardReport): Promise<void>;
  deleteHazard(id: string): Promise<void>;

  getPreferences(): Promise<Partial<UserPreferences>>;
  savePreferences(prefs: UserPreferences): Promise<void>;
}
