import { useState } from 'react';
import {
  BatteryCharging,
  Bike,
  Check,
  Gauge,
  Plus,
  Scale,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { PRESET_VEHICLES, VEHICLE_CATEGORY_META } from '../../data/vehicles';
import { useAppStore } from '../../store/useAppStore';
import type { SuspensionLevel, VehicleCategory, VehicleSpec } from '../../types';

export function VehicleGarageModal() {
  const open = useAppStore((s) => s.garageOpen);
  const setGarageOpen = useAppStore((s) => s.setGarageOpen);
  const setCompareOpen = useAppStore((s) => s.setCompareOpen);
  const customVehicles = useAppStore((s) => s.customVehicles);
  const selectedVehicleId = useAppStore((s) => s.selectedVehicleId);
  const selectVehicle = useAppStore((s) => s.selectVehicle);
  const riderWeightKg = useAppStore((s) => s.riderWeightKg);
  const setRiderWeight = useAppStore((s) => s.setRiderWeight);
  const addCustomVehicle = useAppStore((s) => s.addCustomVehicle);
  const deleteCustomVehicle = useAppStore((s) => s.deleteCustomVehicle);

  const [filterCat, setFilterCat] = useState<'all' | VehicleCategory>('all');
  const [showCustomForm, setShowCustomForm] = useState(false);

  // Custom vehicle form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<VehicleCategory>('patinete');
  const [isElectric, setIsElectric] = useState(true);
  const [cruiseSpeed, setCruiseSpeed] = useState(25);
  const [powerWatts, setPowerWatts] = useState(500);
  const [nominalRangeKm, setNominalRangeKm] = useState(35);
  const [batteryWh, setBatteryWh] = useState(374);
  const [wheelInches, setWheelInches] = useState(10);
  const [suspensionLevel, setSuspensionLevel] = useState<SuspensionLevel>('dianteira');

  if (!open) return null;

  const allVehicles = [...customVehicles, ...PRESET_VEHICLES];
  const filtered = filterCat === 'all' ? allVehicles : allVehicles.filter((v) => v.category === filterCat);

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const catMeta = VEHICLE_CATEGORY_META[category];
    const ecoSpeed = Math.max(10, Math.round(cruiseSpeed * 0.68));
    const sportSpeed = Math.min(50, Math.round(cruiseSpeed * 1.24));

    const newVehicle: VehicleSpec = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      brand: 'Meu Veículo',
      category,
      categoryLabel: `${catMeta.shortLabel} Personalizado`,
      isElectric,
      isCustom: true,
      powerLabel: isElectric ? `${powerWatts}W` : 'Pedal',
      powerWatts: isElectric ? powerWatts : 0,
      wheelLabel: `Aro ${wheelInches}"`,
      wheelInches,
      batteryLabel: isElectric ? `${batteryWh}Wh` : 'Sem bateria',
      batteryWh: isElectric ? batteryWh : 0,
      weightKg: isElectric ? 18 : 13,
      suspension:
        suspensionLevel === 'dupla'
          ? 'Suspensão dupla'
          : suspensionLevel === 'dianteira'
            ? 'Suspensão dianteira'
            : suspensionLevel === 'basica'
              ? 'Absorção básica'
              : 'Rígida',
      suspensionLevel,
      comfortScore:
        wheelInches >= 20 || suspensionLevel === 'dupla'
          ? 'Alto'
          : wheelInches >= 10
            ? 'Bom'
            : 'Básico (asfalto liso)',
      nominalRangeKm: isElectric ? nominalRangeKm : 0,
      modes: [
        { name: 'Eco', topSpeed: ecoSpeed, rangeMult: 1.18 },
        { name: 'Padrão', topSpeed: cruiseSpeed, rangeMult: 1.0 },
        { name: 'Sport', topSpeed: sportSpeed, rangeMult: 0.82 },
      ],
    };

    await addCustomVehicle(newVehicle);
    setName('');
    setShowCustomForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">
              Minha Garagem
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Escolha ou cadastre seu transporte para ETA, bateria e alertas personalizados
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGarageOpen(false)}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Rider Weight Calibration Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/90 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Peso do condutor + mochila:</span>
            <strong className="font-mono-num text-emerald-700 dark:text-emerald-400">{riderWeightKg} kg</strong>
          </div>
          <input
            type="range"
            min={45}
            max={130}
            value={riderWeightKg}
            onChange={(e) => setRiderWeight(Number(e.target.value))}
            className="w-40 accent-emerald-600"
          />
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 ev-scroll">
          {/* Action Row: Register Custom + Open Compare/Buy */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowCustomForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
            >
              <Plus className="h-4 w-4" />
              {showCustomForm ? 'Voltar ao catálogo' : 'Cadastrar meu veículo'}
            </button>

            <button
              type="button"
              onClick={() => {
                setGarageOpen(false);
                setCompareOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-emerald-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-sky-600" />
              Comparar & Comprar
            </button>
          </div>

          {showCustomForm ? (
            <form
              onSubmit={handleCreateCustom}
              className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">
                <Sparkles className="h-4 w-4" />
                Cadastre qualquer patinete, e-bike, bike ou e-skate
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Nome / Modelo
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Meu Patinete 800W ou Caloi Atacama"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Categoria
                  </label>
                  <select
                    value={category}
                    onChange={(e) => {
                      const cat = e.target.value as VehicleCategory;
                      setCategory(cat);
                      const elec = cat === 'patinete' || cat === 'ebike' || cat === 'eskate';
                      setIsElectric(elec);
                      if (cat === 'bike_mtb') setWheelInches(29);
                      else if (cat === 'bike_speed' || cat === 'bike_urbana') setWheelInches(28);
                      else if (cat === 'ebike') setWheelInches(16);
                      else if (cat === 'patinete') setWheelInches(10);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {(Object.keys(VEHICLE_CATEGORY_META) as VehicleCategory[]).map((catKey) => (
                      <option key={catKey} value={catKey}>
                        {VEHICLE_CATEGORY_META[catKey].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Velocidade de cruzeiro (km/h)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={45}
                    value={cruiseSpeed}
                    onChange={(e) => setCruiseSpeed(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tamanho da roda (aro em polegadas)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={3}
                    max={29}
                    value={wheelInches}
                    onChange={(e) => setWheelInches(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Suspensão
                  </label>
                  <select
                    value={suspensionLevel}
                    onChange={(e) => setSuspensionLevel(e.target.value as SuspensionLevel)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="nenhuma">Rígida / Sem suspensão</option>
                    <option value="basica">Básica / Pneu balão</option>
                    <option value="dianteira">Suspensão dianteira</option>
                    <option value="dupla">Suspensão dupla</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    id="custom-is-electric"
                    type="checkbox"
                    checked={isElectric}
                    onChange={(e) => setIsElectric(e.target.checked)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <label htmlFor="custom-is-electric" className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Possui motor elétrico & bateria
                  </label>
                </div>

                {isElectric && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Autonomia nominal (km)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={200}
                        value={nominalRangeKm}
                        onChange={(e) => setNominalRangeKm(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Potência (W)
                        </label>
                        <input
                          type="number"
                          min={150}
                          max={4000}
                          value={powerWatts}
                          onChange={(e) => setPowerWatts(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Bateria (Wh)
                        </label>
                        <input
                          type="number"
                          min={100}
                          max={3000}
                          value={batteryWh}
                          onChange={(e) => setBatteryWh(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCustomForm(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
                >
                  Salvar e Selecionar
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Category Filter Pills */}
              <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 ev-scroll">
                <button
                  type="button"
                  onClick={() => setFilterCat('all')}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                    filterCat === 'all'
                      ? 'bg-slate-900 text-white dark:bg-emerald-600'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Todos ({allVehicles.length})
                </button>
                {(Object.keys(VEHICLE_CATEGORY_META) as VehicleCategory[]).map((catKey) => (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setFilterCat(catKey)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      filterCat === catKey
                        ? 'bg-slate-900 text-white dark:bg-emerald-600'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {VEHICLE_CATEGORY_META[catKey].shortLabel}
                  </button>
                ))}
              </div>

              {/* Vehicle Grid */}
              <div className="grid gap-2.5 sm:grid-cols-2">
                {filtered.map((v) => {
                  const active = v.id === selectedVehicleId;
                  const topSpeed = Math.max(...v.modes.map((m) => m.topSpeed));
                  return (
                    <div
                      key={v.id}
                      onClick={() => {
                        selectVehicle(v.id);
                        setGarageOpen(false);
                      }}
                      className={`group relative cursor-pointer rounded-2xl border p-3.5 transition-all ${
                        active
                          ? 'border-emerald-600 bg-emerald-500/8 shadow-sm dark:border-emerald-500 dark:bg-emerald-500/15'
                          : 'border-slate-200 bg-white hover:border-emerald-500/40 dark:border-slate-800 dark:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {v.isElectric ? (
                              <Zap className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Bike className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                            )}
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {v.categoryLabel}
                            </span>
                          </div>
                          <h3 className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-white">
                            {v.name}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1">
                          {v.isCustom && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteCustomVehicle(v.id);
                              }}
                              aria-label="Excluir veículo"
                              className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {active && (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="font-mono-num mt-2.5 flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                          <Gauge className="h-3 w-3 text-emerald-600" />
                          até {topSpeed} km/h
                        </span>
                        {v.isElectric && v.nominalRangeKm > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                            <BatteryCharging className="h-3 w-3 text-sky-600" />
                            {v.nominalRangeKm} km
                          </span>
                        )}
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                          {v.wheelLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
