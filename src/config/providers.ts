import type { MapBasemapMode, ThemeMode } from '../types';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export const API_KEYS = {
  get maptiler(): string {
    return (import.meta.env?.VITE_MAPTILER_KEY ?? '').trim();
  },
  get ors(): string {
    return (import.meta.env?.VITE_ORS_KEY ?? '').trim();
  },
};

export function hasMapTilerKey(): boolean {
  return API_KEYS.maptiler.length > 6;
}

export function hasOrsKey(): boolean {
  return API_KEYS.ors.length > 6;
}

/**
 * Dynamically resolves and validates Supabase configuration from Vite env vars.
 * Accepts both modern Publishable keys (`sb_publishable_...`) and legacy JWT
 * `anon` keys (`eyJ...`). Returns `null` cleanly in Guest/Local mode when
 * either variable is missing, blank, partial, or invalid.
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const rawUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').trim();
  const rawKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '').trim();

  if (!rawUrl || !rawKey) {
    return null;
  }

  if (/\s/.test(rawUrl) || /\s/.test(rawKey)) {
    return null;
  }

  if (rawKey.length < 16) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const isHttps = parsed.protocol === 'https:' && parsed.hostname.length > 0;
  const isLocalHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

  if (!isHttps && !isLocalHttp) {
    return null;
  }

  const url = rawUrl.replace(/\/+$/, '');
  return { url, anonKey: rawKey };
}

export function hasSupabaseConfig(): boolean {
  return getSupabaseConfig() !== null;
}

export function getOrsProxyUrl(): string | null {
  const cfg = getSupabaseConfig();
  return cfg ? `${cfg.url}/functions/v1/ors-proxy` : null;
}

/**
 * Returns the MapLibre style URL or inline StyleSpecification.
 * Uses MapTiler Cloud when VITE_MAPTILER_KEY is configured, and falls back
 * seamlessly to zero-key OpenFreeMap vector tiles (or Esri World Imagery for satellite).
 */
export function getMapStyle(theme: ThemeMode, basemap: MapBasemapMode): string | object {
  if (hasMapTilerKey()) {
    const key = encodeURIComponent(API_KEYS.maptiler);
    if (basemap === 'satellite') {
      return `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`;
    }
    return theme === 'dark'
      ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${key}`
      : `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`;
  }

  if (basemap === 'satellite') {
    return {
      version: 8,
      name: 'EixoVerde Satélite',
      sources: {
        'esri-satellite': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© Esri World Imagery',
        },
        'carto-labels': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© CARTO',
        },
      },
      layers: [
        { id: 'esri-sat-layer', type: 'raster', source: 'esri-satellite' },
        { id: 'carto-lbl-layer', type: 'raster', source: 'carto-labels', paint: { 'raster-opacity': 0.9 } },
      ],
    };
  }

  // Zero-key vector map via OpenFreeMap (supports smooth 60fps rotation & 3D pitch)
  return theme === 'dark'
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/liberty';
}

export const ENDPOINTS = {
  orsCyclingRegular: 'https://api.heigit.org/openrouteservice/v2/directions/cycling-regular/geojson',
  orsCyclingElectric: 'https://api.heigit.org/openrouteservice/v2/directions/cycling-electric/geojson',
  orsCyclingRoad: 'https://api.heigit.org/openrouteservice/v2/directions/cycling-road/geojson',
  brouter: 'https://brouter.de/brouter',
  osrmBike: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
  photonSearch: 'https://photon.komoot.io/api/',
  photonReverse: 'https://photon.komoot.io/reverse',
  nominatimSearch: 'https://nominatim.openstreetmap.org/search',
  nominatimReverse: 'https://nominatim.openstreetmap.org/reverse',
} as const;
