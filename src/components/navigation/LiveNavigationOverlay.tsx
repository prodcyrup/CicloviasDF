import { useEffect, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  BatteryCharging,
  Compass,
  Flag,
  Loader2,
  LocateFixed,
  Maximize2,
  Minimize2,
  Moon,
  RotateCcw,
  Sun,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { BRAND } from '../../config/brand';
import {
  buildCumulativeDistances,
  formatDistancePtBR,
  formatDurationPtBR,
  interpolateAlongRoute,
  normalizeAngleDiff,
  projectPointOntoRoute,
} from '../../engine/geo';
import {
  acquireScreenWakeLock,
  announceNavAlert,
  buildSpokenManeuverPhrase,
  getUpcomingManeuver,
  releaseScreenWakeLock,
} from '../../engine/navigation';
import { computeRouteTelemetry } from '../../engine/telemetry';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useAppStore } from '../../store/useAppStore';
import type { ManeuverStep } from '../../types';

function ManeuverIcon({ type }: { type: ManeuverStep['type'] }) {
  const cls = 'h-8 w-8 text-white';
  switch (type) {
    case 'left':
      return <ArrowLeft className={cls} />;
    case 'right':
      return <ArrowRight className={cls} />;
    case 'slight-left':
      return <ArrowUpLeft className={cls} />;
    case 'slight-right':
      return <ArrowUpRight className={cls} />;
    case 'uturn':
      return <RotateCcw className={cls} />;
    case 'arrive':
      return <Flag className={cls} />;
    default:
      return <ArrowUp className={cls} />;
  }
}

export function LiveNavigationOverlay() {
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  const candidates = useAppStore((s) => s.candidates);
  const selectedCandidateIdx = useAppStore((s) => s.selectedCandidateIdx);
  const nav = useAppStore((s) => s.nav);
  const voiceMode = useAppStore((s) => s.voiceMode);
  const theme = useAppStore((s) => s.theme);
  const getActiveVehicle = useAppStore((s) => s.getActiveVehicle);
  const selectedModeIndex = useAppStore((s) => s.selectedModeIndex);
  const riderWeightKg = useAppStore((s) => s.riderWeightKg);

  const stopNavigation = useAppStore((s) => s.stopNavigation);
  const updateNavTelemetry = useAppStore((s) => s.updateNavTelemetry);
  const cycleVoiceMode = useAppStore((s) => s.cycleVoiceMode);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const openHazardReporter = useAppStore((s) => s.openHazardReporter);
  const triggerOffRouteReroute = useAppStore((s) => s.triggerOffRouteReroute);
  const pushToast = useAppStore((s) => s.pushToast);

  const activeRoute = candidates[selectedCandidateIdx];
  const activeVehicle = getActiveVehicle();
  const activeMode = activeVehicle.modes[selectedModeIndex] ?? activeVehicle.modes[0];

  const cumDist = useMemo(
    () => (activeRoute ? buildCumulativeDistances(activeRoute.coords) : [0]),
    [activeRoute]
  );
  const totalMeters = cumDist[cumDist.length - 1] || 1;

  const lastSpokenKeyRef = useRef('');
  const lastCrossingSpokenRef = useRef('');
  const lastRerouteTsRef = useRef(0);
  const lastCompassTsRef = useRef(0);
  const demoDistRef = useRef(0);

  // Acquire Wake Lock while navigating
  useEffect(() => {
    void acquireScreenWakeLock();
    return () => {
      void releaseScreenWakeLock();
    };
  }, []);

  // Announce navigation start
  useEffect(() => {
    if (!activeRoute) return;
    announceNavAlert(
      `Navegação iniciada. Trajeto de ${activeRoute.distanceKm.toFixed(1).replace('.', ',')} quilômetros.`,
      useAppStore.getState().voiceMode
    );
  }, [activeRoute?.id]);

  // Live GPS Watch + Phone Compass (throttled so 60Hz sensor events never jam mobile 2D/3D camera)
  useEffect(() => {
    if (!nav.isTracking || nav.isDemoMode || !activeRoute) return;

    let watchId: number | null = null;
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
          const proj = projectPointOntoRoute(coords, activeRoute.coords, cumDist);
          const speedKmh =
            typeof pos.coords.speed === 'number' && pos.coords.speed >= 0
              ? Math.round(pos.coords.speed * 3.6)
              : 0;
          const heading =
            typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading) && speedKmh > 3
              ? pos.coords.heading
              : proj.segmentBearing;

          updateNavTelemetry({
            currentPos: proj.distanceToRouteM < 25 ? proj.snapped : coords,
            currentHeading: heading,
            currentSpeedKmh: speedKmh,
            accuracyMeters: Math.round(pos.coords.accuracy || 0),
            distanceAlongM: proj.distanceAlongM,
            offRouteMeters: proj.distanceToRouteM > 38 ? Math.round(proj.distanceToRouteM) : 0,
          });

          // Auto off-route rerouting (> 42m off track, debounced every 14s)
          const now = Date.now();
          if (proj.distanceToRouteM > 42 && now - lastRerouteTsRef.current > 14000) {
            lastRerouteTsRef.current = now;
            announceNavAlert('Fora da rota. Recalculando trajeto seguro.', useAppStore.getState().voiceMode, true);
            void triggerOffRouteReroute(coords);
          }
        },
        (err) => {
          pushToast('Sinal de GPS indisponível', `${err.message}. Você pode usar o modo Testar.`, 'amber');
        },
        { enableHighAccuracy: true, maximumAge: 1500, timeout: 10000 }
      );
    }

    const onOrientation = (ev: DeviceOrientationEvent) => {
      const now = Date.now();
      if (now - lastCompassTsRef.current < 220) return;
      const stNav = useAppStore.getState().nav;
      if (stNav.currentSpeedKmh >= 4) return;

      const webkitHeading = (ev as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      let trueHeading: number | null = null;
      if (typeof webkitHeading === 'number' && Number.isFinite(webkitHeading)) {
        trueHeading = webkitHeading;
      } else if (typeof ev.alpha === 'number' && Number.isFinite(ev.alpha)) {
        trueHeading = (360 - ev.alpha + BRAND.magneticDeclinationDeg + 360) % 360;
      }
      if (
        trueHeading !== null &&
        Math.abs(normalizeAngleDiff(trueHeading - stNav.currentHeading)) >= 3
      ) {
        lastCompassTsRef.current = now;
        updateNavTelemetry({ currentHeading: trueHeading });
      }
    };

    window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener);
    };
  }, [nav.isTracking, nav.isDemoMode, activeRoute, cumDist]);

  // Smooth Demo Navigation Loop
  useEffect(() => {
    if (!nav.isDemoMode || !activeRoute) return;
    demoDistRef.current = nav.distanceAlongM;
    const cruiseKmh = activeMode?.topSpeed ?? 22;
    const speedMps = (cruiseKmh / 3.6) * 2.4; // 2.4x demo playback speed for snappy preview

    const interval = window.setInterval(() => {
      demoDistRef.current += speedMps * 0.35;
      if (demoDistRef.current >= totalMeters) {
        demoDistRef.current = totalMeters;
        const end = interpolateAlongRoute(activeRoute.coords, cumDist, totalMeters);
        updateNavTelemetry({
          currentPos: end.coord,
          currentHeading: end.bearing,
          currentSpeedKmh: 0,
          distanceAlongM: totalMeters,
          isDemoMode: false,
        });
        announceNavAlert('Você chegou ao seu destino!', useAppStore.getState().voiceMode);
        pushToast('Chegada simulada!', 'Você completou o trajeto no modo demonstração.', 'emerald');
        return;
      }
      const snap = interpolateAlongRoute(activeRoute.coords, cumDist, demoDistRef.current);
      updateNavTelemetry({
        currentPos: snap.coord,
        currentHeading: snap.bearing,
        currentSpeedKmh: Math.round(cruiseKmh * (0.94 + Math.random() * 0.08)),
        distanceAlongM: demoDistRef.current,
        offRouteMeters: 0,
      });
    }, 350);

    return () => window.clearInterval(interval);
  }, [nav.isDemoMode, activeRoute, cumDist, totalMeters, activeMode?.topSpeed]);

  // Turn-by-turn & Arterial Crossing Voice Triggers
  const upcoming = useMemo(
    () => (activeRoute ? getUpcomingManeuver(activeRoute.maneuvers, nav.distanceAlongM) : null),
    [activeRoute, nav.distanceAlongM]
  );

  const upcomingCrossing = useMemo(() => {
    if (!activeRoute) return null;
    return (
      activeRoute.crossings.find(
        (c) =>
          typeof c.distanceAlongM === 'number' &&
          c.distanceAlongM > nav.distanceAlongM &&
          c.distanceAlongM - nav.distanceAlongM <= 160
      ) ?? null
    );
  }, [activeRoute, nav.distanceAlongM]);

  useEffect(() => {
    if (!upcoming) return;
    const d = upcoming.distToCurrentM;
    const bucket = d <= 32 ? 'now' : d <= 140 ? 'soon' : null;
    if (!bucket) return;
    const key = `${upcoming.current.index}-${bucket}`;
    if (lastSpokenKeyRef.current === key) return;
    lastSpokenKeyRef.current = key;
    announceNavAlert(buildSpokenManeuverPhrase(upcoming.current, d), voiceMode);
  }, [upcoming, voiceMode]);

  useEffect(() => {
    if (!upcomingCrossing) return;
    if (lastCrossingSpokenRef.current === upcomingCrossing.id) return;
    lastCrossingSpokenRef.current = upcomingCrossing.id;
    announceNavAlert(`Atenção: ${upcomingCrossing.name} à frente. Reduza a velocidade.`, voiceMode, true);
  }, [upcomingCrossing, voiceMode]);

  if (!activeRoute || !upcoming) return null;

  const remainingMeters = Math.max(0, totalMeters - nav.distanceAlongM);
  const progressPct = Math.min(100, Math.round((nav.distanceAlongM / totalMeters) * 100));
  const telemetry = computeRouteTelemetry(
    {
      ...activeRoute,
      distanceKm: Math.max(0.05, remainingMeters / 1000),
    },
    activeVehicle,
    selectedModeIndex,
    riderWeightKg
  );

  const etaDate = new Date(Date.now() + telemetry.oneWayMin * 60000);
  const etaStr = etaDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between p-3 safe-top safe-bottom">
      {/* TOP WAZE-STYLE TURN BANNER */}
      <div className="mx-auto w-full max-w-lg space-y-2">
        <div className="pointer-events-auto overflow-hidden rounded-3xl bg-emerald-950/95 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-xl">
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 shadow-inner">
              <ManeuverIcon type={upcoming.current.type} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-mono-num text-2xl font-extrabold leading-none tracking-tight text-emerald-300">
                {formatDistancePtBR(upcoming.distToCurrentM)}
              </div>
              <div className="mt-1 truncate text-base font-bold text-white">
                {upcoming.current.instruction}
              </div>
              {upcoming.next && (
                <div className="mt-0.5 truncate text-xs font-medium text-emerald-200/80">
                  Depois: {upcoming.next.instruction}
                </div>
              )}
            </div>
            {nav.isDemoMode && (
              <span className="shrink-0 rounded-full bg-amber-400/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-300">
                Demo
              </span>
            )}
          </div>

          {/* Upcoming Arterial Crossing Warning Strip */}
          {upcomingCrossing && (
            <div className="flex items-center gap-2 bg-amber-500 px-4 py-2 text-xs font-extrabold text-slate-950">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {upcomingCrossing.name} em {formatDistancePtBR((upcomingCrossing.distanceAlongM ?? 0) - nav.distanceAlongM)}
              </span>
            </div>
          )}

          {/* Off-Route Auto-Rerouting Banner */}
          {(nav.offRouteMeters > 0 || nav.isRerouting) && (
            <div className="flex items-center justify-between gap-2 bg-rose-600 px-4 py-2 text-xs font-bold text-white">
              <span className="inline-flex items-center gap-1.5">
                {nav.isRerouting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {nav.isRerouting
                  ? 'Recalculando rota segura...'
                  : `Fora da rota (${nav.offRouteMeters}m) — recalculando`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT FLOATING HANDLEBAR CONTROLS */}
      <div className="pointer-events-auto fixed right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
        <button
          type="button"
          onClick={() => updateNavTelemetry({ followUser: true })}
          title="Centralizar no GPS"
          className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg backdrop-blur-xl transition-all ${
            nav.followUser
              ? 'bg-emerald-600 text-white'
              : 'glass-panel text-slate-700 hover:text-emerald-600 dark:text-slate-100'
          }`}
        >
          <LocateFixed className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => updateNavTelemetry({ pitch3D: !nav.pitch3D })}
          title={nav.pitch3D ? 'Modo 3D / Direção' : 'Modo 2D / Norte'}
          className="glass-panel flex h-12 w-12 flex-col items-center justify-center rounded-2xl text-slate-800 shadow-lg dark:text-slate-100"
        >
          <Compass className={`h-4.5 w-4.5 ${nav.pitch3D ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
          <span className="text-[9px] font-extrabold">{nav.pitch3D ? '3D' : '2D'}</span>
        </button>

        <button
          type="button"
          onClick={cycleVoiceMode}
          title="Alternar Voz / Alerta / Mudo"
          className="glass-panel flex h-12 w-12 items-center justify-center rounded-2xl text-slate-800 shadow-lg dark:text-slate-100"
        >
          {voiceMode === 'voice' ? (
            <Volume2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          ) : voiceMode === 'chime' ? (
            <Volume1 className="h-5 w-5 text-amber-500" />
          ) : (
            <VolumeX className="h-5 w-5 text-slate-400" />
          )}
        </button>

        {/* Waze-style Report Hazard Button */}
        <button
          type="button"
          onClick={() => openHazardReporter()}
          title="Reportar perigo na ciclovia"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30 transition-transform hover:scale-105 active:scale-95"
        >
          <AlertTriangle className="h-5.5 w-5.5" />
        </button>

        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          className="glass-panel flex h-12 w-12 items-center justify-center rounded-2xl text-slate-800 shadow-lg dark:text-slate-100"
        >
          {isFullscreen ? <Minimize2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> : <Maximize2 className="h-5 w-5" />}
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          title="Tema Claro / Escuro"
          className="glass-panel flex h-12 w-12 items-center justify-center rounded-2xl text-slate-800 shadow-lg dark:text-slate-100"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-slate-700" />}
        </button>
      </div>

      {/* BOTTOM SPEEDOMETER + WAZE ETA BAR */}
      <div className="mx-auto flex w-full max-w-lg items-end gap-2.5">
        {/* Waze Speedometer Circle */}
        <div className="glass-panel pointer-events-auto flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full shadow-xl">
          <span className="font-mono-num text-xl font-extrabold leading-none text-slate-900 dark:text-white">
            {nav.currentSpeedKmh}
          </span>
          <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            km/h
          </span>
        </div>

        {/* Bottom ETA / Progress / Exit Card */}
        <div className="glass-panel pointer-events-auto flex-1 overflow-hidden rounded-3xl shadow-2xl">
          <div className="h-1.5 w-full bg-slate-200/70 dark:bg-slate-800">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono-num text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
                  {formatDurationPtBR(telemetry.oneWayMin)}
                </span>
                <span className="font-mono-num text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {formatDistancePtBR(remainingMeters)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Chegada {etaStr}</span>
                {activeVehicle.isElectric && (
                  <span className="inline-flex items-center gap-1 font-semibold text-sky-600 dark:text-sky-400">
                    <BatteryCharging className="h-3.5 w-3.5" />
                    {telemetry.batteryLeftPct}% est.
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={stopNavigation}
              className="flex h-11 items-center gap-1.5 rounded-2xl bg-rose-600 px-4 text-sm font-extrabold text-white shadow-md shadow-rose-600/25 transition-colors hover:bg-rose-500"
            >
              <X className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
