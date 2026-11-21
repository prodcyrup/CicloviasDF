import type { Coord3D, ManeuverStep, VoiceMode } from '../types';
import {
  buildCumulativeDistances,
  computeBearingDeg,
  formatDistancePtBR,
  normalizeAngleDiff,
} from './geo';

/**
 * Extracts crisp PT-BR turn-by-turn maneuvers directly from any route polyline
 * (works identically for ORS, BRouter, OSRM, GPX imports, and curated routes).
 */
export function extractRouteManeuvers(coords: Coord3D[]): ManeuverStep[] {
  if (coords.length < 2) return [];
  const cum = buildCumulativeDistances(coords);
  const steps: ManeuverStep[] = [
    {
      index: 0,
      coordIndex: 0,
      distanceAlongM: 0,
      type: 'start',
      instruction: 'Inicie seguindo o traçado verde da rota',
      coords: [coords[0][0], coords[0][1]],
    },
  ];

  let lastManeuverM = 0;

  for (let i = 1; i < coords.length - 1; i++) {
    // Look ahead/behind ~25-45m to avoid jitter from tiny curved vertices
    let prevIdx = i - 1;
    while (prevIdx > 0 && cum[i] - cum[prevIdx] < 24) prevIdx--;
    let nextIdx = i + 1;
    while (nextIdx < coords.length - 1 && cum[nextIdx] - cum[i] < 24) nextIdx++;

    const inBearing = computeBearingDeg(coords[prevIdx], coords[i]);
    const outBearing = computeBearingDeg(coords[i], coords[nextIdx]);
    const turn = normalizeAngleDiff(outBearing - inBearing);
    const absTurn = Math.abs(turn);

    if (absTurn >= 34 && cum[i] - lastManeuverM >= 65) {
      let type: ManeuverStep['type'];
      let instruction: string;

      if (absTurn >= 145) {
        type = 'uturn';
        instruction = 'Faça o retorno com atenção';
      } else if (turn > 0) {
        if (absTurn >= 62) {
          type = 'right';
          instruction = 'Vire à direita';
        } else {
          type = 'slight-right';
          instruction = 'Mantenha-se à direita';
        }
      } else {
        if (absTurn >= 62) {
          type = 'left';
          instruction = 'Vire à esquerda';
        } else {
          type = 'slight-left';
          instruction = 'Mantenha-se à esquerda';
        }
      }

      steps.push({
        index: steps.length,
        coordIndex: i,
        distanceAlongM: Math.round(cum[i]),
        type,
        instruction,
        coords: [coords[i][0], coords[i][1]],
      });
      lastManeuverM = cum[i];
    }
  }

  const last = coords.length - 1;
  steps.push({
    index: steps.length,
    coordIndex: last,
    distanceAlongM: Math.round(cum[last]),
    type: 'arrive',
    instruction: 'Você chegou ao destino',
    coords: [coords[last][0], coords[last][1]],
  });

  return steps;
}

export function getUpcomingManeuver(
  maneuvers: ManeuverStep[],
  distanceAlongM: number
): { current: ManeuverStep; next: ManeuverStep | null; distToCurrentM: number } {
  if (maneuvers.length === 0) {
    return {
      current: {
        index: 0,
        coordIndex: 0,
        distanceAlongM: 0,
        type: 'straight',
        instruction: 'Siga em frente pela rota',
        coords: [-47.8825, -15.7912],
      },
      next: null,
      distToCurrentM: 0,
    };
  }

  for (let i = 1; i < maneuvers.length; i++) {
    if (maneuvers[i].distanceAlongM > distanceAlongM - 12) {
      return {
        current: maneuvers[i],
        next: maneuvers[i + 1] ?? null,
        distToCurrentM: Math.max(0, maneuvers[i].distanceAlongM - distanceAlongM),
      };
    }
  }

  const last = maneuvers[maneuvers.length - 1];
  return {
    current: last,
    next: null,
    distToCurrentM: Math.max(0, last.distanceAlongM - distanceAlongM),
  };
}

let sharedAudioCtx: AudioContext | null = null;

export function playSoftNavChime(urgent = false): void {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    const now = sharedAudioCtx.currentTime;
    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(urgent ? 740 : 587.33, now);
    osc.frequency.exponentialRampToValueAtTime(urgent ? 987.77 : 880, now + 0.14);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  } catch {
    // AudioContext blocked before gesture
  }
}

export function announceNavAlert(text: string, mode: VoiceMode, urgent = false): void {
  if (mode === 'mute') return;
  playSoftNavChime(urgent);
  if (mode === 'chime') return;
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'pt-BR';
    utter.rate = 1.05;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  } catch {
    // Ignore speech synthesis errors on unsupported browsers
  }
}

export function buildSpokenManeuverPhrase(step: ManeuverStep, distMeters: number): string {
  if (step.type === 'arrive') {
    return distMeters <= 35 ? 'Você chegou ao seu destino.' : `Em ${formatDistancePtBR(distMeters)}, você chegará ao destino.`;
  }
  if (distMeters <= 30) {
    return `${step.instruction} agora.`;
  }
  return `Em ${formatDistancePtBR(distMeters)}, ${step.instruction.toLowerCase()}.`;
}

// Wake Lock wrapper for handlebar navigation
let wakeLockSentinel: WakeLockSentinel | null = null;

export async function acquireScreenWakeLock(): Promise<boolean> {
  try {
    if ('wakeLock' in navigator && navigator.wakeLock) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      return true;
    }
  } catch {
    // Unsupported or battery saver active
  }
  return false;
}

export async function releaseScreenWakeLock(): Promise<void> {
  try {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch {
    // Ignore
  }
}
