import { describe, expect, it } from 'vitest';
import { DF_ARTERIAL_CORRIDORS } from '../../data/arterialCrossings';
import { OFFICIAL_KOMOOT_DF_COORDS } from '../../data/curatedRoutes';
import {
  buildCumulativeDistances,
  buildLaneSpatialIndex,
  computeBearingDeg,
  computeElevationStats,
  computePathDistanceKm,
  computeSurfaceBreakdown,
  detectArterialCrossings,
  formatDistancePtBR,
  formatDurationPtBR,
  haversineMeters,
  interpolateAlongRoute,
  normalizeAngleDiff,
  projectPointOntoRoute,
} from '../geo';
import type { Coord3D } from '../../types';

describe('geo.ts core spatial math', () => {
  it('computes accurate haversine distance and cumulative path length', () => {
    const a: Coord3D = [-47.8825, -15.7936];
    const b: Coord3D = [-47.8725, -15.7936];
    const dist = haversineMeters(a, b);
    expect(dist).toBeGreaterThan(1050);
    expect(dist).toBeLessThan(1100);

    const cum = buildCumulativeDistances([a, b]);
    expect(cum).toHaveLength(2);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeCloseTo(dist, 3);
    expect(computePathDistanceKm([a, b])).toBeCloseTo(dist / 1000, 2);
  });

  it('computes cardinal bearings and shortest angle diffs cleanly', () => {
    expect(computeBearingDeg([-47.88, -15.8], [-47.88, -15.79])).toBeCloseTo(0, 0);
    expect(computeBearingDeg([-47.88, -15.8], [-47.87, -15.8])).toBeCloseTo(90, 0);
    expect(computeBearingDeg([-47.88, -15.8], [-47.88, -15.81])).toBeCloseTo(180, 0);
    expect(computeBearingDeg([-47.88, -15.8], [-47.89, -15.8])).toBeCloseTo(270, 0);

    expect(normalizeAngleDiff(350 - 10)).toBe(-20);
    expect(normalizeAngleDiff(10 - 350)).toBe(20);
    expect(normalizeAngleDiff(180)).toBe(-180);
  });

  it('interpolates and projects points accurately along a polyline', () => {
    const line: Coord3D[] = [
      [-47.88, -15.8],
      [-47.88, -15.79],
    ];
    const cum = buildCumulativeDistances(line);
    const mid = interpolateAlongRoute(line, cum, cum[1] / 2);
    expect(mid.coord[0]).toBeCloseTo(-47.88, 5);
    expect(mid.coord[1]).toBeCloseTo(-15.795, 4);
    expect(mid.bearing).toBeCloseTo(0, 0);

    const proj = projectPointOntoRoute([-47.8799, -15.795], line, cum);
    expect(proj.distanceToRouteM).toBeLessThan(15);
    expect(proj.distanceAlongM).toBeCloseTo(cum[1] / 2, -1);
  });

  it('formats Portuguese distance and duration strings cleanly', () => {
    expect(formatDistancePtBR(420)).toBe('420 m');
    expect(formatDistancePtBR(1550)).toBe('1,6 km');
    expect(formatDurationPtBR(28)).toBe('28 min');
    expect(formatDurationPtBR(75)).toBe('1h 15min');
    expect(formatDurationPtBR(120)).toBe('2h');
  });
});

describe('geo.ts hysteresis elevation math', () => {
  it('filters <1m GPS oscillation noise while preserving smooth gradual climbs', () => {
    // 10 tiny 0.25m steps = 2.5m real smooth climb (must NOT be dropped!)
    const gentleClimb: Coord3D[] = Array.from({ length: 11 }, (_, i) => [
      -47.88 + i * 0.0002,
      -15.79,
      1050 + i * 0.25,
    ]);
    const stats = computeElevationStats(gentleClimb);
    expect(stats.isRealElevation).toBe(true);
    expect(stats.ascentM).toBeGreaterThanOrEqual(2);
    expect(stats.descentM).toBe(0);

    // Pure ±0.4m jitter around 1060m should yield 0 ascent and 0 descent
    const jitter: Coord3D[] = Array.from({ length: 20 }, (_, i) => [
      -47.88 + i * 0.0002,
      -15.79,
      1060 + (i % 2 === 0 ? 0.35 : -0.35),
    ]);
    const jitterStats = computeElevationStats(jitter);
    expect(jitterStats.ascentM).toBe(0);
    expect(jitterStats.descentM).toBe(0);
  });

  it('computes expected real elevation on the official GPX route', () => {
    const stats = computeElevationStats(OFFICIAL_KOMOOT_DF_COORDS);
    expect(stats.isRealElevation).toBe(true);
    expect(stats.ascentM).toBe(82);
    expect(stats.descentM).toBe(71);
    expect(stats.minM).toBe(1050);
    expect(stats.maxM).toBe(1114);
  });
});

describe('geo.ts DF arterial crossing detection', () => {
  it('detects exact 3 arterial crossings (L2N, EIXÃO N, W3N) on Esplanada -> Asa Norte', () => {
    const warnings = detectArterialCrossings(OFFICIAL_KOMOOT_DF_COORDS);
    expect(warnings.map((w) => w.shortTag)).toEqual(['L2N', 'EIXÃO N', 'W3N']);
    // All 3 should be strictly ordered along the route
    expect((warnings[0].distanceAlongM ?? 0) < (warnings[1].distanceAlongM ?? 0)).toBe(true);
    expect((warnings[1].distanceAlongM ?? 0) < (warnings[2].distanceAlongM ?? 0)).toBe(true);
  });

  it('detects transverse crossings across EVERY single one of the 15 DF arterial corridors and places marker upstream', () => {
    for (const via of DF_ARTERIAL_CORRIDORS) {
      // Pick midpoint of the middle segment and create a 300m perpendicular crossing line
      const midIdx = Math.floor((via.coords.length - 1) / 2);
      const a = via.coords[midIdx];
      const b = via.coords[midIdx + 1];
      const midLng = (a[0] + b[0]) / 2;
      const midLat = (a[1] + b[1]) / 2;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      // Normal vector (~0.002 deg ≈ 220m each side)
      const nx = (-dy / len) * 0.0022;
      const ny = (dx / len) * 0.0022;
      const crossLine: Coord3D[] = [
        [midLng - nx, midLat - ny],
        [midLng, midLat],
        [midLng + nx, midLat + ny],
      ];
      const detected = detectArterialCrossings(crossLine);
      const hit = detected.find((w) => w.viaId === via.id);
      expect(hit, `Expected crossing detection on corridor ${via.id}`).toBeDefined();
      // Upstream offset places marker BEFORE exact midpoint (~240m total -> marker ~195m)
      expect(hit!.distanceAlongM).toBeGreaterThan(100);
      expect(hit!.distanceAlongM).toBeLessThan(230);
    }
  });

  it('does NOT raise false positives when riding parallel along a corridor with slight curb wobble', () => {
    const eixao = DF_ARTERIAL_CORRIDORS.find((c) => c.id === 'eixao-norte')!;
    // Build a route riding parallel ~15m east of Eixão Norte with tiny 5m zig-zags
    const parallelRoute: Coord3D[] = eixao.coords.map((pt, idx) => [
      pt[0] + 0.00018 + (idx % 2 === 0 ? 0.00004 : -0.00004),
      pt[1],
    ]);
    const warnings = detectArterialCrossings(parallelRoute);
    const falseEixao = warnings.filter((w) => w.viaId === 'eixao-norte');
    expect(falseEixao).toHaveLength(0);
  });

  it('scores routes on local bike lanes accurately once spatial index is populated', () => {
    buildLaneSpatialIndex({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { kind: 'ciclovia' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [-47.88, -15.79],
              [-47.88, -15.78],
            ],
          },
        },
      ],
    });

    const onLane: Coord3D[] = [
      [-47.88, -15.79],
      [-47.88, -15.785],
      [-47.88, -15.78],
    ];
    const breakdown = computeSurfaceBreakdown(onLane, 'safe');
    expect(breakdown.cicloviaPct).toBe(100);
    expect(breakdown.safetyScore).toBeGreaterThanOrEqual(95);
  });
});
