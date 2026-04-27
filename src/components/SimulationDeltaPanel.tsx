import React from 'react';
import { TrendingUp, TrendingDown, Minus, FlaskConical, X, Check, Undo2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';

export interface SimDeltaMetric {
  label: string;
  baseline: number;
  sim: number;
  // 'higherIsBetter' decides whether a positive delta is good (e.g. coverage)
  // or bad (e.g. violations). Used only for the up/down/flat tone — values
  // themselves are rendered raw with `formatter`.
  higherIsBetter: boolean;
  formatter?: (n: number) => string;
}

interface Props {
  isActive: boolean;
  metrics: SimDeltaMetric[];
  onExit: () => void;
  onApply: () => void;
  onReset: () => void;
}

// Floating bottom panel shown while simulation mode is on. The header makes the
// "you are not editing live data" state visually loud; the metrics row
// compares baseline vs sim across coverage / OT / violations / staff hours.
export function SimulationDeltaPanel({ isActive, metrics, onExit, onApply, onReset }: Props) {
  const { t } = useI18n();
  if (!isActive) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] bg-white border border-indigo-200 rounded-2xl shadow-2xl shadow-indigo-500/20 max-w-5xl w-[calc(100vw-2rem)]">
      <div className="flex items-stretch">
        <div className="px-4 py-3 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-l-2xl flex items-center gap-3">
          <FlaskConical className="w-5 h-5 animate-pulse" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{t('sim.banner.eyebrow')}</p>
            <p className="text-sm font-black tracking-tight">{t('sim.banner.title')}</p>
          </div>
        </div>
        <div className="flex-1 px-5 py-3 flex items-center gap-4 overflow-x-auto">
          {metrics.map((m, i) => {
            const delta = m.sim - m.baseline;
            const tone =
              delta === 0 ? 'flat' :
              ((delta > 0) === m.higherIsBetter) ? 'good' : 'bad';
            const fmt = m.formatter || ((n: number) => n.toLocaleString());
            const Icon = tone === 'good' ? TrendingUp : tone === 'bad' ? TrendingDown : Minus;
            return (
              <div key={i} className="flex flex-col min-w-[110px]">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{m.label}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-black text-slate-700">{fmt(m.sim)}</span>
                  <span className="text-[10px] font-mono text-slate-400">vs {fmt(m.baseline)}</span>
                </div>
                <div className={cn(
                  "flex items-center gap-1 text-[10px] font-bold mt-0.5",
                  tone === 'good' ? "text-emerald-600" : tone === 'bad' ? "text-rose-600" : "text-slate-400"
                )}>
                  <Icon className="w-3 h-3" />
                  {delta === 0 ? t('sim.delta.unchanged') : (delta > 0 ? '+' : '') + fmt(delta)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-4 py-3 flex items-center gap-2 border-l border-slate-100 bg-slate-50/50 rounded-r-2xl">
          <button
            onClick={onReset}
            title={t('sim.action.reset')}
            className="px-3 py-2 rounded-lg text-[10px] font-black text-slate-600 hover:bg-slate-100 uppercase tracking-widest flex items-center gap-1.5"
          >
            <Undo2 className="w-3 h-3" />
            {t('sim.action.reset')}
          </button>
          <button
            onClick={onApply}
            className="px-3 py-2 rounded-lg text-[10px] font-black bg-emerald-600 text-white hover:bg-emerald-700 uppercase tracking-widest flex items-center gap-1.5"
          >
            <Check className="w-3 h-3" />
            {t('sim.action.apply')}
          </button>
          <button
            onClick={onExit}
            className="px-3 py-2 rounded-lg text-[10px] font-black bg-slate-100 text-slate-700 hover:bg-slate-200 uppercase tracking-widest flex items-center gap-1.5"
          >
            <X className="w-3 h-3" />
            {t('sim.action.exit')}
          </button>
        </div>
      </div>
    </div>
  );
}
