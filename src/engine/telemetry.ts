import type {
  RouteCandidate,
  RouteTelemetry,
  VehicleBatteryCalibration,
  VehicleSpec,
  WeatherSnapshot,
} from '../types';
import { buildWeatherSafetyWarning, computeWindVectorEffect } from './weather';

export interface TelemetryOptions {
  weather?: WeatherSnapshot | null;
  routeBearingDeg?: number;
  calibration?: VehicleBatteryCalibration | null;
}

const MIN_CALIBRATION_MULT = 0.55;
const MAX_CALIBRATION_MULT = 1.45;

/**
 * Calibrated ecomobility telemetry engine:
 * - Preserves real-world JET 20 km/h Brasília calibration (~28 min on 7.91 km official route)
 * - Incorporates rider weight, active ride mode, elevation ascent penalty, arterial delays,
 *   live Open-Meteo headwind/tailwind physics, and learned real-world per-vehicle battery efficiency
 * - Generates vehicle-specific surface/wheel comfort and weather advisories
 */
export function computeRouteTelemetry(
  route: Pick<RouteCandidate, 'distanceKm' | 'elevation' | 'crossings' | 'surfaces'>,
  vehicle: VehicleSpec,
  modeIndex: number,
  riderWeightKg: number,
  isRoundTrip = false,
  options?: TelemetryOptions
): RouteTelemetry {
  const mode = vehicle.modes[modeIndex] ?? vehicle.modes[1] ?? vehicle.modes[0];
  const cruiseSpeed = mode?.topSpeed ?? 20;
  const distanceKm = Math.max(0.15, route.distanceKm);

  const totalDelaySec = route.crossings.reduce((acc, c) => acc + c.delaySec, 0);
  const delayMin = totalDelaySec / 60;

  // Optional live wind vector adjustment
  const wind = options?.weather
    ? computeWindVectorEffect(options.routeBearingDeg, options.weather, isRoundTrip)
    : null;
  const weatherWarning = options?.weather
    ? buildWeatherSafetyWarning(options.weather, vehicle)
    : null;

  // Urban ciclovia cruise efficiency (curves, starts, stops) + slight climb slowdown + wind vector
  const climbGradeRatio = route.elevation.ascentM / Math.max(1000, distanceKm * 1000);
  const climbSpeedPenalty = vehicle.isElectric
    ? Math.min(0.12, climbGradeRatio * (vehicle.powerWatts >= 500 ? 1.4 : 2.5))
    : Math.min(0.24, climbGradeRatio * 5.2);

  const windSpeedMult = wind?.speedMultiplier ?? 1;
  const effectiveMovingSpeed = Math.max(
    5,
    cruiseSpeed * 0.955 * (1 - climbSpeedPenalty) * windSpeedMult
  );
  const movingMinOneWay = (distanceKm / effectiveMovingSpeed) * 60;
  const oneWayExactMin = movingMinOneWay + delayMin;
  const oneWayMin = Math.max(1, Math.round(oneWayExactMin));
  const roundTripMin = oneWayMin * 2;
  const effectiveAvgSpeed = +(distanceKm / Math.max(0.01, oneWayExactMin / 60)).toFixed(1);

  const safeWeightKg = Math.max(
    30,
    Math.min(180, Number.isFinite(riderWeightKg) ? riderWeightKg : 75)
  );
  const tripDistanceKm = +(isRoundTrip ? distanceKm * 2 : distanceKm).toFixed(2);
  const tripAscentM = isRoundTrip
    ? route.elevation.ascentM + route.elevation.descentM
    : route.elevation.ascentM;

  // Electric range & battery burn model (incorporating wind & real-world learned calibration)
  let realRangeKm = 0;
  let batteryUsedPct = 0;
  let batteryLeftPct = 100;
  let calibrationApplied = false;
  let calibrationMultiplier = 1;

  if (vehicle.isElectric && vehicle.nominalRangeKm > 0) {
    const weightDelta = safeWeightKg - 75;
    const weightFactor = Math.max(0.68, Math.min(1.14, 1 - (weightDelta / 10) * 0.045));
    const avgAscentPerKm = tripAscentM / Math.max(1, tripDistanceKm);
    const climbPenaltyFactor = Math.max(0.75, 1 - (avgAscentPerKm / 100) * 0.36);
    const windRangeMult = wind?.rangeMultiplier ?? 1;

    if (
      options?.calibration &&
      options.calibration.sampleCount > 0 &&
      Number.isFinite(options.calibration.efficiencyMultiplier)
    ) {
      calibrationMultiplier = Math.max(
        MIN_CALIBRATION_MULT,
        Math.min(MAX_CALIBRATION_MULT, options.calibration.efficiencyMultiplier)
      );
      calibrationApplied = true;
    }

    realRangeKm = +(
      vehicle.nominalRangeKm *
      (mode?.rangeMult ?? 1) *
      weightFactor *
      climbPenaltyFactor *
      windRangeMult *
      calibrationMultiplier
    ).toFixed(1);
    batteryUsedPct = Math.min(100, Math.round((tripDistanceKm / Math.max(1, realRangeKm)) * 100));
    batteryLeftPct = Math.max(0, 100 - batteryUsedPct);
  }

  // Calories (bikes burn ~30-42 kcal/km; e-bikes assisted ~10-14 kcal/km; scooters ~3 kcal/km)
  const kcalPerKm = !vehicle.isElectric
    ? 34 * (safeWeightKg / 70)
    : vehicle.category === 'ebike'
      ? 12 * (safeWeightKg / 70)
      : 3;
  const caloriesKcal = Math.round(
    tripDistanceKm * kcalPerKm + tripAscentM * (vehicle.isElectric ? 0.15 : 0.65)
  );

  // CO2 avoided vs average urban car (~0.175 kg CO2/km)
  const co2SavedKg = +(tripDistanceKm * 0.175).toFixed(2);

  // Critical range alerts always take priority over comfort advisories
  let comfortWarning: string | null = null;
  if (vehicle.isElectric && realRangeKm > 0 && tripDistanceKm > realRangeKm) {
    comfortWarning = `Distância (${tripDistanceKm.toFixed(1).replace('.', ',')} km) excede a autonomia real estimada (${realRangeKm} km). Use o modo Eco ou planeje recarga.`;
  } else if (vehicle.isElectric && batteryLeftPct <= 20) {
    comfortWarning = `Bateria crítica estimada (${batteryLeftPct}% restante). Considere o modo Eco ou carregar antes da volta.`;
  } else if (
    vehicle.wheelInches <= 9 &&
    (route.surfaces.trilhaPct > 5 || vehicle.suspensionLevel === 'nenhuma')
  ) {
    comfortWarning = `${vehicle.wheelLabel}: reduza a velocidade em raízes, trechos irregulares ou trilhas (${route.surfaces.trilhaPct}%).`;
  } else if (vehicle.category === 'bike_speed' && route.surfaces.trilhaPct > 6) {
    comfortWarning = `Rota contém ${route.surfaces.trilhaPct}% de trilha/piso irregular — atenção com pneus finos Speed.`;
  }

  return {
    distanceKm,
    tripDistanceKm,
    oneWayMin,
    roundTripMin,
    movingMinOneWay,
    delayMin,
    effectiveAvgSpeed,
    realRangeKm,
    batteryUsedPct,
    batteryLeftPct,
    caloriesKcal,
    co2SavedKg,
    comfortWarning,
    windEffectLabel: wind?.label ?? null,
    weatherWarning,
    calibrationApplied,
    calibrationMultiplier: calibrationApplied ? calibrationMultiplier : undefined,
  };
}

/**
 * Learns a smooth rolling per-vehicle real-world battery efficiency multiplier
 * from a rider's post-ride "Bateria inicial -> final (%)" report.
 *
 * - If actual battery used > nominal estimate, multiplier decreases (< 1.0), reducing optimistic range.
 * - If actual battery used < nominal estimate, multiplier increases (> 1.0), rewarding efficient riding.
 * - Rejects noisy micro-trips (< 0.5 km or < 3% actual/estimated drain).
 */
export function computeUpdatedBatteryCalibration(params: {
  vehicleId: string;
  previous?: VehicleBatteryCalibration | null;
  distanceKm: number;
  actualBatteryUsedPct: number;
  nominalEstimatedBatteryUsedPct: number;
  nowIso?: string;
}): VehicleBatteryCalibration | null {
  const {
    vehicleId,
    previous,
    distanceKm,
    actualBatteryUsedPct,
    nominalEstimatedBatteryUsedPct,
    nowIso = new Date().toISOString(),
  } = params;

  if (
    !Number.isFinite(distanceKm) ||
    distanceKm < 0.5 ||
    !Number.isFinite(actualBatteryUsedPct) ||
    actualBatteryUsedPct < 3 ||
    !Number.isFinite(nominalEstimatedBatteryUsedPct) ||
    nominalEstimatedBatteryUsedPct < 3
  ) {
    return null;
  }

  const rawObserved = nominalEstimatedBatteryUsedPct / actualBatteryUsedPct;
  const clampedObserved = Math.max(MIN_CALIBRATION_MULT, Math.min(MAX_CALIBRATION_MULT, rawObserved));

  const prevMult =
    previous && previous.sampleCount > 0 && Number.isFinite(previous.efficiencyMultiplier)
      ? previous.efficiencyMultiplier
      : 1.0;

  // EMA: first sample moves 65% toward observed real-world ratio; subsequent rides smooth at 35%
  const alpha = previous && previous.sampleCount > 0 ? 0.35 : 0.65;
  const blended = prevMult * (1 - alpha) + clampedObserved * alpha;
  const efficiencyMultiplier = +Math.max(
    MIN_CALIBRATION_MULT,
    Math.min(MAX_CALIBRATION_MULT, blended)
  ).toFixed(3);

  return {
    vehicleId,
    efficiencyMultiplier,
    sampleCount: (previous?.sampleCount ?? 0) + 1,
    lastCalibratedAt: nowIso,
  };
}
