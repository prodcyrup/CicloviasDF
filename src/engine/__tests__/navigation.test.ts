import { describe, expect, it } from 'vitest';
import { OFFICIAL_KOMOOT_DF_COORDS } from '../../data/curatedRoutes';
import { buildSpokenManeuverPhrase, extractRouteManeuvers, getUpcomingManeuver } from '../navigation';
import type { Coord3D } from '../../types';

describe('navigation.ts turn-by-turn extraction & Portuguese guidance', () => {
  it('extracts start, 90-degree right turn, and arrive steps on an L-shaped route', () => {
    // 200m north, then 200m east -> clear right turn
    const lRoute: Coord3D[] = [
      [-47.88, -15.8],
      [-47.88, -15.799],
      [-47.88, -15.798],
      [-47.879, -15.798],
      [-47.878, -15.798],
    ];
    const steps = extractRouteManeuvers(lRoute);
    expect(steps[0].type).toBe('start');
    expect(steps[steps.length - 1].type).toBe('arrive');
    expect(steps.some((s) => s.type === 'right' && s.instruction === 'Vire à direita')).toBe(true);
  });

  it('extracts left turn and U-turn cleanly', () => {
    // North then West -> left turn
    const leftRoute: Coord3D[] = [
      [-47.88, -15.8],
      [-47.88, -15.7985],
      [-47.8815, -15.7985],
    ];
    const leftSteps = extractRouteManeuvers(leftRoute);
    expect(leftSteps.some((s) => s.type === 'left' && s.instruction === 'Vire à esquerda')).toBe(true);

    // North then South -> U-turn
    const uTurnRoute: Coord3D[] = [
      [-47.88, -15.8],
      [-47.88, -15.7985],
      [-47.88002, -15.8],
    ];
    const uSteps = extractRouteManeuvers(uTurnRoute);
    expect(uSteps.some((s) => s.type === 'uturn')).toBe(true);
  });

  it('extracts reasonable maneuver density on the real 7.9 km Brasília route', () => {
    const steps = extractRouteManeuvers(OFFICIAL_KOMOOT_DF_COORDS);
    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(steps.length).toBeLessThan(35);
    expect(steps[0].type).toBe('start');
    expect(steps[steps.length - 1].type).toBe('arrive');
  });

  it('advances getUpcomingManeuver smoothly along the route', () => {
    const steps = extractRouteManeuvers(OFFICIAL_KOMOOT_DF_COORDS);
    const early = getUpcomingManeuver(steps, 10);
    expect(early.current.index).toBe(1);
    expect(early.distToCurrentM).toBeGreaterThan(0);

    const end = getUpcomingManeuver(steps, 99999);
    expect(end.current.type).toBe('arrive');
    expect(end.distToCurrentM).toBe(0);
  });

  it('builds natural Brazilian Portuguese spoken instructions', () => {
    const turn = {
      index: 1,
      coordIndex: 5,
      distanceAlongM: 500,
      type: 'left' as const,
      instruction: 'Vire à esquerda',
      coords: [-47.88, -15.79] as [number, number],
    };
    expect(buildSpokenManeuverPhrase(turn, 120)).toBe('Em 120 m, vire à esquerda.');
    expect(buildSpokenManeuverPhrase(turn, 20)).toBe('Vire à esquerda agora.');

    const arrive = { ...turn, type: 'arrive' as const, instruction: 'Você chegou ao destino' };
    expect(buildSpokenManeuverPhrase(arrive, 15)).toBe('Você chegou ao seu destino.');
    expect(buildSpokenManeuverPhrase(arrive, 140)).toBe('Em 140 m, você chegará ao destino.');
  });
});
