import React from 'react';
import { Languages, Sun, Moon, Monitor } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useTheme, Theme } from '../lib/theme';
import { cn } from '../lib/utils';

// Sidebar footer controls. v2.6 polish:
//   • Theme picker is now a 3-button segmented control instead of a single
//     cycle button — the user sees all three options at once and the
//     selected one stands out, matching macOS / iOS preference panes.
//   • Locale toggle uses a softer surface and an arrow-flip on click for
//     RTL / LTR awareness.
export function LocaleSwitcher() {
  const { locale, setLocale, t, dir } = useI18n();
  const { theme, setTheme } = useTheme();
  const nextLocale = locale === 'en' ? 'ar' : 'en';

  const themeOptions: { id: Theme; Icon: typeof Sun; label: string }[] = [
    { id: 'light', Icon: Sun, label: t('theme.light') },
    { id: 'dark', Icon: Moon, label: t('theme.dark') },
    { id: 'system', Icon: Monitor, label: t('theme.system') },
  ];

  return (
    <div className="space-y-2 mb-1">
      <button
        onClick={() => setLocale(nextLocale)}
        title={t('sidebar.locale.tooltip')}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[10px] font-bold text-blue-200 uppercase tracking-widest hover:bg-blue-500/15 rounded-lg transition-colors border border-blue-500/15 hover:border-blue-500/30"
      >
        <span className="flex items-center gap-2">
          <Languages className="w-4 h-4" />
          {locale === 'en' ? 'EN' : 'AR'}
        </span>
        <span className="text-white/80 font-mono">
          {dir === 'rtl' ? '←' : '→'} {t('sidebar.locale.switch')}
        </span>
      </button>

      {/* Three-state segmented theme picker (light / dark / system). The
          active option draws against a blue-tinted surface so it pops
          against the dark sidebar; inactive options stay subtle. */}
      <div
        role="radiogroup"
        aria-label={t('theme.tooltip')}
        className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-800/60 border border-slate-700/60"
      >
        {themeOptions.map(({ id, Icon, label }) => {
          const active = theme === id;
          return (
            <button
              key={id}
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(id)}
              title={label}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-md text-[8px] font-black uppercase tracking-widest transition-all duration-150",
                active
                  ? "bg-blue-500/20 text-blue-100 shadow-inner"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
