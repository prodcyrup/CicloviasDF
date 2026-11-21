import { useRef, useState } from 'react';
import {
  AlertTriangle,
  Bike,
  ChevronDown,
  ChevronUp,
  Layers,
  LocateFixed,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  Satellite,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { BRAND } from '../../config/brand';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useAppStore } from '../../store/useAppStore';
import { RoutePreviewPanel } from '../planner/RoutePreviewPanel';
import { ExplorePanel } from '../search/ExplorePanel';

type MobileSheetSnap = 'peek' | 'half' | 'full';

function getSnapHeightPx(snap: MobileSheetSnap): number {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  if (snap === 'peek') return 112;
  if (snap === 'full') return Math.round(vh * 0.84);
  return Math.round(vh * 0.48);
}

export function AdaptiveShell() {
  const [sheetSnap, setSheetSnap] = useState<MobileSheetSnap>('half');
  const [dragHeightPx, setDragHeightPx] = useState<number | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startY: number;
    startHeight: number;
    lastY: number;
    lastTime: number;
    velocityY: number;
    moved: boolean;
  } | null>(null);

  const mode = useAppStore((s) => s.mode);
  const theme = useAppStore((s) => s.theme);
  const basemap = useAppStore((s) => s.basemap);
  const showBikeLanes = useAppStore((s) => s.showBikeLanes);
  const mapPickTarget = useAppStore((s) => s.mapPickTarget);
  const getActiveVehicle = useAppStore((s) => s.getActiveVehicle);

  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const toggleBasemap = useAppStore((s) => s.toggleBasemap);
  const toggleLayer = useAppStore((s) => s.toggleLayer);
  const setMenuOpen = useAppStore((s) => s.setMenuOpen);
  const setGarageOpen = useAppStore((s) => s.setGarageOpen);
  const setMapPickTarget = useAppStore((s) => s.setMapPickTarget);
  const openHazardReporter = useAppStore((s) => s.openHazardReporter);
  const flyTo = useAppStore((s) => s.flyTo);
  const locateCurrentPosition = useAppStore((s) => s.locateCurrentPosition);

  const activeVehicle = getActiveVehicle();
  const compactVehicleLabel = activeVehicle.name.split(' ')[0];

  const handleLocateMe = async () => {
    const found = await locateCurrentPosition({ silent: false, flyToUser: false });
    if (found) {
      flyTo(found.coords, 15.6);
    } else {
      flyTo(BRAND.defaultCenter, 13.5);
    }
  };

  const pickLabels: Record<string, string> = {
    origin: 'Toque no mapa para definir a origem',
    dest: 'Toque no mapa para escolher o destino',
    via: 'Toque no mapa para adicionar uma parada',
    hazard: 'Toque no mapa onde está o perigo',
  };

  // Finger-responsive pointer drag handlers for the mobile bottom sheet handle
  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const startH = dragHeightPx ?? getSnapHeightPx(sheetSnap);
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeight: startH,
      lastY: e.clientY,
      lastTime: performance.now(),
      velocityY: 0,
      moved: false,
    };
    setDragHeightPx(startH);
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || !d.active || d.pointerId !== e.pointerId) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastTime);
    d.velocityY = (e.clientY - d.lastY) / dt; // px/ms (negative = swiping up)
    d.lastY = e.clientY;
    d.lastTime = now;

    const deltaY = d.startY - e.clientY;
    if (Math.abs(deltaY) > 6) d.moved = true;

    const minH = 92;
    const maxH = Math.round(window.innerHeight * 0.88);
    const nextH = Math.max(minH, Math.min(maxH, d.startHeight + deltaY));
    setDragHeightPx(nextH);
  };

  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || !d.active || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if already released
    }

    if (!d.moved) {
      // Quick tap fallback cycles cleanly
      setDragHeightPx(null);
      setSheetSnap((s) => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek'));
      return;
    }

    const vh = window.innerHeight || 800;
    const finalH = dragHeightPx ?? d.startHeight;
    // Account for swipe fling velocity
    const projectedH = finalH - d.velocityY * 140;

    let nextSnap: MobileSheetSnap = 'half';
    if (projectedH < vh * 0.27) nextSnap = 'peek';
    else if (projectedH > vh * 0.65) nextSnap = 'full';

    setSheetSnap(nextSnap);
    setDragHeightPx(null);
  };

  const isDragging = dragHeightPx !== null;
  const sheetStyleHeight = isDragging ? `${dragHeightPx}px` : undefined;
  const sheetHeightClass = isDragging
    ? ''
    : sheetSnap === 'peek'
      ? 'h-[112px]'
      : sheetSnap === 'full'
        ? 'h-[84vh]'
        : 'h-[48vh]';

  return (
    <>
      {/* TOP PICK-ON-MAP GUIDANCE PILL */}
      {mapPickTarget && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4 lg:top-5">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-2xl">
            <span>{pickLabels[mapPickTarget] ?? 'Toque no mapa'}</span>
            <button
              type="button"
              onClick={() => setMapPickTarget(null)}
              className="rounded-full bg-white/20 p-1 hover:bg-white/30"
              aria-label="Cancelar seleção"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* MOBILE FLOATING TOP BAR (< lg) — compact so EixoVerde never clips */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-1.5 px-2.5 py-2.5 safe-top lg:hidden">
        <div className="glass-panel pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-2xl px-2 py-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            className="rounded-xl p-1 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
          <img
            src={`${import.meta.env.BASE_URL}icons/eixoverde-icon.svg`}
            alt={BRAND.name}
            className="h-6 w-6 shrink-0 rounded-lg"
          />
          <span className="font-display whitespace-nowrap pr-1 text-[13px] font-extrabold tracking-tight text-slate-900 dark:text-white">
            {BRAND.name}
          </span>
        </div>

        <div className="pointer-events-auto flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setGarageOpen(true)}
            title={activeVehicle.name}
            className="glass-panel flex min-w-0 max-w-[92px] items-center gap-1 rounded-2xl px-2.5 py-2 text-xs font-bold text-slate-800 shadow-lg dark:text-slate-100"
          >
            {activeVehicle.isElectric ? (
              <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Bike className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
            )}
            <span className="truncate">{compactVehicleLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            className="glass-panel flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-slate-700 shadow-lg dark:text-slate-100"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Alternar tema"
            className="glass-panel flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-slate-700 shadow-lg dark:text-slate-100"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* DESKTOP FLOATING LEFT SIDEBAR */}
      <aside className="glass-panel fixed bottom-4 left-4 top-4 z-20 hidden w-[410px] flex-col overflow-hidden rounded-3xl shadow-2xl lg:flex">
        {/* Desktop Top Header */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 px-4 py-3.5 dark:border-slate-800/80">
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Menu"
              className="rounded-xl p-1.5 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <img
              src={`${import.meta.env.BASE_URL}icons/eixoverde-icon.svg`}
              alt={BRAND.name}
              className="h-8 w-8 rounded-xl shadow-xs"
            />
            <div>
              <h1 className="font-display whitespace-nowrap text-base font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white">
                {BRAND.name}
              </h1>
              <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                {BRAND.tagline}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              id="eixoverde-garage-btn"
              type="button"
              onClick={() => setGarageOpen(true)}
              title="Minha Garagem — escolher ou cadastrar veículo"
              className="flex max-w-[110px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 transition-colors hover:border-emerald-500/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {activeVehicle.isElectric ? (
                <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Bike className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
              )}
              <span className="truncate">{compactVehicleLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              className="flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:border-emerald-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              title="Alternar tema claro / escuro"
              className="flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:border-emerald-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Desktop Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 ev-scroll">
          {mode === 'preview' ? <RoutePreviewPanel /> : <ExplorePanel />}
        </div>
      </aside>

      {/* FLOATING RIGHT MAP CONTROLS (All Devices) */}
      <div className="fixed right-3 top-20 z-20 flex flex-col gap-2 lg:right-4 lg:top-4">
        <button
          type="button"
          onClick={() => void handleLocateMe()}
          title="Minha localização (GPS)"
          className="glass-panel flex h-11 w-11 items-center justify-center rounded-2xl text-slate-800 shadow-lg transition-colors hover:text-emerald-600 dark:text-slate-100"
        >
          <LocateFixed className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => toggleLayer('lanes')}
          title="Mostrar/ocultar malha de ciclovias"
          className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg backdrop-blur-xl transition-colors ${
            showBikeLanes
              ? 'bg-emerald-600 text-white'
              : 'glass-panel text-slate-700 dark:text-slate-200'
          }`}
        >
          <Layers className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={toggleBasemap}
          title="Alternar mapa vetorial / satélite"
          className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg backdrop-blur-xl transition-colors ${
            basemap === 'satellite'
              ? 'bg-sky-600 text-white'
              : 'glass-panel text-slate-700 dark:text-slate-200'
          }`}
        >
          <Satellite className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => openHazardReporter()}
          title="Reportar perigo na ciclovia"
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/25 transition-transform hover:scale-105"
        >
          <AlertTriangle className="h-5 w-5" />
        </button>
      </div>

      {/* DESKTOP COMPACT BIKE-LANE LEGEND (Bottom-Right) */}
      <div className="fixed bottom-8 right-4 z-20 hidden flex-col items-end lg:flex">
        {legendOpen && (
          <div className="glass-panel mb-2 space-y-1.5 rounded-2xl p-3 text-xs shadow-xl">
            <div className="font-bold text-slate-800 dark:text-slate-100">Legenda da Malha</div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="h-1.5 w-5 rounded-full bg-emerald-500" /> Ciclovia segregada
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="h-1.5 w-5 rounded-full bg-sky-500" /> Ciclofaixa
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="h-1.5 w-5 rounded-full border-t-2 border-dashed border-teal-500" /> Via baixa velocidade
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="h-1.5 w-5 rounded-full border-t-2 border-dashed border-amber-500" /> Trilha
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="h-1.5 w-5 rounded-full border-t-2 border-dashed border-red-500" /> Via proibida / expressa
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          className="glass-panel rounded-full px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-md hover:text-emerald-600 dark:text-slate-200"
        >
          {legendOpen ? 'Ocultar legenda' : 'Legenda das ciclovias'}
        </button>
      </div>

      {/* MOBILE ADAPTIVE BOTTOM SHEET (< lg) — Finger-Responsive Draggable Handle */}
      <section
        style={sheetStyleHeight ? { height: sheetStyleHeight } : undefined}
        className={`glass-panel fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl shadow-2xl safe-bottom lg:hidden ${
          isDragging ? 'transition-none' : 'transition-[height] duration-250 ease-out'
        } ${sheetHeightClass}`}
      >
        {/* Interactive Touch/Pointer Drag Handle */}
        <div
          role="slider"
          aria-label="Arraste para expandir ou recolher o painel"
          aria-valuemin={0}
          aria-valuemax={2}
          aria-valuenow={sheetSnap === 'peek' ? 0 : sheetSnap === 'half' ? 1 : 2}
          tabIndex={0}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          className="flex w-full cursor-grab touch-none select-none flex-col items-center justify-center pb-2 pt-3 active:cursor-grabbing"
        >
          <span className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {sheetSnap === 'full' ? (
              <>
                <ChevronDown className="h-3 w-3" /> Arraste para ver o mapa
              </>
            ) : (
              <>
                <ChevronUp className="h-3 w-3" /> {mode === 'preview' ? 'Detalhes da rota' : 'Explorar & rotas'}
              </>
            )}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 ev-scroll">
          {mode === 'preview' ? <RoutePreviewPanel /> : <ExplorePanel />}
        </div>
      </section>
    </>
  );
}
