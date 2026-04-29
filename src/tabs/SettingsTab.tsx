import React from 'react';
import { Download, Upload } from 'lucide-react';
import { Config } from '../types';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';

interface SettingsTabProps {
  config: Config;
  setConfig: React.Dispatch<React.SetStateAction<Config>>;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onFactoryReset: () => void;
}

// v2.1.4 — short DOW labels via i18n. Pre-2.1.4 these were hardcoded
// English; the chips stayed English even with the UI in Arabic.
const DAY_KEYS = [
  'common.day.short.sunday',
  'common.day.short.monday',
  'common.day.short.tuesday',
  'common.day.short.wednesday',
  'common.day.short.thursday',
  'common.day.short.friday',
  'common.day.short.saturday',
];

export function SettingsTab({ config, setConfig, onExportBackup, onImportBackup, onFactoryReset }: SettingsTabProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-100 uppercase tracking-tight mb-1">{t('settings.title')}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase tracking-widest font-mono">{t('settings.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t('settings.peakDays')}</label>
          <div className="flex gap-2 flex-wrap">
            {DAY_KEYS.map((dayKey, idx) => {
              const dayNum = idx + 1;
              const isSelected = config.peakDays.includes(dayNum);
              return (
                <button
                  key={dayKey}
                  onClick={() => {
                    setConfig(prev => ({
                      ...prev,
                      peakDays: isSelected
                        ? prev.peakDays.filter(d => d !== dayNum)
                        : [...prev.peakDays, dayNum],
                    }));
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all",
                    isSelected
                      ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20"
                      : "bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600",
                  )}
                >
                  {t(dayKey)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t('settings.complianceOverview')}</label>
          <div className="p-4 bg-emerald-50/50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/30 rounded-xl">
            <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold uppercase leading-tight">{t('settings.coverageActive')}</p>
            <p className="text-[9px] text-emerald-600 dark:text-emerald-300/80 font-medium">{t('settings.coverageNote')}</p>
          </div>
        </div>
      </div>

      <div className="pt-8 border-t border-slate-100 dark:border-slate-700/60 flex justify-between items-center flex-wrap gap-4">
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('settings.dbSecurity')}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase tracking-tighter">{t('settings.instance')}</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={onExportBackup} className="apple-press px-6 py-2 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border border-emerald-100 dark:border-emerald-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-100 dark:hover:bg-emerald-500/25 font-mono flex items-center gap-2">
            <Download className="w-3 h-3" />
            {t('settings.exportBackup')}
          </button>
          <button onClick={onImportBackup} className="apple-press px-6 py-2 bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-200 border border-blue-100 dark:border-blue-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-blue-100 dark:hover:bg-blue-500/25 font-mono flex items-center gap-2">
            <Upload className="w-3 h-3" />
            {t('settings.importBackup')}
          </button>
          <button onClick={onFactoryReset} className="apple-press px-6 py-2 bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-200 border border-red-100 dark:border-red-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-red-100 dark:hover:bg-red-500/25 font-mono">
            {t('settings.factoryReset')}
          </button>
        </div>
      </div>
    </div>
  );
}
