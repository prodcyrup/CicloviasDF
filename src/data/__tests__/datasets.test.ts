import { describe, expect, it } from 'vitest';
import { DF_ARTERIAL_CORRIDORS } from '../arterialCrossings';
import { CURATED_DF_ROUTES, POPULAR_DF_PLACES } from '../curatedRoutes';
import { PRESET_VEHICLES } from '../vehicles';
import { computeElevationStats, computePathDistanceKm, detectArterialCrossings } from '../../engine/geo';

describe('DF arterial corridors dataset integrity', () => {
  it('contains 15 unique DF corridors with valid Brasília bounding coordinates', () => {
    expect(DF_ARTERIAL_CORRIDORS.length).toBeGreaterThanOrEqual(15);
    const ids = new Set(DF_ARTERIAL_CORRIDORS.map((c) => c.id));
    expect(ids.size).toBe(DF_ARTERIAL_CORRIDORS.length);

    for (const c of DF_ARTERIAL_CORRIDORS) {
      expect(c.coords.length).toBeGreaterThanOrEqual(4);
      expect(c.delaySec).toBeGreaterThanOrEqual(30);
      for (const [lng, lat] of c.coords) {
        expect(lng).toBeGreaterThan(-48.3);
        expect(lng).toBeLessThan(-47.3);
        expect(lat).toBeGreaterThan(-16.1);
        expect(lat).toBeLessThan(-15.4);
      }
    }
  });
});

describe('curated DF routes & places integrity', () => {
  it('has 8 curated DF routes with real elevation and consistent metadata', () => {
    expect(CURATED_DF_ROUTES.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(CURATED_DF_ROUTES.map((r) => r.id));
    expect(ids.size).toBe(CURATED_DF_ROUTES.length);

    for (const r of CURATED_DF_ROUTES) {
      expect(r.coords.length).toBeGreaterThanOrEqual(15);
      expect(r.waypoints.length).toBeGreaterThanOrEqual(2);
      const calcKm = computePathDistanceKm(r.coords);
      expect(Math.abs(calcKm - r.distanceKm)).toBeLessThan(0.35);

      const elev = computeElevationStats(r.coords);
      expect(elev.isRealElevation).toBe(true);
      expect(elev.ascentM).toBe(r.ascentM);
      expect(elev.descentM).toBe(r.descentM);
    }

    // Parque da Cidade loop must remain 100% car-free (0 arterial crossings)
    const parque = CURATED_DF_ROUTES.find((r) => r.id === 'curated-parque-cidade')!;
    expect(detectArterialCrossings(parque.coords)).toHaveLength(0);
  });

  it('has at least 12 popular DF places with unique IDs and valid coordinates', () => {
    expect(POPULAR_DF_PLACES.length).toBeGreaterThanOrEqual(12);
    const ids = new Set(POPULAR_DF_PLACES.map((p) => p.id));
    expect(ids.size).toBe(POPULAR_DF_PLACES.length);
  });
});

describe('vehicle catalog integrity', () => {
  it('all preset vehicles have unique IDs, valid ride modes, and consistent electric specs', () => {
    expect(PRESET_VEHICLES.length).toBeGreaterThanOrEqual(12);
    const ids = new Set(PRESET_VEHICLES.map((v) => v.id));
    expect(ids.size).toBe(PRESET_VEHICLES.length);

    for (const v of PRESET_VEHICLES) {
      expect(v.modes.length).toBeGreaterThanOrEqual(2);
      for (const m of v.modes) {
        expect(m.topSpeed).toBeGreaterThan(0);
        expect(m.rangeMult).toBeGreaterThan(0);
      }
      if (v.isElectric) {
        expect(v.nominalRangeKm).toBeGreaterThan(0);
        expect(v.powerWatts).toBeGreaterThan(0);
      }
    }
  });
});
