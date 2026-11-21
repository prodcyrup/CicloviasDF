import { useState } from 'react';
import { AlertTriangle, MapPin, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { HazardKind } from '../../types';

const HAZARD_OPTIONS: Array<{ kind: HazardKind; emoji: string; title: string; desc: string }> = [
  { kind: 'buraco', emoji: '🕳️', title: 'Buraco na ciclovia', desc: 'Risco para aro 8.5" / 10"' },
  { kind: 'bloqueio', emoji: '🚧', title: 'Ciclovia bloqueada', desc: 'Obra, carro ou interdição' },
  { kind: 'raizes', emoji: '🌳', title: 'Raízes / piso irregular', desc: 'Ondulação forte no asfalto' },
  { kind: 'iluminacao', emoji: '💡', title: 'Iluminação precária', desc: 'Trecho escuro à noite' },
  { kind: 'cruzamento', emoji: '⚠️', title: 'Cruzamento perigoso', desc: 'Semáforo ou sinalização ruim' },
  { kind: 'agua', emoji: '💧', title: 'Alagamento / lama', desc: 'Água acumulada na pista' },
];

export function HazardReportModal() {
  const open = useAppStore((s) => s.hazardPickerOpen);
  const setOpen = useAppStore((s) => s.setHazardPickerOpen);
  const submitHazard = useAppStore((s) => s.submitHazard);
  const setMapPickTarget = useAppStore((s) => s.setMapPickTarget);

  const [selected, setSelected] = useState<HazardKind>('buraco');
  const [note, setNote] = useState('');

  if (!open) return null;

  const chosen = HAZARD_OPTIONS.find((o) => o.kind === selected) ?? HAZARD_OPTIONS[0];

  const handleSubmit = async () => {
    await submitHazard(chosen.kind, chosen.title, note);
    setNote('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                Reportar Perigo
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Salvo no mapa local (pronto para rede comunitária)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-2">
            {HAZARD_OPTIONS.map((opt) => (
              <button
                key={opt.kind}
                type="button"
                onClick={() => setSelected(opt.kind)}
                className={`rounded-2xl border p-3 text-left transition-all ${
                  selected === opt.kind
                    ? 'border-amber-500 bg-amber-500/10 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/60'
                }`}
              >
                <div className="text-xl">{opt.emoji}</div>
                <div className="mt-1 text-xs font-bold text-slate-900 dark:text-white">{opt.title}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">{opt.desc}</div>
              </button>
            ))}
          </div>

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Observação rápida (opcional, ex: próximo à 708N)..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
          />

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setMapPickTarget('hazard');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <MapPin className="h-3.5 w-3.5 text-amber-500" />
              Escolher local no mapa
            </button>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-extrabold text-slate-950 shadow-md shadow-amber-500/20 hover:bg-amber-400"
            >
              Publicar Alerta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
