export type LngLat = [number, number]; // [lng, lat]
export type Coord3D = [number, number, number?]; // [lng, lat, elevationMeters?]

export type AppMode = 'explore' | 'plan' | 'preview' | 'navigate';
export type ThemeMode = 'light' | 'dark';
export type MapBasemapMode = 'standard' | 'satellite';
export type RouteProfileId = 'safe' | 'balanced' | 'fast';
export type VoiceMode = 'voice' | 'chime' | 'mute';

export type VehicleCategory =
  | 'patinete'
  | 'ebike'
  | 'compartilhado'
  | 'bike_urbana'
  | 'bike_speed'
  | 'bike_mtb'
  | 'eskate';

export type SuspensionLevel = 'nenhuma' | 'basica' | 'dianteira' | 'dupla';

export interface VehicleMode {
  name: string;
  topSpeed: number; // km/h
  rangeMult: number; // multiplier vs nominalRangeKm
}

export interface VehicleSpec {
  id: string;
  name: string;
  brand?: string;
  category: VehicleCategory;
  categoryLabel: string;
  isElectric: boolean;
  isCustom?: boolean;
  isShared?: boolean;
  powerLabel: string;
  powerWatts: number;
  wheelLabel: string;
  wheelInches: number;
  batteryLabel: string;
  batteryWh: number;
  weightKg: number;
  suspension: string;
  suspensionLevel: SuspensionLevel;
  comfortScore: string;
  nominalRangeKm: number; // 0 for non-electric
  modes: VehicleMode[];
  // Optional Compare & Buy metadata
  price?: number;
  priceLabel?: string;
  pros?: string;
  cons?: string;
  buyUrl?: string;
}

export interface PlaceResult {
  id: string;
  name: string;
  subtitle: string;
  coords: LngLat;
  district?: string;
  city?: string;
  state?: string;
  source: 'photon' | 'curated' | 'gps' | 'map';
}

export interface SurfaceBreakdown {
  cicloviaPct: number;
  ciclofaixaPct: number;
  baixaVelPct: number;
  trilhaPct: number;
  viaComumPct: number;
  safetyScore: number; // 0-100
}

export interface ElevationStats {
  elevations: number[];
  ascentM: number;
  descentM: number;
  minM: number;
  maxM: number;
  isRealElevation: boolean;
}

export interface CrossingWarning {
  id: string;
  viaId: string;
  name: string;
  shortTag: string;
  danger: 'alta' | 'media';
  delaySec: number;
  note: string;
  coords: LngLat;
  angleDeg: number;
  distanceAlongM?: number;
}

export interface ManeuverStep {
  index: number;
  coordIndex: number;
  distanceAlongM: number;
  type: 'start' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'uturn' | 'straight' | 'arrive';
  instruction: string;
  streetName?: string;
  coords: LngLat;
}

export interface RouteCandidate {
  id: string;
  profile: RouteProfileId;
  title: string;
  subtitle: string;
  source: 'ors' | 'brouter' | 'osrm' | 'curated' | 'gpx' | 'custom';
  coords: Coord3D[];
  distanceKm: number;
  elevation: ElevationStats;
  surfaces: SurfaceBreakdown;
  crossings: CrossingWarning[];
  maneuvers: ManeuverStep[];
  waypoints: LngLat[];
  originName?: string;
  destName?: string;
}

export interface SavedRoute {
  id: string;
  name: string;
  description?: string;
  tag: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  isCurated?: boolean;
  difficulty: 'Fácil' | 'Moderado' | 'Desafiador';
  city: string;
  profile: RouteProfileId;
  coords: Coord3D[];
  waypoints: LngLat[];
  distanceKm: number;
  ascentM: number;
  descentM: number;
  safetyScore: number;
  originName?: string;
  destName?: string;
}

export type HazardKind = 'buraco' | 'bloqueio' | 'iluminacao' | 'raizes' | 'cruzamento' | 'agua';

export interface HazardReport {
  id: string;
  kind: HazardKind;
  title: string;
  note?: string;
  coords: LngLat;
  createdAt: string;
  confirmations: number;
}

export interface RouteTelemetry {
  distanceKm: number;
  tripDistanceKm: number;
  oneWayMin: number;
  roundTripMin: number;
  movingMinOneWay: number;
  delayMin: number;
  effectiveAvgSpeed: number;
  realRangeKm: number;
  batteryUsedPct: number;
  batteryLeftPct: number;
  caloriesKcal: number;
  co2SavedKg: number;
  comfortWarning: string | null;
}

export type SavedPlaceCategory = 'home' | 'work' | 'favorite';

export interface SavedPlace {
  id: string;
  label: string;
  address: string;
  coords: LngLat;
  category: SavedPlaceCategory;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  theme: ThemeMode;
  basemap: MapBasemapMode;
  selectedVehicleId: string;
  selectedModeIndex: number;
  riderWeightKg: number;
  voiceMode: VoiceMode;
  showBikeLanes: boolean;
  showPois: boolean;
  showHazards: boolean;
  homePlace?: PlaceResult;
  workPlace?: PlaceResult;
}
