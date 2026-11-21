import type { HazardReport, SavedRoute, UserPreferences, VehicleSpec } from '../types';
import type { StorageAdapter } from './adapter';

const DB_NAME = 'eixoverde_db_v1';
const DB_VERSION = 1;
const STORES = {
  routes: 'saved_routes',
  vehicles: 'custom_vehicles',
  hazards: 'hazard_reports',
  meta: 'user_meta',
} as const;

const PREFS_KEY = 'eixoverde_prefs_v1';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.routes)) {
        db.createObjectStore(STORES.routes, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.vehicles)) {
        db.createObjectStore(STORES.vehicles, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.hazards)) {
        db.createObjectStore(STORES.hazards, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDB();
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function putItem<T>(storeName: string, item: T): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Graceful no-op in restricted private windows
  }
}

async function removeItem(storeName: string, id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Graceful no-op
  }
}

export const indexedDbStorage: StorageAdapter = {
  async getSavedRoutes() {
    const items = await getAll<SavedRoute>(STORES.routes);
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async saveRoute(route) {
    await putItem(STORES.routes, route);
  },
  async deleteRoute(id) {
    await removeItem(STORES.routes, id);
  },

  async getCustomVehicles() {
    return getAll<VehicleSpec>(STORES.vehicles);
  },
  async saveCustomVehicle(vehicle) {
    await putItem(STORES.vehicles, vehicle);
  },
  async deleteCustomVehicle(id) {
    await removeItem(STORES.vehicles, id);
  },

  async getHazards() {
    const items = await getAll<HazardReport>(STORES.hazards);
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async saveHazard(hazard) {
    await putItem(STORES.hazards, hazard);
  },
  async deleteHazard(id) {
    await removeItem(STORES.hazards, id);
  },

  async getPreferences() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return raw ? (JSON.parse(raw) as Partial<UserPreferences>) : {};
    } catch {
      return {};
    }
  },
  async savePreferences(prefs) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore quota errors
    }
  },
};
