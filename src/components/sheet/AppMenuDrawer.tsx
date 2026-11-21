import {
  AlertTriangle,
  Bike,
  Bookmark,
  Cloud,
  Layers,
  MapPin,
  Moon,
  Satellite,
  ShoppingBag,
  Star,
  Sun,
  X,
} from 'lucide-react';
import { BRAND } from '../../config/brand';
import { hasMapTilerKey, hasOrsKey } from '../../config/providers';
import { selectActiveVehicle, useAppStore } from '../../store/useAppStore';

export function AppMenuDrawer() {
  const open = useAppStore((s) => s.menuOpen);
  const setMenuOpen = useAppStore((s) => s.setMenuOpen);
  const setGarageOpen = useAppStore((s) => s.setGarageOpen);
  const setCompareOpen = useAppStore((s) => s.setCompareOpen);
  const setExploreTab = useAppStore((s) => s.setExploreTab);
  const clearActiveRoute = useAppStore((s) => s.clearActiveRoute);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const basemap = useAppStore((s) => s.basemap);
  const toggleBasemap = useAppStore((s) => s.toggleBasemap);
  const showBikeLanes = useAppStore((s) => s.showBikeLanes);
  const showPois = useAppStore((s) => s.showPois);
  const showHazards = useAppStore((s) => s.showHazards);
  const toggleLayer = useAppStore((s) => s.toggleLayer);
  const activeVehicle = useAppStore(selectActiveVehicle);
  const savedRoutes = useAppStore((s) => s.savedRoutes);
  const savedPlaces = useAppStore((s) => s.savedPlaces);
  const hazards = useAppStore((s) => s.hazards);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-950/55 backdrop-blur-xs" onClick={() => setMenuOpen(false)}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-2xl dark:bg-slate-900"
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <img src={`${import.meta.env.BASE_URL}icons/eixoverde-icon.svg`} alt={BRAND.name} className="h-9 w-9 rounded-xl shadow-sm" />
            <div>
              <div className="font-display text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                {BRAND.name}
              </div>
              <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                {BRAND.regionLabel}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 space-y-5 overflow-y-auto p-4 ev-scroll">
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setGarageOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-emerald-500/10 px-3.5 py-3 text-left transition-colors hover:bg-emerald-500/15"
            >
              <Bike className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-900 dark:text-white">Minha Garagem</div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{activeVehicle.name}</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                clearActiveRoute();
                setExploreTab('routes');
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Bookmark className="h-4.5 w-4.5 text-emerald-600" />
              <span className="flex-1 text-sm font-semibold">Rotas</span>
              <span className="font-mono-num rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {savedRoutes.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                clearActiveRoute();
                setExploreTab('places');
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Star className="h-4.5 w-4.5 text-amber-500" />
              <span className="flex-1 text-sm font-semibold">Meus Locais</span>
              <span className="font-mono-num rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {savedPlaces.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setCompareOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ShoppingBag className="h-4.5 w-4.5 text-sky-600" />
              <div className="flex-1">
                <div className="text-sm font-semibold">Comparar & Comprar</div>
                <div className="text-[11px] text-slate-400">Patinetes, E-Bikes & custo-benefício</div>
              </div>
            </button>
          </div>

          {/* Map Layer Toggles */}
          <div>
            <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Camadas & Aparência
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => toggleLayer('lanes')}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="inline-flex items-center gap-2.5">
                  <Layers className="h-4 w-4 text-emerald-600" />
                  Malha de Ciclovias DF
                </span>
                <span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${showBikeLanes ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                  <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${showBikeLanes ? 'translate-x-4' : ''}`} />
                </span>
              </button>

              <button
                type="button"
                onClick={() => toggleLayer('pois')}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="inline-flex items-center gap-2.5">
                  <MapPin className="h-4 w-4 text-sky-600" />
                  Bicicletários & Oficinas
                </span>
                <span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${showPois ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                  <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${showPois ? 'translate-x-4' : ''}`} />
                </span>
              </button>

              <button
                type="button"
                onClick={() => toggleLayer('hazards')}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="inline-flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Alertas de Perigo ({hazards.length})
                </span>
                <span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${showHazards ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                  <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${showHazards ? 'translate-x-4' : ''}`} />
                </span>
              </button>

              <button
                type="button"
                onClick={toggleBasemap}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="inline-flex items-center gap-2.5">
                  <Satellite className="h-4 w-4 text-slate-500" />
                  Modo Satélite
                </span>
                <span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${basemap === 'satellite' ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                  <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${basemap === 'satellite' ? 'translate-x-4' : ''}`} />
                </span>
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="inline-flex items-center gap-2.5">
                  {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600" />}
                  Tema {theme === 'dark' ? 'Escuro' : 'Claro'}
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Alternar</span>
              </button>
            </div>
          </div>

          {/* Engine & Phase 2 Status */}
          <div className="space-y-2 rounded-2xl bg-slate-100/80 p-3.5 text-xs dark:bg-slate-800/60">
            <div className="font-bold text-slate-700 dark:text-slate-200">Motores Ativos</div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>Mapa Vetorial</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {hasMapTilerKey() ? 'MapTiler Cloud' : 'OpenFreeMap (Grátis)'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>Roteamento Seguro</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {hasOrsKey() ? 'OpenRouteService' : 'BRouter / OSRM'}
              </span>
            </div>
            <div className="mt-2 flex items-start gap-2 border-t border-slate-200/80 pt-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
              <span>
                <strong>Fase 1 Local-First:</strong> suas rotas, veículos e alertas ficam salvos offline no dispositivo, prontos para sincronizar com conta na Fase 2.
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
