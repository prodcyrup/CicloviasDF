import { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Briefcase,
  Compass,
  Heart,
  Home,
  MapPin,
  Navigation2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { BRAND } from '../../config/brand';
import { formatDurationPtBR } from '../../engine/geo';
import { parseImportedRouteFile } from '../../engine/gpx';
import { searchPlaces } from '../../engine/routing';
import { computeRouteTelemetry } from '../../engine/telemetry';
import { useAppStore } from '../../store/useAppStore';
import type { PlaceResult, SavedRoute } from '../../types';

export function ExplorePanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const exploreTab = useAppStore((s) => s.exploreTab);
  const setExploreTab = useAppStore((s) => s.setExploreTab);
  const savedRoutes = useAppStore((s) => s.savedRoutes);
  const loadSavedRoute = useAppStore((s) => s.loadSavedRoute);
  const toggleFavoriteRoute = useAppStore((s) => s.toggleFavoriteRoute);
  const deleteSavedRoute = useAppStore((s) => s.deleteSavedRoute);
  const importSavedRoute = useAppStore((s) => s.importSavedRoute);
  const setDestination = useAppStore((s) => s.setDestination);
  const setMapPickTarget = useAppStore((s) => s.setMapPickTarget);
  const mapPickTarget = useAppStore((s) => s.mapPickTarget);
  const homePlace = useAppStore((s) => s.homePlace);
  const workPlace = useAppStore((s) => s.workPlace);
  const navPos = useAppStore((s) => s.nav.currentPos);
  const getActiveVehicle = useAppStore((s) => s.getActiveVehicle);
  const selectedModeIndex = useAppStore((s) => s.selectedModeIndex);
  const riderWeightKg = useAppStore((s) => s.riderWeightKg);
  const pushToast = useAppStore((s) => s.pushToast);

  const activeVehicle = getActiveVehicle();

  useEffect(() => {
    const timer = setTimeout(async () => {
      setSearching(true);
      const list = await searchPlaces(query, navPos ?? BRAND.defaultCenter);
      setResults(list);
      setSearching(false);
    }, query ? 260 : 0);
    return () => clearTimeout(timer);
  }, [query, navPos]);

  const handleSelectPlace = (place: PlaceResult) => {
    setQuery('');
    setSearchFocused(false);
    setDestination(place, true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseImportedRouteFile(file.name, text);
    if (parsed) {
      await importSavedRoute(parsed);
    } else {
      pushToast('Arquivo inválido', 'Envie um arquivo .GPX, .KML ou .GeoJSON válido.', 'rose');
    }
    e.target.value = '';
  };

  const curatedList = savedRoutes.filter((r) => r.isCurated);
  const userSavedList = savedRoutes.filter((r) => !r.isCurated || r.isFavorite);

  const renderRouteCard = (route: SavedRoute) => {
    const telemetry = computeRouteTelemetry(
      {
        distanceKm: route.distanceKm,
        elevation: {
          elevations: [],
          ascentM: route.ascentM,
          descentM: route.descentM,
          minM: 1000,
          maxM: 1100,
          isRealElevation: true,
        },
        crossings: [],
        surfaces: {
          cicloviaPct: route.safetyScore,
          ciclofaixaPct: 0,
          baixaVelPct: 0,
          trilhaPct: 0,
          viaComumPct: Math.max(0, 100 - route.safetyScore),
          safetyScore: route.safetyScore,
        },
      },
      activeVehicle,
      selectedModeIndex,
      riderWeightKg
    );

    return (
      <div
        key={route.id}
        onClick={() => loadSavedRoute(route)}
        className="group cursor-pointer rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 transition-all hover:border-emerald-500/40 hover:shadow-md dark:border-slate-700/70 dark:bg-slate-800/70 dark:hover:border-emerald-500/40"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  route.difficulty === 'Fácil'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : route.difficulty === 'Moderado'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                }`}
              >
                {route.difficulty}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-3 w-3" />
                {route.safetyScore}% segura
              </span>
              <span className="text-[10px] font-medium text-slate-400">• {route.city}</span>
            </div>
            <h3 className="truncate text-sm font-bold text-slate-900 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">
              {route.name}
            </h3>
            {route.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                {route.description}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void toggleFavoriteRoute(route.id);
              }}
              aria-label="Favoritar rota"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-700"
            >
              <Heart className={`h-4 w-4 ${route.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>
            {!route.isCurated && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteSavedRoute(route.id);
                }}
                aria-label="Excluir rota"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="font-mono-num mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-xs dark:border-slate-700/60">
          <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
            <span className="font-bold text-emerald-700 dark:text-emerald-400">
              {formatDurationPtBR(telemetry.oneWayMin)}
            </span>
            <span>{route.distanceKm.toFixed(1).replace('.', ',')} km</span>
            <span className="text-slate-500 dark:text-slate-400">↗ {route.ascentM}m</span>
          </div>
          {activeVehicle.isElectric && (
            <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
              -{telemetry.batteryUsedPct}% bat.
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Google Maps / Waze Search Input */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800/90">
          <Search className="h-4.5 w-4.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <input
            id="eixoverde-search-input"
            type="text"
            value={query}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Para onde vamos? (DF ou Brasil)"
            className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {searchFocused && (
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold text-slate-400">
              <span>{searching ? 'Buscando endereços no Brasil...' : 'Sugestões rápidas'}</span>
              <button
                type="button"
                onClick={() => setSearchFocused(false)}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Fechar
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto ev-scroll">
              {results.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => handleSelectPlace(place)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {place.name}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {place.subtitle}
                    </div>
                  </div>
                  <Navigation2 className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchFocused(false);
                setMapPickTarget('dest');
              }}
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-500/40 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            >
              <Plus className="h-3.5 w-3.5" />
              Escolher destino tocando no mapa
            </button>
          </div>
        )}
      </div>

      {/* Quick Action Strip (Home / Work / Pick on Map / Import GPX) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 ev-scroll">
        {homePlace && (
          <button
            type="button"
            onClick={() => setDestination(homePlace, true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-500/40 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Home className="h-3.5 w-3.5 text-emerald-600" />
            Casa
          </button>
        )}
        {workPlace && (
          <button
            type="button"
            onClick={() => setDestination(workPlace, true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-500/40 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Briefcase className="h-3.5 w-3.5 text-sky-600" />
            Trabalho
          </button>
        )}
        <button
          type="button"
          onClick={() => setMapPickTarget(mapPickTarget === 'dest' ? null : 'dest')}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            mapPickTarget === 'dest'
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
          }`}
        >
          <MapPin className="h-3.5 w-3.5" />
          {mapPickTarget === 'dest' ? 'Toque no mapa...' : 'Marcar no Mapa'}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <Upload className="h-3.5 w-3.5 text-amber-600" />
          Importar GPX/KML
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx,.kml,.geojson,.json"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Komoot-Style Discover / Saved Segmented Switch */}
      <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/90">
        <button
          type="button"
          onClick={() => setExploreTab('discover')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
            exploreTab === 'discover'
              ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
          }`}
        >
          <Compass className="h-3.5 w-3.5" />
          Rotas em Brasília
        </button>
        <button
          type="button"
          onClick={() => setExploreTab('saved')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
            exploreTab === 'saved'
              ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
          }`}
        >
          <Bookmark className="h-3.5 w-3.5" />
          Minhas Salvas ({userSavedList.length})
        </button>
      </div>

      {/* Route Feed */}
      <div className="space-y-2.5">
        {exploreTab === 'discover' ? (
          curatedList.map(renderRouteCard)
        ) : userSavedList.length > 0 ? (
          userSavedList.map(renderRouteCard)
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
            <Sparkles className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Nenhuma rota salva ainda
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Pesquise um destino, importe um arquivo GPX do Komoot ou favorite uma rota de Brasília.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
