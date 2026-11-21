import { useState } from 'react';
import {
  BatteryCharging,
  Check,
  ExternalLink,
  Gauge,
  ShoppingBag,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { PRESET_VEHICLES } from '../../data/vehicles';
import { formatDurationPtBR } from '../../engine/geo';
import { computeRouteTelemetry } from '../../engine/telemetry';
import { useAppStore } from '../../store/useAppStore';

export function CompareBuyModal() {
  const open = useAppStore((s) => s.compareOpen);
  const setCompareOpen = useAppStore((s) => s.setCompareOpen);
  const selectVehicle = useAppStore((s) => s.selectVehicle);
  const candidates = useAppStore((s) => s.candidates);
  const selectedCandidateIdx = useAppStore((s) => s.selectedCandidateIdx);
  const riderWeightKg = useAppStore((s) => s.riderWeightKg);

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'patinete' | 'ebike' | 'eskate'>('all');
  const [sortBy, setSortBy] = useState<'price' | 'range' | 'speed'>('price');
  const [compareIds, setCompareIds] = useState<string[]>([
    'foston-s09-pro',
    'segway-ninebot-f2-pro',
    'honeywhale-s6-s',
  ]);

  if (!open) return null;

  const activeRoute = candidates[selectedCandidateIdx];
  const purchasable = PRESET_VEHICLES.filter((v) => typeof v.price === 'number' && v.price > 0)
    .filter((v) => categoryFilter === 'all' || v.category === categoryFilter)
    .sort((a, b) => {
      if (sortBy === 'price') return (a.price ?? 0) - (b.price ?? 0);
      if (sortBy === 'range') return b.nominalRangeKm - a.nominalRangeKm;
      const maxA = Math.max(...a.modes.map((m) => m.topSpeed));
      const maxB = Math.max(...b.modes.map((m) => m.topSpeed));
      return maxB - maxA;
    });

  const comparedVehicles = PRESET_VEHICLES.filter((v) => compareIds.includes(v.id));

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev.slice(-2), id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">
                Comparar & Comprar
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Catálogo extra para comparar patinetes elétricos, e-bikes e micromobilidade no Brasil
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCompareOpen(false)}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex gap-1.5">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'patinete', label: 'Patinetes' },
              { id: 'ebike', label: 'E-Bikes' },
              { id: 'eskate', label: 'E-Skate / EUC' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id as typeof categoryFilter)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  categoryFilter === tab.id
                    ? 'bg-slate-900 text-white dark:bg-emerald-600'
                    : 'bg-white text-slate-600 hover:bg-slate-200/60 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-500">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="price">Menor preço</option>
              <option value="range">Maior autonomia</option>
              <option value="speed">Maior velocidade</option>
            </select>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5 ev-scroll">
          {/* Side-by-side comparison table */}
          {comparedVehicles.length >= 2 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/90 text-slate-600 dark:bg-slate-800/90 dark:text-slate-300">
                  <tr>
                    <th className="px-3.5 py-2.5 font-bold">Comparativo ({comparedVehicles.length}/3)</th>
                    {comparedVehicles.map((v) => (
                      <th key={v.id} className="px-3.5 py-2.5 font-extrabold text-slate-900 dark:text-white">
                        {v.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr>
                    <td className="px-3.5 py-2 font-semibold text-slate-500">Faixa de Preço</td>
                    {comparedVehicles.map((v) => (
                      <td key={v.id} className="font-mono-num px-3.5 py-2 font-bold text-emerald-700 dark:text-emerald-400">
                        {v.priceLabel}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-semibold text-slate-500">Potência & Bateria</td>
                    {comparedVehicles.map((v) => (
                      <td key={v.id} className="px-3.5 py-2 text-slate-700 dark:text-slate-200">
                        {v.powerLabel} • {v.batteryLabel}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-semibold text-slate-500">Autonomia / Conforto</td>
                    {comparedVehicles.map((v) => (
                      <td key={v.id} className="px-3.5 py-2 text-slate-700 dark:text-slate-200">
                        {v.nominalRangeKm} km • {v.comfortScore}
                      </td>
                    ))}
                  </tr>
                  {activeRoute && (
                    <tr className="bg-emerald-500/5">
                      <td className="px-3.5 py-2 font-bold text-emerald-700 dark:text-emerald-400">
                        Na rota atual ({activeRoute.distanceKm} km)
                      </td>
                      {comparedVehicles.map((v) => {
                        const t = computeRouteTelemetry(activeRoute, v, 1, riderWeightKg, true);
                        return (
                          <td key={v.id} className="font-mono-num px-3.5 py-2 font-bold text-slate-900 dark:text-white">
                            {formatDurationPtBR(t.oneWayMin)} ida • {t.batteryLeftPct}% bat. (ida+volta)
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Product Cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            {purchasable.map((v) => {
              const isCompared = compareIds.includes(v.id);
              const topSpeed = Math.max(...v.modes.map((m) => m.topSpeed));

              return (
                <div
                  key={v.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400">
                          {v.categoryLabel}
                        </span>
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{v.name}</h3>
                      </div>
                      <span className="font-mono-num shrink-0 rounded-lg bg-emerald-500/12 px-2 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                        {v.priceLabel}
                      </span>
                    </div>

                    <div className="font-mono-num mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                        <Gauge className="h-3 w-3 text-emerald-600" />
                        {topSpeed} km/h
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                        <BatteryCharging className="h-3 w-3 text-sky-600" />
                        {v.nominalRangeKm} km ({v.batteryLabel})
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                        {v.wheelLabel} • {v.weightKg} kg
                      </span>
                    </div>

                    {v.pros && (
                      <p className="mt-2.5 flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                        <ThumbsUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>{v.pros}</span>
                      </p>
                    )}
                    {v.cons && (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <ThumbsDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span>{v.cons}</span>
                      </p>
                    )}
                  </div>

                  <div className="mt-3.5 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => toggleCompare(v.id)}
                      className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                        isCompared
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {isCompared && <Check className="h-3.5 w-3.5" />}
                      {isCompared ? 'Comparando' : 'Comparar'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        selectVehicle(v.id);
                        setCompareOpen(false);
                      }}
                      className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100"
                    >
                      Simular no Mapa
                    </button>

                    {v.buyUrl && (
                      <a
                        href={v.buyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500"
                      >
                        Ver Ofertas
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
