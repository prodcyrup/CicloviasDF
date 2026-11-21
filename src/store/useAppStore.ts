import { create } from 'zustand';
import { BRAND } from '../config/brand';
import { CURATED_DF_ROUTES } from '../data/curatedRoutes';
import { PRESET_VEHICLES } from '../data/vehicles';
import {
  computeElevationStats,
  computePathDistanceKm,
  computeSurfaceBreakdown,
  detectArterialCrossings,
} from '../engine/geo';
import { decodeShareableRouteFromUrl } from '../engine/gpx';
import { extractRouteManeuvers } from '../engine/navigation';
import { planMultiProfileRoutes, reverseGeocode } from '../engine/routing';
import { indexedDbStorage } from '../storage/indexedDbAdapter';
import type {
  AppMode,
  HazardKind,
  HazardReport,
  LngLat,
  MapBasemapMode,
  PlaceResult,
  RouteCandidate,
  SavedPlace,
  SavedPlaceCategory,
  SavedRoute,
  ThemeMode,
  UserPreferences,
  VehicleSpec,
  VoiceMode,
} from '../types';

export type MapPickTarget =
  | null
  | 'origin'
  | 'dest'
  | 'via'
  | 'hazard'
  | 'save_place'
  | 'save_home'
  | 'save_work';

export interface ToastMessage {
  id: string;
  title: string;
  body?: string;
  tone?: 'emerald' | 'amber' | 'rose' | 'slate';
}

interface NavState {
  isTracking: boolean;
  isDemoMode: boolean;
  followUser: boolean;
  pitch3D: boolean;
  currentPos: LngLat | null;
  currentHeading: number;
  currentSpeedKmh: number;
  accuracyMeters: number | null;
  distanceAlongM: number;
  offRouteMeters: number;
  isRerouting: boolean;
  reversed: boolean;
}

export interface AppStore {
  initialized: boolean;
  mode: AppMode;
  theme: ThemeMode;
  basemap: MapBasemapMode;
  voiceMode: VoiceMode;
  showBikeLanes: boolean;
  showPois: boolean;
  showHazards: boolean;

  // User & Vehicle Garage
  customVehicles: VehicleSpec[];
  selectedVehicleId: string;
  selectedModeIndex: number;
  riderWeightKg: number;
  isRoundTrip: boolean;
  homePlace?: PlaceResult;
  workPlace?: PlaceResult;

  // Planner & Active Route
  origin: PlaceResult | null;
  destination: PlaceResult | null;
  currentLocationPlace: PlaceResult | null;
  viaPoints: LngLat[];
  isRouting: boolean;
  candidates: RouteCandidate[];
  selectedCandidateIdx: number;
  isEditingWaypoints: boolean;
  mapPickTarget: MapPickTarget;
  hoverCoordIndex: number | null;
  fitBoundsNonce: number;
  flyToTarget: { coords: LngLat; zoom?: number; nonce: number } | null;

  // Saved Routes, Saved Places & Hazards
  savedRoutes: SavedRoute[];
  savedPlaces: SavedPlace[];
  hazards: HazardReport[];
  exploreTab: 'routes' | 'places';

  // Live Navigation
  nav: NavState;

  // Overlays / Modals
  garageOpen: boolean;
  compareOpen: boolean;
  menuOpen: boolean;
  hazardPickerOpen: boolean;
  pendingHazardCoords: LngLat | null;
  pendingSavePlace: { place: PlaceResult; defaultCategory: SavedPlaceCategory } | null;
  mapContextPin: { coords: LngLat; place: PlaceResult | null; loading: boolean } | null;
  toasts: ToastMessage[];

  // Actions
  bootstrap: () => Promise<void>;
  locateCurrentPosition: (options?: { silent?: boolean; flyToUser?: boolean }) => Promise<PlaceResult | null>;
  useCurrentLocationAsOrigin: () => Promise<void>;
  setMode: (mode: AppMode) => void;
  toggleTheme: () => void;
  toggleBasemap: () => void;
  cycleVoiceMode: () => void;
  toggleLayer: (layer: 'lanes' | 'pois' | 'hazards') => void;
  setExploreTab: (tab: 'routes' | 'places') => void;

  // Vehicle actions
  getAllVehicles: () => VehicleSpec[];
  getActiveVehicle: () => VehicleSpec;
  selectVehicle: (id: string, modeIdx?: number) => void;
  setModeIndex: (idx: number) => void;
  setRiderWeight: (kg: number) => void;
  toggleRoundTrip: () => void;
  addCustomVehicle: (vehicle: VehicleSpec) => Promise<void>;
  deleteCustomVehicle: (id: string) => Promise<void>;

  // Place & Planning actions
  setOrigin: (place: PlaceResult | null, autoPlan?: boolean) => void;
  setDestination: (place: PlaceResult | null, autoPlan?: boolean) => Promise<void>;
  swapOriginDest: () => void;
  setMapPickTarget: (target: MapPickTarget) => void;
  handleMapClick: (coords: LngLat) => Promise<void>;
  openMapContextPin: (coords: LngLat) => Promise<void>;
  closeMapContextPin: () => void;
  recalculateRoute: (customWaypoints?: LngLat[]) => Promise<void>;
  selectCandidate: (idx: number) => void;
  toggleEditWaypoints: () => void;
  updateWaypoint: (index: number, coords: LngLat) => Promise<void>;
  addViaPoint: (coords: LngLat) => Promise<void>;
  removeViaPoint: (viaIdx: number) => Promise<void>;
  clearActiveRoute: () => void;
  loadSavedRoute: (route: SavedRoute) => void;
  saveCurrentRoute: (customName?: string) => Promise<void>;
  renameSavedRoute: (id: string, newName: string) => Promise<void>;
  deleteSavedRoute: (id: string) => Promise<void>;
  toggleFavoriteRoute: (id: string) => Promise<void>;
  importSavedRoute: (route: SavedRoute) => Promise<void>;

  // Saved Places (Meus Locais)
  openSavePlacePrompt: (place: PlaceResult, defaultCategory?: SavedPlaceCategory) => void;
  closeSavePlacePrompt: () => void;
  saveFavoritePlace: (place: PlaceResult, label: string, category: SavedPlaceCategory) => Promise<void>;
  renameSavedPlace: (id: string, newLabel: string) => Promise<void>;
  updateSavedPlaceCategory: (id: string, category: SavedPlaceCategory) => Promise<void>;
  deleteSavedPlace: (id: string) => Promise<void>;
  setHomeOrWork: (slot: 'home' | 'work', place: PlaceResult) => void;
  setHoverCoordIndex: (idx: number | null) => void;
  requestFitRoute: () => void;
  flyTo: (coords: LngLat, zoom?: number) => void;

  // Navigation actions
  startNavigation: (demo?: boolean) => void;
  stopNavigation: () => void;
  updateNavTelemetry: (patch: Partial<NavState>) => void;
  reverseActiveRoute: () => void;
  triggerOffRouteReroute: (fromPos: LngLat) => Promise<void>;

  // Hazards
  openHazardReporter: (coords?: LngLat) => void;
  submitHazard: (kind: HazardKind, title: string, note?: string) => Promise<void>;
  confirmHazard: (id: string) => Promise<void>;
  deleteHazard: (id: string) => Promise<void>;

  // UI overlays
  setGarageOpen: (open: boolean) => void;
  setCompareOpen: (open: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  setHazardPickerOpen: (open: boolean) => void;
  pushToast: (title: string, body?: string, tone?: ToastMessage['tone']) => void;
  dismissToast: (id: string) => void;
}

/** Reactive Zustand selector so any component immediately re-renders when active vehicle changes */
export function selectActiveVehicle(state: AppStore): VehicleSpec {
  return (
    state.customVehicles.find((v) => v.id === state.selectedVehicleId) ??
    PRESET_VEHICLES.find((v) => v.id === state.selectedVehicleId) ??
    PRESET_VEHICLES[0]
  );
}

function savedRouteToCandidate(route: SavedRoute): RouteCandidate {
  const elevation = computeElevationStats(route.coords);
  const surfaces = computeSurfaceBreakdown(route.coords, route.profile);
  const crossings = detectArterialCrossings(route.coords);
  const maneuvers = extractRouteManeuvers(route.coords);
  return {
    id: route.id,
    profile: route.profile,
    title: route.name,
    subtitle: route.description || route.tag,
    source: route.isCurated ? 'curated' : 'gpx',
    coords: route.coords,
    distanceKm: route.distanceKm || computePathDistanceKm(route.coords),
    elevation,
    surfaces,
    crossings,
    maneuvers,
    waypoints: route.waypoints.length >= 2
      ? route.waypoints
      : [
          [route.coords[0][0], route.coords[0][1]],
          [route.coords[route.coords.length - 1][0], route.coords[route.coords.length - 1][1]],
        ],
    originName: route.originName,
    destName: route.destName,
  };
}

function persistPrefs(state: AppStore): void {
  const prefs: UserPreferences = {
    theme: state.theme,
    basemap: state.basemap,
    selectedVehicleId: state.selectedVehicleId,
    selectedModeIndex: state.selectedModeIndex,
    riderWeightKg: state.riderWeightKg,
    voiceMode: state.voiceMode,
    showBikeLanes: state.showBikeLanes,
    showPois: state.showPois,
    showHazards: state.showHazards,
    homePlace: state.homePlace,
    workPlace: state.workPlace,
  };
  void indexedDbStorage.savePreferences(prefs);
}

export const useAppStore = create<AppStore>((set, get) => ({
  initialized: false,
  mode: 'explore',
  theme: 'light',
  basemap: 'standard',
  voiceMode: 'voice', // Audio-first handlebar mode ON by default
  showBikeLanes: true,
  showPois: true,
  showHazards: true,

  customVehicles: [],
  selectedVehicleId: 'jet-aluguel',
  selectedModeIndex: 1,
  riderWeightKg: 70,
  isRoundTrip: false,

  origin: null,
  destination: null,
  currentLocationPlace: null,
  viaPoints: [],
  isRouting: false,
  candidates: [],
  selectedCandidateIdx: 0,
  isEditingWaypoints: false,
  mapPickTarget: null,
  hoverCoordIndex: null,
  fitBoundsNonce: 0,
  flyToTarget: null,

  savedRoutes: CURATED_DF_ROUTES,
  savedPlaces: [],
  hazards: [],
  exploreTab: 'routes',

  nav: {
    isTracking: false,
    isDemoMode: false,
    followUser: true,
    pitch3D: true,
    currentPos: null,
    currentHeading: 0,
    currentSpeedKmh: 0,
    accuracyMeters: null,
    distanceAlongM: 0,
    offRouteMeters: 0,
    isRerouting: false,
    reversed: false,
  },

  garageOpen: false,
  compareOpen: false,
  menuOpen: false,
  hazardPickerOpen: false,
  pendingHazardCoords: null,
  pendingSavePlace: null,
  mapContextPin: null,
  toasts: [],

  async bootstrap() {
    if (get().initialized) return;
    const [prefs, userRoutes, savedPlaces, customVehicles, hazards] = await Promise.all([
      indexedDbStorage.getPreferences(),
      indexedDbStorage.getSavedRoutes(),
      indexedDbStorage.getSavedPlaces(),
      indexedDbStorage.getCustomVehicles(),
      indexedDbStorage.getHazards(),
    ]);

    const theme: ThemeMode = prefs.theme ?? 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');

    // Merge user saved routes with curated routes (user edits override curated IDs)
    const userIds = new Set(userRoutes.map((r) => r.id));
    const mergedRoutes = [...userRoutes, ...CURATED_DF_ROUTES.filter((c) => !userIds.has(c.id))];

    const homeSaved = savedPlaces.find((p) => p.category === 'home');
    const workSaved = savedPlaces.find((p) => p.category === 'work');

    set({
      initialized: true,
      theme,
      basemap: prefs.basemap ?? 'standard',
      selectedVehicleId: prefs.selectedVehicleId ?? 'jet-aluguel',
      selectedModeIndex: prefs.selectedModeIndex ?? 1,
      riderWeightKg: prefs.riderWeightKg ?? 70,
      voiceMode: prefs.voiceMode ?? 'voice',
      showBikeLanes: prefs.showBikeLanes ?? true,
      showPois: prefs.showPois ?? true,
      showHazards: prefs.showHazards ?? true,
      homePlace: homeSaved
        ? { id: homeSaved.id, name: homeSaved.label, subtitle: homeSaved.address, coords: homeSaved.coords, source: 'curated' }
        : prefs.homePlace,
      workPlace: workSaved
        ? { id: workSaved.id, name: workSaved.label, subtitle: workSaved.address, coords: workSaved.coords, source: 'curated' }
        : prefs.workPlace,
      customVehicles,
      savedRoutes: mergedRoutes,
      savedPlaces,
      hazards,
    });

    // Check if opened from a shared route link (?share=...)
    const shared = decodeShareableRouteFromUrl();
    if (shared && shared.waypoints.length >= 2) {
      const originPlace = await reverseGeocode(shared.waypoints[0]);
      const destPlace = await reverseGeocode(shared.waypoints[shared.waypoints.length - 1]);
      set({
        origin: originPlace,
        destination: destPlace,
        viaPoints: shared.waypoints.slice(1, -1),
        mode: 'preview',
      });
      await get().recalculateRoute(shared.waypoints);
      get().pushToast('Rota compartilhada aberta', shared.name, 'emerald');
      return;
    }

    // Automatically locate user's real GPS position on startup so Point A is always accurate
    void get().locateCurrentPosition({ silent: true, flyToUser: true });
  },

  async locateCurrentPosition({ silent = false, flyToUser = false } = {}) {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      if (!silent) {
        get().pushToast('GPS indisponível', 'Seu navegador não suporta geolocalização.', 'amber');
      }
      return null;
    }

    const coords = await new Promise<{ pos: LngLat; acc: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) =>
          resolve({
            pos: [+p.coords.longitude.toFixed(6), +p.coords.latitude.toFixed(6)],
            acc: Math.round(p.coords.accuracy || 0),
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6500, maximumAge: 25000 }
      );
    });

    if (!coords) {
      if (!silent) {
        get().pushToast('Permissão de GPS necessária', 'Ative a localização no navegador para usar seu ponto atual.', 'amber');
      }
      return null;
    }

    set((s) => ({
      nav: { ...s.nav, currentPos: coords.pos, accuracyMeters: coords.acc },
    }));

    if (flyToUser && get().mode === 'explore') {
      get().flyTo(coords.pos, 15.2);
    }

    const rev = await reverseGeocode(coords.pos);
    const gpsPlace: PlaceResult = {
      ...rev,
      id: 'gps-current',
      name: rev.name && rev.name !== 'Ponto Selecionado' ? `Minha localização (${rev.name})` : 'Minha localização atual',
      coords: coords.pos,
      source: 'gps',
    };
    set({ currentLocationPlace: gpsPlace });
    return gpsPlace;
  },

  async useCurrentLocationAsOrigin() {
    const gpsPlace = (await get().locateCurrentPosition({ silent: false, flyToUser: false })) ?? get().currentLocationPlace;
    if (!gpsPlace) return;
    set({ origin: gpsPlace });
    if (get().destination) {
      await get().recalculateRoute();
    } else {
      get().flyTo(gpsPlace.coords, 15.5);
    }
  },

  setMode(mode) {
    set({ mode, mapPickTarget: null });
  },

  toggleTheme() {
    const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    set({ theme: next });
    persistPrefs(get());
  },

  toggleBasemap() {
    const next: MapBasemapMode = get().basemap === 'standard' ? 'satellite' : 'standard';
    set({ basemap: next });
    persistPrefs(get());
  },

  cycleVoiceMode() {
    const cur = get().voiceMode;
    const next: VoiceMode = cur === 'voice' ? 'chime' : cur === 'chime' ? 'mute' : 'voice';
    set({ voiceMode: next });
    persistPrefs(get());
    const labels: Record<VoiceMode, string> = {
      voice: 'Voz PT-BR + alertas sonoros ativados',
      chime: 'Modo discreto: apenas sinais sonoros',
      mute: 'Áudio de navegação silenciado',
    };
    get().pushToast('Áudio da navegação', labels[next], 'slate');
  },

  toggleLayer(layer) {
    if (layer === 'lanes') set((s) => ({ showBikeLanes: !s.showBikeLanes }));
    if (layer === 'pois') set((s) => ({ showPois: !s.showPois }));
    if (layer === 'hazards') set((s) => ({ showHazards: !s.showHazards }));
    persistPrefs(get());
  },

  setExploreTab(tab) {
    set({ exploreTab: tab });
  },

  getAllVehicles() {
    return [...get().customVehicles, ...PRESET_VEHICLES];
  },

  getActiveVehicle() {
    const all = get().getAllVehicles();
    return all.find((v) => v.id === get().selectedVehicleId) ?? all[0];
  },

  selectVehicle(id, modeIdx) {
    const vehicle = get().getAllVehicles().find((v) => v.id === id);
    const defaultMode = vehicle ? Math.min(modeIdx ?? 1, vehicle.modes.length - 1) : 0;
    set({ selectedVehicleId: id, selectedModeIndex: Math.max(0, defaultMode) });
    persistPrefs(get());
  },

  setModeIndex(idx) {
    set({ selectedModeIndex: idx });
    persistPrefs(get());
  },

  setRiderWeight(kg) {
    set({ riderWeightKg: Math.max(35, Math.min(160, Math.round(kg))) });
    persistPrefs(get());
  },

  toggleRoundTrip() {
    set((s) => ({ isRoundTrip: !s.isRoundTrip }));
  },

  async addCustomVehicle(vehicle) {
    await indexedDbStorage.saveCustomVehicle(vehicle);
    set((s) => ({
      customVehicles: [vehicle, ...s.customVehicles.filter((v) => v.id !== vehicle.id)],
      selectedVehicleId: vehicle.id,
      selectedModeIndex: Math.min(1, vehicle.modes.length - 1),
    }));
    persistPrefs(get());
    get().pushToast('Veículo cadastrado na Garagem', vehicle.name, 'emerald');
  },

  async deleteCustomVehicle(id) {
    await indexedDbStorage.deleteCustomVehicle(id);
    set((s) => {
      const remaining = s.customVehicles.filter((v) => v.id !== id);
      const selectedVehicleId = s.selectedVehicleId === id ? PRESET_VEHICLES[0].id : s.selectedVehicleId;
      return { customVehicles: remaining, selectedVehicleId };
    });
    persistPrefs(get());
  },

  setOrigin(place, autoPlan = true) {
    set({ origin: place });
    if (place && autoPlan && get().destination) {
      void get().recalculateRoute();
    }
  },

  async setDestination(place, autoPlan = true) {
    set({ destination: place });
    if (place && autoPlan) {
      if (!get().origin) {
        set({ mode: 'preview', isRouting: true });
        let resolvedOrigin = get().currentLocationPlace;
        if (!resolvedOrigin) {
          const cachedGps = get().nav.currentPos;
          if (cachedGps) {
            resolvedOrigin = {
              id: 'gps-current',
              name: 'Minha localização atual',
              subtitle: `${cachedGps[1].toFixed(4)}, ${cachedGps[0].toFixed(4)}`,
              coords: cachedGps,
              source: 'gps',
            };
          } else {
            resolvedOrigin = await get().locateCurrentPosition({ silent: true, flyToUser: false });
          }
        }

        set({
          origin:
            resolvedOrigin ?? {
              id: 'default-bsb-origin',
              name: 'Centro de Brasília (GPS indisponível)',
              subtitle: 'Toque no Ponto A para definir sua partida',
              coords: BRAND.defaultCenter,
              source: 'curated',
            },
        });
      }
      await get().recalculateRoute();
    }
  },

  swapOriginDest() {
    const { origin, destination, viaPoints } = get();
    set({
      origin: destination,
      destination: origin,
      viaPoints: [...viaPoints].reverse(),
    });
    if (origin && destination) {
      void get().recalculateRoute();
    }
  },

  setMapPickTarget(target) {
    set({ mapPickTarget: target });
  },

  async handleMapClick(coords) {
    const target = get().mapPickTarget;
    if (!target) {
      if (get().isEditingWaypoints && get().candidates.length > 0) {
        await get().addViaPoint(coords);
      }
      return;
    }

    if (target === 'hazard') {
      set({ mapPickTarget: null, pendingHazardCoords: coords, hazardPickerOpen: true });
      return;
    }

    if (target === 'via') {
      set({ mapPickTarget: null });
      await get().addViaPoint(coords);
      return;
    }

    const place = await reverseGeocode(coords);
    set({ mapPickTarget: null });
    if (target === 'origin') {
      set({ origin: place });
      if (get().destination) await get().recalculateRoute();
    } else if (target === 'dest') {
      await get().setDestination(place, true);
    } else if (target === 'save_place' || target === 'save_home' || target === 'save_work') {
      const cat: SavedPlaceCategory =
        target === 'save_home' ? 'home' : target === 'save_work' ? 'work' : 'favorite';
      set({ pendingSavePlace: { place, defaultCategory: cat } });
    }
  },

  async openMapContextPin(coords) {
    const cleanCoords: LngLat = [+coords[0].toFixed(6), +coords[1].toFixed(6)];
    set({ mapContextPin: { coords: cleanCoords, place: null, loading: true } });
    const place = await reverseGeocode(cleanCoords);
    // Only update if user hasn't dismissed or opened another pin in the meantime
    const current = get().mapContextPin;
    if (
      current &&
      current.coords[0] === cleanCoords[0] &&
      current.coords[1] === cleanCoords[1]
    ) {
      set({ mapContextPin: { coords: cleanCoords, place, loading: false } });
    }
  },

  closeMapContextPin() {
    set({ mapContextPin: null });
  },

  async recalculateRoute(customWaypoints) {
    const { origin, destination, viaPoints } = get();
    const waypoints: LngLat[] =
      customWaypoints ??
      (origin && destination ? [origin.coords, ...viaPoints, destination.coords] : []);
    if (waypoints.length < 2) return;

    set({ isRouting: true, mode: 'preview' });
    const candidates = await planMultiProfileRoutes(waypoints, origin?.name, destination?.name);
    set((s) => ({
      isRouting: false,
      candidates,
      selectedCandidateIdx: 0,
      fitBoundsNonce: s.fitBoundsNonce + 1,
      nav: { ...s.nav, reversed: false },
    }));
  },

  selectCandidate(idx) {
    set({ selectedCandidateIdx: idx, hoverCoordIndex: null });
  },

  toggleEditWaypoints() {
    set((s) => ({ isEditingWaypoints: !s.isEditingWaypoints, mapPickTarget: null }));
  },

  async updateWaypoint(index, coords) {
    const cand = get().candidates[get().selectedCandidateIdx];
    if (!cand) return;
    const nextWaypoints = [...cand.waypoints];
    nextWaypoints[index] = coords;
    const newVia = nextWaypoints.slice(1, -1);

    if (index === 0) {
      const rev = await reverseGeocode(coords);
      set({ origin: rev, viaPoints: newVia });
    } else if (index === nextWaypoints.length - 1) {
      const rev = await reverseGeocode(coords);
      set({ destination: rev, viaPoints: newVia });
    } else {
      set({ viaPoints: newVia });
    }
    await get().recalculateRoute(nextWaypoints);
  },

  async addViaPoint(coords) {
    const cand = get().candidates[get().selectedCandidateIdx];
    if (!cand || cand.waypoints.length < 2) return;
    const nextVia = [...cand.waypoints.slice(1, -1), coords];
    const nextWaypoints: LngLat[] = [cand.waypoints[0], ...nextVia, cand.waypoints[cand.waypoints.length - 1]];
    set({ viaPoints: nextVia });
    await get().recalculateRoute(nextWaypoints);
    get().pushToast('Ponto intermediário adicionado', 'Arraste os pinos no mapa para ajustar o traçado.', 'emerald');
  },

  async removeViaPoint(viaIdx) {
    const cand = get().candidates[get().selectedCandidateIdx];
    if (!cand) return;
    const nextVia = cand.waypoints.slice(1, -1).filter((_, i) => i !== viaIdx);
    const nextWaypoints: LngLat[] = [cand.waypoints[0], ...nextVia, cand.waypoints[cand.waypoints.length - 1]];
    set({ viaPoints: nextVia });
    await get().recalculateRoute(nextWaypoints);
  },

  clearActiveRoute() {
    set({
      mode: 'explore',
      origin: null,
      destination: null,
      viaPoints: [],
      candidates: [],
      selectedCandidateIdx: 0,
      isEditingWaypoints: false,
      mapPickTarget: null,
      hoverCoordIndex: null,
    });
  },

  loadSavedRoute(route) {
    const cand = savedRouteToCandidate(route);
    const first = cand.waypoints[0];
    const last = cand.waypoints[cand.waypoints.length - 1];
    set((s) => ({
      mode: 'preview',
      isEditingWaypoints: false,
      origin: {
        id: `orig-${route.id}`,
        name: route.originName || 'Ponto de Partida',
        subtitle: route.city,
        coords: first,
        source: 'curated',
      },
      destination: {
        id: `dest-${route.id}`,
        name: route.destName || route.name,
        subtitle: route.city,
        coords: last,
        source: 'curated',
      },
      viaPoints: cand.waypoints.slice(1, -1),
      candidates: [cand],
      selectedCandidateIdx: 0,
      fitBoundsNonce: s.fitBoundsNonce + 1,
      nav: { ...s.nav, reversed: false },
    }));
  },

  async saveCurrentRoute(customName) {
    const cand = get().candidates[get().selectedCandidateIdx];
    if (!cand) return;
    const now = new Date().toISOString();
    const defaultName =
      customName?.trim() ||
      (cand.originName && cand.destName
        ? `${cand.originName.split('/')[0].trim()} → ${cand.destName.split('/')[0].trim()}`
        : cand.title);
    const route: SavedRoute = {
      id: `saved-${Date.now()}`,
      name: defaultName,
      description: cand.subtitle,
      tag: `Salva • ${cand.surfaces.safetyScore}% segura`,
      createdAt: now,
      updatedAt: now,
      isFavorite: true,
      difficulty:
        cand.elevation.ascentM > 220 || cand.distanceKm > 25
          ? 'Desafiador'
          : cand.distanceKm > 10
            ? 'Moderado'
            : 'Fácil',
      city: 'Brasil',
      profile: cand.profile,
      coords: cand.coords,
      waypoints: cand.waypoints,
      distanceKm: cand.distanceKm,
      ascentM: cand.elevation.ascentM,
      descentM: cand.elevation.descentM,
      safetyScore: cand.surfaces.safetyScore,
      originName: cand.originName,
      destName: cand.destName,
    };
    await indexedDbStorage.saveRoute(route);
    set((s) => ({ savedRoutes: [route, ...s.savedRoutes] }));
    get().pushToast('Rota salva no dispositivo', route.name, 'emerald');
  },

  async renameSavedRoute(id, newName) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const route = get().savedRoutes.find((r) => r.id === id);
    if (!route) return;
    const updated: SavedRoute = { ...route, name: trimmed, updatedAt: new Date().toISOString() };
    await indexedDbStorage.saveRoute(updated);
    set((s) => ({
      savedRoutes: s.savedRoutes.map((r) => (r.id === id ? updated : r)),
    }));
    get().pushToast('Rota renomeada', trimmed, 'emerald');
  },

  async deleteSavedRoute(id) {
    await indexedDbStorage.deleteRoute(id);
    set((s) => ({ savedRoutes: s.savedRoutes.filter((r) => r.id !== id) }));
    get().pushToast('Rota removida', undefined, 'slate');
  },

  async toggleFavoriteRoute(id) {
    const route = get().savedRoutes.find((r) => r.id === id);
    if (!route) return;
    const updated: SavedRoute = { ...route, isFavorite: !route.isFavorite, updatedAt: new Date().toISOString() };
    await indexedDbStorage.saveRoute(updated);
    set((s) => ({
      savedRoutes: s.savedRoutes.map((r) => (r.id === id ? updated : r)),
    }));
  },

  async importSavedRoute(route) {
    await indexedDbStorage.saveRoute(route);
    set((s) => ({ savedRoutes: [route, ...s.savedRoutes] }));
    get().loadSavedRoute(route);
    get().pushToast('Rota importada com sucesso!', `${route.name} (${route.distanceKm} km)`, 'emerald');
  },

  openSavePlacePrompt(place, defaultCategory = 'favorite') {
    set({ pendingSavePlace: { place, defaultCategory } });
  },

  closeSavePlacePrompt() {
    set({ pendingSavePlace: null });
  },

  async saveFavoritePlace(place, label, category) {
    const cleanLabel =
      label.trim() ||
      (category === 'home' ? 'Casa' : category === 'work' ? 'Trabalho' : place.name);
    const now = new Date().toISOString();
    const existing = get().savedPlaces;

    // If saving as Home or Work, replace any previous default Home/Work slot cleanly
    let nextPlaces = [...existing];
    if (category === 'home' || category === 'work') {
      const prevSlot = existing.find((p) => p.category === category);
      if (prevSlot) {
        await indexedDbStorage.deletePlace(prevSlot.id);
        nextPlaces = nextPlaces.filter((p) => p.id !== prevSlot.id);
      }
    }

    const newPlace: SavedPlace = {
      id: `place-${category}-${Date.now()}`,
      label: cleanLabel,
      address: place.subtitle || place.name,
      coords: place.coords,
      category,
      createdAt: now,
      updatedAt: now,
    };

    await indexedDbStorage.savePlace(newPlace);
    nextPlaces = [newPlace, ...nextPlaces];

    const slotPlace: PlaceResult = {
      id: newPlace.id,
      name: newPlace.label,
      subtitle: newPlace.address,
      coords: newPlace.coords,
      source: 'curated',
    };

    set((s) => ({
      savedPlaces: nextPlaces,
      pendingSavePlace: null,
      homePlace: category === 'home' ? slotPlace : s.homePlace,
      workPlace: category === 'work' ? slotPlace : s.workPlace,
    }));
    persistPrefs(get());

    const toastTitle =
      category === 'home'
        ? 'Endereço de Casa salvo!'
        : category === 'work'
          ? 'Endereço de Trabalho salvo!'
          : 'Local salvo em Meus Locais!';
    get().pushToast(toastTitle, cleanLabel, 'emerald');
  },

  async renameSavedPlace(id, newLabel) {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const target = get().savedPlaces.find((p) => p.id === id);
    if (!target) return;
    const updated: SavedPlace = { ...target, label: trimmed, updatedAt: new Date().toISOString() };
    await indexedDbStorage.savePlace(updated);

    const slotPlace: PlaceResult = {
      id: updated.id,
      name: updated.label,
      subtitle: updated.address,
      coords: updated.coords,
      source: 'curated',
    };

    set((s) => ({
      savedPlaces: s.savedPlaces.map((p) => (p.id === id ? updated : p)),
      homePlace: updated.category === 'home' ? slotPlace : s.homePlace,
      workPlace: updated.category === 'work' ? slotPlace : s.workPlace,
    }));
    persistPrefs(get());
    get().pushToast('Local renomeado', trimmed, 'emerald');
  },

  async updateSavedPlaceCategory(id, category) {
    const target = get().savedPlaces.find((p) => p.id === id);
    if (!target) return;
    const now = new Date().toISOString();
    let list = [...get().savedPlaces];

    // Demote any existing Home/Work to favorite so no place is lost
    if (category === 'home' || category === 'work') {
      const prev = list.find((p) => p.category === category && p.id !== id);
      if (prev) {
        const demoted: SavedPlace = { ...prev, category: 'favorite', updatedAt: now };
        await indexedDbStorage.savePlace(demoted);
        list = list.map((p) => (p.id === prev.id ? demoted : p));
      }
    }

    const updated: SavedPlace = { ...target, category, updatedAt: now };
    await indexedDbStorage.savePlace(updated);
    list = list.map((p) => (p.id === id ? updated : p));

    const homeSaved = list.find((p) => p.category === 'home');
    const workSaved = list.find((p) => p.category === 'work');

    set({
      savedPlaces: list,
      homePlace: homeSaved
        ? { id: homeSaved.id, name: homeSaved.label, subtitle: homeSaved.address, coords: homeSaved.coords, source: 'curated' }
        : undefined,
      workPlace: workSaved
        ? { id: workSaved.id, name: workSaved.label, subtitle: workSaved.address, coords: workSaved.coords, source: 'curated' }
        : undefined,
    });
    persistPrefs(get());
    get().pushToast(
      category === 'home' ? 'Definido como Casa' : category === 'work' ? 'Definido como Trabalho' : 'Movido para Favoritos',
      updated.label,
      'emerald'
    );
  },

  async deleteSavedPlace(id) {
    const target = get().savedPlaces.find((p) => p.id === id);
    await indexedDbStorage.deletePlace(id);
    set((s) => ({
      savedPlaces: s.savedPlaces.filter((p) => p.id !== id),
      homePlace: target?.category === 'home' ? undefined : s.homePlace,
      workPlace: target?.category === 'work' ? undefined : s.workPlace,
    }));
    persistPrefs(get());
    get().pushToast('Local removido', target?.label, 'slate');
  },

  setHomeOrWork(slot, place) {
    void get().saveFavoritePlace(place, slot === 'home' ? 'Casa' : 'Trabalho', slot);
  },

  setHoverCoordIndex(idx) {
    set({ hoverCoordIndex: idx });
  },

  requestFitRoute() {
    set((s) => ({ fitBoundsNonce: s.fitBoundsNonce + 1 }));
  },

  flyTo(coords, zoom = 15) {
    set({ flyToTarget: { coords, zoom, nonce: Date.now() } });
  },

  startNavigation(demo = false) {
    const cand = get().candidates[get().selectedCandidateIdx];
    if (!cand) return;
    set((s) => ({
      mode: 'navigate',
      isEditingWaypoints: false,
      mapPickTarget: null,
      nav: {
        ...s.nav,
        isTracking: !demo,
        isDemoMode: demo,
        followUser: true,
        pitch3D: true,
        distanceAlongM: 0,
        offRouteMeters: 0,
        currentPos: demo ? [cand.coords[0][0], cand.coords[0][1]] : s.nav.currentPos,
      },
    }));
  },

  stopNavigation() {
    set((s) => ({
      mode: s.candidates.length > 0 ? 'preview' : 'explore',
      nav: {
        ...s.nav,
        isTracking: false,
        isDemoMode: false,
        isRerouting: false,
        offRouteMeters: 0,
      },
    }));
  },

  updateNavTelemetry(patch) {
    set((s) => ({ nav: { ...s.nav, ...patch } }));
  },

  reverseActiveRoute() {
    const { candidates, selectedCandidateIdx } = get();
    const cand = candidates[selectedCandidateIdx];
    if (!cand) return;
    const revCoords = [...cand.coords].reverse();
    const revWaypoints = [...cand.waypoints].reverse();
    const updated: RouteCandidate = {
      ...cand,
      coords: revCoords,
      waypoints: revWaypoints,
      elevation: computeElevationStats(revCoords),
      crossings: detectArterialCrossings(revCoords),
      maneuvers: extractRouteManeuvers(revCoords),
      originName: cand.destName,
      destName: cand.originName,
    };
    const nextCandidates = [...candidates];
    nextCandidates[selectedCandidateIdx] = updated;
    set((s) => ({
      candidates: nextCandidates,
      nav: { ...s.nav, reversed: !s.nav.reversed, distanceAlongM: 0 },
    }));
    get().pushToast('Sentido invertido', 'Agora navegando no trajeto de volta.', 'slate');
  },

  async triggerOffRouteReroute(fromPos) {
    const { nav, candidates, selectedCandidateIdx } = get();
    const active = candidates[selectedCandidateIdx];
    if (!active || nav.isRerouting) return;
    const destCoord = active.waypoints[active.waypoints.length - 1];
    set((s) => ({ nav: { ...s.nav, isRerouting: true } }));
    get().pushToast('Recalculando rota segura...', 'Buscando melhor ciclovia a partir da sua posição.', 'amber');

    const fresh = await planMultiProfileRoutes([fromPos, destCoord], 'Posição Atual', active.destName);
    const chosen = fresh.find((r) => r.profile === active.profile) ?? fresh[0];
    if (chosen) {
      const nextList = [...candidates];
      nextList[selectedCandidateIdx] = chosen;
      set((s) => ({
        candidates: nextList,
        nav: { ...s.nav, isRerouting: false, offRouteMeters: 0, distanceAlongM: 0 },
      }));
      get().pushToast('Rota recalculada!', `${chosen.distanceKm} km • ${chosen.surfaces.safetyScore}% segura`, 'emerald');
    } else {
      set((s) => ({ nav: { ...s.nav, isRerouting: false } }));
    }
  },

  openHazardReporter(coords) {
    const pos = coords ?? get().nav.currentPos ?? BRAND.defaultCenter;
    set({ pendingHazardCoords: pos, hazardPickerOpen: true });
  },

  async submitHazard(kind, title, note) {
    const coords = get().pendingHazardCoords ?? get().nav.currentPos ?? BRAND.defaultCenter;
    const report: HazardReport = {
      id: `hazard-${Date.now()}`,
      kind,
      title,
      note: note?.trim() || undefined,
      coords,
      createdAt: new Date().toISOString(),
      confirmations: 1,
    };
    await indexedDbStorage.saveHazard(report);
    set((s) => ({
      hazards: [report, ...s.hazards],
      hazardPickerOpen: false,
      pendingHazardCoords: null,
      showHazards: true,
    }));
    get().pushToast('Alerta registrado no mapa!', `${title} (salvo localmente; pronto para sync Fase 2)`, 'amber');
  },

  async confirmHazard(id) {
    const item = get().hazards.find((h) => h.id === id);
    if (!item) return;
    const updated = { ...item, confirmations: item.confirmations + 1 };
    await indexedDbStorage.saveHazard(updated);
    set((s) => ({ hazards: s.hazards.map((h) => (h.id === id ? updated : h)) }));
  },

  async deleteHazard(id) {
    await indexedDbStorage.deleteHazard(id);
    set((s) => ({ hazards: s.hazards.filter((h) => h.id !== id) }));
  },

  setGarageOpen: (open) => set({ garageOpen: open }),
  setCompareOpen: (open) => set({ compareOpen: open }),
  setMenuOpen: (open) => set({ menuOpen: open }),
  setHazardPickerOpen: (open) => set({ hazardPickerOpen: open }),

  pushToast(title, body, tone = 'slate') {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, title, body, tone }] }));
    setTimeout(() => {
      get().dismissToast(id);
    }, 4200);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
