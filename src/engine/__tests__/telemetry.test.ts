import { describe, expect, it } from 'vitest';
import { PRESET_VEHICLES } from '../../data/vehicles';
import type { WeatherSnapshot } from '../../types';
import { computeRouteTelemetry, computeUpdatedBatteryCalibration } from '../telemetry';

const sampleRoute = {
  distanceKm: 7.91,
  elevation: {
    elevations: [1050, 1114],
    ascentM: 82,
    descentM: 71,
    minM: 1050,
    maxM: 1114,
    isRealElevation: true,
  },
  crossings: [
    { id: '1', viaId: 'l2-norte', name: 'L2', shortTag: 'L2N', danger: 'alta' as const, delaySec: 55, note: '', coords: [-47.875, -15.783] as [number, number], angleDeg: 89 },
    { id: '2', viaId: 'eixao-norte', name: 'Eixão', shortTag: 'EIXÃO N', danger: 'alta' as const, delaySec: 95, note: '', coords: [-47.88, -15.784] as [number, number], angleDeg: 89 },
    { id: '3', viaId: 'w3-norte', name: 'W3', shortTag: 'W3N', danger: 'alta' as const, delaySec: 60, note: '', coords: [-47.887, -15.783] as [number, number], angleDeg: 67 },
  ],
  surfaces: {
    cicloviaPct: 80,
    ciclofaixaPct: 10,
    baixaVelPct: 5,
    trilhaPct: 0,
    viaComumPct: 5,
    safetyScore: 94,
  },
};

describe('telemetry.ts vehicle & battery model', () => {
  const jet = PRESET_VEHICLES.find((v) => v.id === 'jet-aluguel')!;
  const bike = PRESET_VEHICLES.find((v) => !v.isElectric)!;
  const speedBike = PRESET_VEHICLES.find((v) => v.category === 'bike_speed')!;

  it('preserves real-world JET 20 km/h Brasília calibration (~28–30 min)', () => {
    const t = computeRouteTelemetry(sampleRoute, jet, 1, 75, false);
    expect(t.oneWayMin).toBeGreaterThanOrEqual(27);
    expect(t.oneWayMin).toBeLessThanOrEqual(31);
    expect(t.batteryUsedPct).toBeGreaterThan(15);
    expect(t.batteryLeftPct).toBeLessThan(85);
    expect(t.co2SavedKg).toBeGreaterThan(1.3);
  });

  it('accounts for return-leg climbing on round trips', () => {
    const downhillOut = {
      ...sampleRoute,
      distanceKm: 10,
      elevation: {
        elevations: [1150, 1000],
        ascentM: 0,
        descentM: 150,
        minM: 1000,
        maxM: 1150,
        isRealElevation: true,
      },
    };
    const oneWay = computeRouteTelemetry(downhillOut, bike, 1, 75, false);
    const roundTrip = computeRouteTelemetry(downhillOut, bike, 1, 75, true);
    expect(roundTrip.tripDistanceKm).toBe(20);
    // Round trip climbs the 150m return leg, so calories must exceed 2x flat one-way
    expect(roundTrip.caloriesKcal).toBeGreaterThan(oneWay.caloriesKcal * 2 + 50);
  });

  it('prioritizes critical electric range/battery alerts over wheel comfort notices', () => {
    const smallWheelScooter = PRESET_VEHICLES.find((v) => v.isElectric && v.wheelInches <= 9) ?? jet;
    const veryLongRoughRoute = {
      ...sampleRoute,
      distanceKm: 60,
      surfaces: { ...sampleRoute.surfaces, trilhaPct: 12 },
    };
    const t = computeRouteTelemetry(veryLongRoughRoute, smallWheelScooter, 1, 90, false);
    expect(t.batteryLeftPct).toBe(0);
    expect(t.comfortWarning).toContain('excede a autonomia real');
  });

  it('emits Speed bike trail warning when trilhaPct > 6', () => {
    const trailRoute = {
      ...sampleRoute,
      surfaces: { ...sampleRoute.surfaces, trilhaPct: 15 },
    };
    const t = computeRouteTelemetry(trailRoute, speedBike, 1, 75, false);
    expect(t.comfortWarning).toContain('Speed');
  });

  it('clamps extreme or invalid rider weights safely without NaN', () => {
    const tLow = computeRouteTelemetry(sampleRoute, jet, 1, -20, false);
    const tNaN = computeRouteTelemetry(sampleRoute, jet, 1, Number.NaN, false);
    expect(Number.isFinite(tLow.realRangeKm)).toBe(true);
    expect(Number.isFinite(tNaN.caloriesKcal)).toBe(true);
    expect(tLow.realRangeKm).toBeGreaterThan(20);
  });

  it('returns zero battery drain for non-electric bikes', () => {
    const t = computeRouteTelemetry(sampleRoute, bike, 1, 75, false);
    expect(t.realRangeKm).toBe(0);
    expect(t.batteryUsedPct).toBe(0);
    expect(t.batteryLeftPct).toBe(100);
    expect(t.caloriesKcal).toBeGreaterThan(200);
  });

  it('adjusts ETA and electric range for headwind/tailwind and learned battery calibration', () => {
    const windyNorth: WeatherSnapshot = {
      fetchedAt: '2026-11-21T12:00:00Z',
      coords: [-47.88, -15.79],
      temperatureC: 26,
      apparentTempC: 26,
      humidityPct: 50,
      precipitationMm: 0,
      rainProbabilityPct: 10,
      windSpeedKmh: 22,
      windGustsKmh: 26,
      windDirectionDeg: 0, // blowing from North
      uvIndex: 5,
      weatherCode: 0,
      label: 'Céu limpo',
      icon: 'sun',
      isDay: true,
    };

    const calm = computeRouteTelemetry(sampleRoute, jet, 1, 75, false);
    const headwind = computeRouteTelemetry(sampleRoute, jet, 1, 75, false, {
      weather: windyNorth,
      routeBearingDeg: 0,
    });
    const tailwind = computeRouteTelemetry(sampleRoute, jet, 1, 75, false, {
      weather: windyNorth,
      routeBearingDeg: 180,
    });

    expect(headwind.realRangeKm).toBeLessThan(calm.realRangeKm);
    expect(headwind.oneWayMin).toBeGreaterThanOrEqual(calm.oneWayMin);
    expect(tailwind.realRangeKm).toBeGreaterThan(calm.realRangeKm);

    // Learned calibration: user actually burned 30% instead of nominal 20% -> lower efficiency multiplier
    const cal1 = computeUpdatedBatteryCalibration({
      vehicleId: jet.id,
      distanceKm: 7.91,
      actualBatteryUsedPct: 30,
      nominalEstimatedBatteryUsedPct: 20,
    });
    expect(cal1).not.toBeNull();
    expect(cal1!.efficiencyMultiplier).toBeLessThan(0.85);
    expect(cal1!.sampleCount).toBe(1);

    const calibratedTelemetry = computeRouteTelemetry(sampleRoute, jet, 1, 75, false, {
      calibration: cal1,
    });
    expect(calibratedTelemetry.calibrationApplied).toBe(true);
    expect(calibratedTelemetry.realRangeKm).toBeLessThan(calm.realRangeKm);

    // Micro-trips (< 0.5 km) are ignored so noise doesn't corrupt calibration
    const ignored = computeUpdatedBatteryCalibration({
      vehicleId: jet.id,
      distanceKm: 0.2,
      actualBatteryUsedPct: 5,
      nominalEstimatedBatteryUsedPct: 1,
    });
    expect(ignored).toBeNull();
  });
});
