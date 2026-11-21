import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESET_VEHICLES } from '../../data/vehicles';
import type { WeatherSnapshot } from '../../types';
import {
  buildWeatherSafetyWarning,
  clearWeatherCacheForTests,
  computeWindVectorEffect,
  fetchLiveWeather,
  mapWmoCodePtBr,
} from '../weather';

const baseWeather: WeatherSnapshot = {
  fetchedAt: '2026-11-21T12:00:00Z',
  coords: [-47.8825, -15.7942],
  temperatureC: 27,
  apparentTempC: 28,
  humidityPct: 55,
  precipitationMm: 0,
  rainProbabilityPct: 10,
  windSpeedKmh: 20,
  windGustsKmh: 25,
  windDirectionDeg: 0, // Blowing FROM North
  uvIndex: 6,
  weatherCode: 0,
  label: 'Céu limpo',
  icon: 'sun',
  isDay: true,
};

describe('weather.ts Open-Meteo client, wind physics & safety warnings', () => {
  const scooter = PRESET_VEHICLES.find((v) => v.wheelInches <= 10 && v.isElectric)!;
  const bike = PRESET_VEHICLES.find((v) => v.wheelInches >= 26)!;

  beforeEach(() => {
    clearWeatherCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearWeatherCacheForTests();
  });

  it('computes headwind vs tailwind speed and electric range multipliers accurately', () => {
    // Wind blows FROM North (0°). Heading North (0°) => pure headwind.
    const head = computeWindVectorEffect(0, baseWeather, false);
    expect(head.headwindKmh).toBeCloseTo(20, 1);
    expect(head.speedMultiplier).toBeLessThan(0.95);
    expect(head.rangeMultiplier).toBeLessThan(0.9);
    expect(head.label).toContain('Vento contra');

    // Heading South (180°) => pure tailwind.
    const tail = computeWindVectorEffect(180, baseWeather, false);
    expect(tail.headwindKmh).toBeCloseTo(-20, 1);
    expect(tail.speedMultiplier).toBeGreaterThan(1.03);
    expect(tail.rangeMultiplier).toBeGreaterThan(1.05);
    expect(tail.label).toContain('Vento a favor');

    // Heading East (90°) => pure crosswind.
    const cross = computeWindVectorEffect(90, baseWeather, false);
    expect(Math.abs(cross.headwindKmh)).toBeLessThan(0.5);
    expect(cross.crosswindKmh).toBeCloseTo(20, 1);
    expect(cross.label).toContain('Vento lateral');
  });

  it('emits wheel-specific wet ciclovia warnings for scooters and dry-air warnings for Brasília', () => {
    const rainy: WeatherSnapshot = {
      ...baseWeather,
      rainProbabilityPct: 75,
      precipitationMm: 1.8,
      weatherCode: 63,
      label: 'Chuva moderada',
      icon: 'rain',
    };

    const scooterWarn = buildWeatherSafetyWarning(rainy, scooter);
    expect(scooterWarn).toContain('pneus de');
    expect(scooterWarn).toContain('ciclovia molhada');

    const bikeWarn = buildWeatherSafetyWarning(rainy, bike);
    expect(bikeWarn).toContain('Previsão de chuva');

    const dryBsb: WeatherSnapshot = {
      ...baseWeather,
      humidityPct: 18,
      windGustsKmh: 15,
    };
    const dryWarn = buildWeatherSafetyWarning(dryBsb, scooter);
    expect(dryWarn).toContain('Umidade muito baixa (18%)');
  });

  it('maps WMO weather codes to PT-BR labels and caches Open-Meteo responses', async () => {
    expect(mapWmoCodePtBr(95)).toEqual({ label: 'Tempestade', icon: 'storm' });
    expect(mapWmoCodePtBr(2)).toEqual({ label: 'Parcialmente nublado', icon: 'partly_cloudy' });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          current: {
            time: '2026-11-21T14:00',
            temperature_2m: 26.4,
            apparent_temperature: 27.1,
            relative_humidity_2m: 48,
            precipitation: 0,
            weather_code: 1,
            wind_speed_10m: 14.2,
            wind_direction_10m: 90,
            wind_gusts_10m: 22.0,
            is_day: 1,
          },
          hourly: {
            time: ['2026-11-21T13:00', '2026-11-21T14:00'],
            precipitation_probability: [5, 25],
            uv_index: [7.2, 8.4],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const first = await fetchLiveWeather([-47.8825, -15.7942]);
    expect(first?.temperatureC).toBe(26);
    expect(first?.rainProbabilityPct).toBe(25);
    expect(first?.windSpeedKmh).toBe(14);
    expect(first?.label).toBe('Parcialmente nublado');

    // Second call for nearby coordinates hits the 10-minute spatial cache
    const second = await fetchLiveWeather([-47.883, -15.794]);
    expect(second?.temperatureC).toBe(26);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
