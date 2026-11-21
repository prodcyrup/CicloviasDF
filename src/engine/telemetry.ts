import type { RouteCandidate, RouteTelemetry, VehicleSpec } from '../types';

/**
 * Calibrated ecomobility telemetry engine:
 * - Preserves real-world JET 20 km/h Brasília calibration (~28 min on 7.91 km official route)
 * - Incorporates rider weight, active ride mode, elevation ascent penalty, and arterial delays
 * - Generates vehicle-specific surface/wheel comfort advisories
 */
export function computeRouteTelemetry(
  route: Pick<RouteCandidate, 'distanceKm' | 'elevation' | 'crossings' | 'surfaces'>,
  vehicle: VehicleSpec,
  modeIndex: number,
  riderWeightKg: number,
  isRoundTrip = false
): RouteTelemetry {
  const mode = vehicle.modes[modeIndex] ?? vehicle.modes[1] ?? vehicle.modes[0];
  const cruiseSpeed = mode?.topSpeed ?? 20;
  const distanceKm = Math.max(0.15, route.distanceKm);

  const totalDelaySec = route.crossings.reduce((acc, c) => acc + c.delaySec, 0);
  const delayMin = totalDelaySec / 60;

  // Urban ciclovia cruise efficiency (curves, starts, stops) + slight climb slowdown for lower-power/pedal vehicles
  const climbGradeRatio = route.elevation.ascentM / Math.max(1000, distanceKm * 1000);
  const climbSpeedPenalty = vehicle.isElectric
    ? Math.min(0.12, climbGradeRatio * (vehicle.powerWatts >= 500 ? 1.4 : 2.5))
    : Math.min(0.24, climbGradeRatio * 5.2);

  const effectiveMovingSpeed = Math.max(5, cruiseSpeed * 0.955 * (1 - climbSpeedPenalty));
  const movingMinOneWay = (distanceKm / effectiveMovingSpeed) * 60;
  const oneWayExactMin = movingMinOneWay + delayMin;
  const oneWayMin = Math.max(1, Math.round(oneWayExactMin));
  const roundTripMin = oneWayMin * 2;
  const effectiveAvgSpeed = +(distanceKm / Math.max(0.01, oneWayExactMin / 60)).toFixed(1);

  const tripDistanceKm = +(isRoundTrip ? distanceKm * 2 : distanceKm).toFixed(2);

  // Electric range & battery burn model
  let realRangeKm = 0;
  let batteryUsedPct = 0;
  let batteryLeftPct = 100;

  if (vehicle.isElectric && vehicle.nominalRangeKm > 0) {
    const weightDelta = riderWeightKg - 75;
    const weightFactor = Math.max(0.68, Math.min(1.14, 1 - (weightDelta / 10) * 0.045));
    const climbPenaltyFactor = Math.max(0.8, 1 - (route.elevation.ascentM / 1000) * 0.36);
    realRangeKm = +(
      vehicle.nominalRangeKm *
      (mode?.rangeMult ?? 1) *
      weightFactor *
      climbPenaltyFactor
    ).toFixed(1);
    batteryUsedPct = Math.min(100, Math.round((tripDistanceKm / Math.max(1, realRangeKm)) * 100));
    batteryLeftPct = Math.max(0, 100 - batteryUsedPct);
  }

  // Calories (bikes burn ~30-42 kcal/km; e-bikes assisted ~10-14 kcal/km; scooters ~3 kcal/km)
  const kcalPerKm = !vehicle.isElectric
    ? 34 * (riderWeightKg / 70)
    : vehicle.category === 'ebike'
      ? 12 * (riderWeightKg / 70)
      : 3;
  const caloriesKcal = Math.round(tripDistanceKm * kcalPerKm + route.elevation.ascentM * (vehicle.isElectric ? 0.15 : 0.65));

  // CO2 avoided vs average urban car (~0.175 kg CO2/km)
  const co2SavedKg = +(tripDistanceKm * 0.175).toFixed(2);

  // Comfort & wheel-size warning
  let comfortWarning: string | null = null;
  if (vehicle.wheelInches <= 9 && (route.surfaces.trilhaPct > 5 || vehicle.suspensionLevel === 'nenhuma')) {
    comfortWarning = `${vehicle.wheelLabel}: reduza a velocidade em raízes, trechos irregulares ou trilhas (${route.surfaces.trilhaPct}%).`;
  } else if (vehicle.category === 'bike_speed' && route.surfaces.trilhaPct > 6) {
    comfortWarning = `Rota contém ${route.surfaces.trilhaPct}% de trilha/piso irregular — atenção com pneus finos Speed.`;
  } else if (vehicle.isElectric && batteryLeftPct <= 20) {
    comfortWarning = `Bateria crítica estimada (${batteryLeftPct}% restante). Considere o modo Eco ou carregar antes da volta.`;
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
  };
}
