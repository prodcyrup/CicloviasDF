import { DF_ARTERIAL_CORRIDORS } from '../data/arterialCrossings';
import type {
  Coord3D,
  CrossingWarning,
  ElevationStats,
  LngLat,
  SurfaceBreakdown,
} from '../types';

const R_EARTH = 6371000;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: LngLat | Coord3D, b: LngLat | Coord3D): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R_EARTH * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function computePathDistanceKm(coords: Coord3D[] | LngLat[]): number {
  if (coords.length < 2) return 0;
  let meters = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    meters += haversineMeters(coords[i], coords[i + 1]);
  }
  return +(meters / 1000).toFixed(2);
}

export function buildCumulativeDistances(coords: Coord3D[] | LngLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(coords[i - 1], coords[i]));
  }
  return cum;
}

export function computeBearingDeg(a: LngLat | Coord3D, b: LngLat | Coord3D): number {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLng = toRad(b[0] - a[0]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function normalizeAngleDiff(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d < -180) d += 360;
  return d;
}

export function interpolateAlongRoute(
  coords: Coord3D[],
  cumDist: number[],
  targetMeters: number
): { coord: LngLat; bearing: number; coordIndex: number } {
  if (coords.length === 0) return { coord: [-47.8825, -15.7912], bearing: 0, coordIndex: 0 };
  if (coords.length === 1 || targetMeters <= 0) {
    const bearing = coords.length > 1 ? computeBearingDeg(coords[0], coords[1]) : 0;
    return { coord: [coords[0][0], coords[0][1]], bearing, coordIndex: 0 };
  }
  const total = cumDist[cumDist.length - 1] || 1;
  if (targetMeters >= total) {
    const last = coords.length - 1;
    return {
      coord: [coords[last][0], coords[last][1]],
      bearing: computeBearingDeg(coords[last - 1], coords[last]),
      coordIndex: last,
    };
  }

  let lo = 0;
  let hi = cumDist.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumDist[mid] <= targetMeters) lo = mid;
    else hi = mid;
  }

  const segLen = Math.max(0.01, cumDist[lo + 1] - cumDist[lo]);
  const t = Math.max(0, Math.min(1, (targetMeters - cumDist[lo]) / segLen));
  const a = coords[lo];
  const b = coords[lo + 1];
  return {
    coord: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    bearing: computeBearingDeg(a, b),
    coordIndex: lo,
  };
}

export function projectPointOntoRoute(
  point: LngLat,
  coords: Coord3D[],
  cumDist: number[]
): {
  snapped: LngLat;
  distanceToRouteM: number;
  distanceAlongM: number;
  segmentIndex: number;
  segmentBearing: number;
} {
  let bestDist = Infinity;
  let bestSnapped: LngLat = [coords[0][0], coords[0][1]];
  let bestAlong = 0;
  let bestIdx = 0;

  const cosLat = Math.cos(toRad(point[1]));

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ax = a[0] * cosLat;
    const ay = a[1];
    const bx = b[0] * cosLat;
    const by = b[1];
    const px = point[0] * cosLat;
    const py = point[1];

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 1e-16) {
      t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    }
    const cand: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = haversineMeters(point, cand);
    if (d < bestDist) {
      bestDist = d;
      bestSnapped = cand;
      bestIdx = i;
      const segM = cumDist[i + 1] - cumDist[i];
      bestAlong = cumDist[i] + segM * t;
    }
  }

  return {
    snapped: bestSnapped,
    distanceToRouteM: bestDist,
    distanceAlongM: bestAlong,
    segmentIndex: bestIdx,
    segmentBearing:
      bestIdx < coords.length - 1 ? computeBearingDeg(coords[bestIdx], coords[bestIdx + 1]) : 0,
  };
}

function segmentIntersection(a: LngLat | Coord3D, b: LngLat | Coord3D, c: LngLat, d: LngLat): LngLat | null {
  const rLng = b[0] - a[0];
  const rLat = b[1] - a[1];
  const sLng = d[0] - c[0];
  const sLat = d[1] - c[1];
  const denom = rLng * sLat - rLat * sLng;
  if (Math.abs(denom) < 1e-12) return null;

  const qpLng = c[0] - a[0];
  const qpLat = c[1] - a[1];
  const t = (qpLng * sLat - qpLat * sLng) / denom;
  const u = (qpLng * rLat - qpLat * rLng) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return [+(a[0] + t * rLng).toFixed(6), +(a[1] + t * rLat).toFixed(6)];
  }
  return null;
}

export function detectArterialCrossings(coords: Coord3D[]): CrossingWarning[] {
  if (coords.length < 2) return [];
  const cum = buildCumulativeDistances(coords);
  const totalDistM = cum[cum.length - 1] || 0;
  const warnings: CrossingWarning[] = [];

  for (const via of DF_ARTERIAL_CORRIDORS) {
    for (let i = 0; i < coords.length - 1; i++) {
      const rA = coords[i];
      const rB = coords[i + 1];
      const rBearing = computeBearingDeg(rA, rB);

      for (let j = 0; j < via.coords.length - 1; j++) {
        const vA = via.coords[j];
        const vB = via.coords[j + 1];
        const hit = segmentIntersection(rA, rB, vA, vB);
        if (!hit) continue;

        const vBearing = computeBearingDeg(vA, vB);
        const rawDiff = Math.abs(normalizeAngleDiff(rBearing - vBearing));
        const crossingAngle = rawDiff > 90 ? 180 - rawDiff : rawDiff;
        if (crossingAngle < 35) continue;

        // Verify the macro ~90m route chord around the intersection actually traverses the corridor
        const exactDistM = cum[i] + haversineMeters(rA, hit);
        const beforeCoord = interpolateAlongRoute(coords, cum, Math.max(0, exactDistM - 45)).coord;
        const afterCoord = interpolateAlongRoute(coords, cum, Math.min(totalDistM, exactDistM + 45)).coord;
        const macroBearing = computeBearingDeg(beforeCoord, afterCoord);
        const macroDiff = Math.abs(normalizeAngleDiff(macroBearing - vBearing));
        const macroAngle = macroDiff > 90 ? 180 - macroDiff : macroDiff;
        if (macroAngle < 42) continue;

        // Place visual warning marker ~45m upstream along the route so the rider is alerted BEFORE entering the avenue
        const approachDistM = Math.max(0, exactDistM - 45);
        const dup = warnings.find(
          (w) =>
            w.viaId === via.id &&
            (haversineMeters(w.coords, hit) < 420 || Math.abs((w.distanceAlongM ?? 0) - approachDistM) < 420)
        );
        if (dup) continue;

        const approachCoord = interpolateAlongRoute(coords, cum, approachDistM).coord;

        warnings.push({
          id: `${via.id}-${warnings.length}`,
          viaId: via.id,
          name: via.name,
          shortTag: via.shortTag,
          danger: via.danger,
          delaySec: via.delaySec,
          note: via.note,
          coords: approachCoord,
          angleDeg: Math.round(macroAngle),
          distanceAlongM: Math.round(approachDistM),
        });
      }
    }
  }

  return warnings.sort((a, b) => (a.distanceAlongM ?? 0) - (b.distanceAlongM ?? 0));
}

export function computeElevationStats(coords: Coord3D[]): ElevationStats {
  const hasReal = coords.length > 1 && coords.every((c) => typeof c[2] === 'number' && Number.isFinite(c[2]));
  let elevations: number[];

  if (hasReal) {
    elevations = coords.map((c) => +(c[2] as number).toFixed(1));
  } else {
    // Brasília gentle plateau approximation (1030m - 1140m) when external DEM isn't returned
    elevations = coords.map((c) => {
      const lngFactor = (-47.84 - c[0]) * 950;
      const latFactor = (-15.79 - c[1]) * 260;
      return +(1045 + Math.max(-25, Math.min(115, lngFactor + latFactor))).toFixed(1);
    });
  }

  let ascent = 0;
  let descent = 0;
  let minM = elevations[0] ?? 1060;
  let maxM = elevations[0] ?? 1060;
  let refEle = elevations[0] ?? 1060;

  // Hysteresis accumulation: preserves smooth gentle climbs while filtering <1m GPS oscillation noise
  for (let i = 1; i < elevations.length; i++) {
    const val = elevations[i];
    if (val < minM) minM = val;
    if (val > maxM) maxM = val;
    const diff = val - refEle;
    if (diff >= 1.0) {
      ascent += diff;
      refEle = val;
    } else if (diff <= -1.0) {
      descent += Math.abs(diff);
      refEle = val;
    }
  }

  return {
    elevations,
    ascentM: Math.round(ascent),
    descentM: Math.round(descent),
    minM: Math.round(minM),
    maxM: Math.round(maxM),
    isRealElevation: hasReal,
  };
}

// === Spatial Index for DF CicloMapa Lanes (fast safety & surface scoring) ===
export interface IndexedLane {
  kind: string;
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
  coords: LngLat[];
}

let cachedLaneIndex: IndexedLane[] = [];

export function buildLaneSpatialIndex(geojson: GeoJSON.FeatureCollection): void {
  const out: IndexedLane[] = [];
  for (const f of geojson.features) {
    const kind = (f.properties as { kind?: string } | null)?.kind;
    if (!kind || kind === 'proibido') continue;
    const geom = f.geometry;
    const lines: LngLat[][] =
      geom.type === 'LineString'
        ? [geom.coordinates as LngLat[]]
        : geom.type === 'MultiLineString'
          ? (geom.coordinates as LngLat[][])
          : [];
    for (const line of lines) {
      if (line.length < 2) continue;
      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (const pt of line) {
        if (pt[0] < minLng) minLng = pt[0];
        if (pt[0] > maxLng) maxLng = pt[0];
        if (pt[1] < minLat) minLat = pt[1];
        if (pt[1] > maxLat) maxLat = pt[1];
      }
      out.push({ kind, minLng, maxLng, minLat, maxLat, coords: line });
    }
  }
  cachedLaneIndex = out;
}

function pointToSegmentMeters(pt: LngLat, a: LngLat, b: LngLat): number {
  const cosLat = Math.cos(toRad(pt[1]));
  const ax = a[0] * cosLat;
  const ay = a[1];
  const bx = b[0] * cosLat;
  const by = b[1];
  const px = pt[0] * cosLat;
  const py = pt[1];
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 1e-16 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  return haversineMeters(pt, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
}

export function classifyPointOnBikeNetwork(pt: LngLat, maxMeters = 32): string | null {
  if (cachedLaneIndex.length === 0) return null;
  const pad = 0.0004; // ~44m bbox pad
  let bestKind: string | null = null;
  let bestDist = maxMeters;

  for (let i = 0; i < cachedLaneIndex.length; i++) {
    const lane = cachedLaneIndex[i];
    if (
      pt[0] < lane.minLng - pad ||
      pt[0] > lane.maxLng + pad ||
      pt[1] < lane.minLat - pad ||
      pt[1] > lane.maxLat + pad
    ) {
      continue;
    }
    const pts = lane.coords;
    for (let j = 0; j < pts.length - 1; j++) {
      const d = pointToSegmentMeters(pt, pts[j], pts[j + 1]);
      if (d < bestDist) {
        bestDist = d;
        bestKind = lane.kind;
      }
    }
  }
  return bestKind;
}

export function computeSurfaceBreakdown(
  coords: Coord3D[],
  profileHint: 'safe' | 'balanced' | 'fast' = 'safe'
): SurfaceBreakdown {
  if (coords.length < 2) {
    return { cicloviaPct: 0, ciclofaixaPct: 0, baixaVelPct: 0, trilhaPct: 0, viaComumPct: 100, safetyScore: 50 };
  }

  if (cachedLaneIndex.length > 0) {
    const step = Math.max(1, Math.floor(coords.length / 80));
    const counts: Record<string, number> = {
      ciclovia: 0,
      ciclofaixa: 0,
      baixa_velocidade: 0,
      calcada: 0,
      trilha: 0,
      comum: 0,
    };
    let samples = 0;
    for (let i = 0; i < coords.length; i += step) {
      const kind = classifyPointOnBikeNetwork([coords[i][0], coords[i][1]], 35);
      counts[kind ?? 'comum'] = (counts[kind ?? 'comum'] ?? 0) + 1;
      samples++;
    }
    if (samples > 0 && counts.comum < samples) {
      const cicloviaPct = Math.round(((counts.ciclovia + counts.calcada) / samples) * 100);
      const ciclofaixaPct = Math.round((counts.ciclofaixa / samples) * 100);
      const baixaVelPct = Math.round((counts.baixa_velocidade / samples) * 100);
      const trilhaPct = Math.round((counts.trilha / samples) * 100);
      const viaComumPct = Math.max(0, 100 - cicloviaPct - ciclofaixaPct - baixaVelPct - trilhaPct);
      const safetyScore = Math.min(
        99,
        Math.max(
          28,
          Math.round(cicloviaPct * 1.0 + ciclofaixaPct * 0.85 + baixaVelPct * 0.72 + trilhaPct * 0.65 + viaComumPct * 0.35)
        )
      );
      return { cicloviaPct, ciclofaixaPct, baixaVelPct, trilhaPct, viaComumPct, safetyScore };
    }
  }

  // Fallback estimate outside DF when ORS waytype isn't available
  if (profileHint === 'safe') {
    return { cicloviaPct: 58, ciclofaixaPct: 14, baixaVelPct: 16, trilhaPct: 4, viaComumPct: 8, safetyScore: 84 };
  }
  if (profileHint === 'balanced') {
    return { cicloviaPct: 38, ciclofaixaPct: 18, baixaVelPct: 22, trilhaPct: 2, viaComumPct: 20, safetyScore: 72 };
  }
  return { cicloviaPct: 20, ciclofaixaPct: 12, baixaVelPct: 20, trilhaPct: 0, viaComumPct: 48, safetyScore: 54 };
}

export function formatDistancePtBR(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export function formatDurationPtBR(minutes: number): string {
  const mins = Math.max(1, Math.round(minutes));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}
