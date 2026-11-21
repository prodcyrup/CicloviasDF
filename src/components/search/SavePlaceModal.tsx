import { useEffect, useState } from 'react';
import { Briefcase, Home, MapPin, Star, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { SavedPlaceCategory } from '../../types';

export function SavePlaceModal() {
  const pending = useAppStore((s) => s.pendingSavePlace);
  const closeSavePlacePrompt = useAppStore((s) => s.closeSavePlacePrompt);
  const saveFavoritePlace = useAppStore((s) => s.saveFavoritePlace);

  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<SavedPlaceCategory>('favorite');

  useEffect(() => {
    if (!pending) return;
    setCategory(pending.defaultCategory);
    if (pending.defaultCategory === 'home') setLabel('Casa');
    else if (pending.defaultCategory === 'work') setLabel('Trabalho');
    else setLabel(pending.place.name);
  }, [pending]);

  if (!pending) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveFavoritePlace(pending.place, label, category);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={closeSavePlacePrompt}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Star className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                Salvar em Meus Locais
              </h2>
              <p className="max-w-[260px] truncate text-[11px] text-slate-500 dark:text-slate-400">
                {pending.place.subtitle || pending.place.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSavePlacePrompt}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {/* Category Picker */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'favorite' as const, label: 'Favorito', icon: Star, activeCls: 'border-amber-500 bg-amber-500/12 text-amber-700 dark:text-amber-300' },
              { id: 'home' as const, label: 'Casa', icon: Home, activeCls: 'border-emerald-600 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
              { id: 'work' as const, label: 'Trabalho', icon: Briefcase, activeCls: 'border-sky-600 bg-sky-500/12 text-sky-700 dark:text-sky-300' },
            ].map((opt) => {
              const Icon = opt.icon;
              const selected = category === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setCategory(opt.id);
                    if (opt.id === 'home' && (!label || label === 'Trabalho' || label === pending.place.name)) {
                      setLabel('Casa');
                    } else if (opt.id === 'work' && (!label || label === 'Casa' || label === pending.place.name)) {
                      setLabel('Trabalho');
                    } else if (opt.id === 'favorite' && (label === 'Casa' || label === 'Trabalho')) {
                      setLabel(pending.place.name);
                    }
                  }}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border py-3 text-xs font-bold transition-all ${
                    selected
                      ? opt.activeCls
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300'
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Custom Name Input */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nome do local
            </label>
            <input
              type="text"
              required
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Casa, Escritório, Academia, Parque..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
            />
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-slate-100/80 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="truncate">{pending.place.name} • {pending.place.subtitle}</span>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeSavePlacePrompt}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-extrabold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500"
            >
              Salvar Local
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
