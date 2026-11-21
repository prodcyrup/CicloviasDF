import type { MapBasemapMode, ThemeMode } from '../types';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

export const API_KEYS = {
  maptiler: env?.VITE_MAPTILER_KEY?.trim() || '',
  ors: env?.VITE_ORS_KEY?.trim() || '',
};

export function hasMapTilerKey(): boolean {
  return API_KEYS.maptiler.length > 6;
}

export function hasOrsKey(): boolean {
  return API_KEYS.ors.length > 6;
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
