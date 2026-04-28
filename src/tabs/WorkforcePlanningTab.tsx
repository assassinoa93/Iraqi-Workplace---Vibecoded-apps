import React, { useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Users, TrendingUp, TrendingDown, Minus,
  Briefcase, Clock, Sparkles, Info, AlertCircle, MapPin,
} from 'lucide-react';
import { format } from 'date-fns';
import { Employee, Shift, Station, PublicHoliday, Config, Schedule } from '../types';
import { Card } from '../components/Primitives';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import { analyzeWorkforce, RoleDemand } from '../lib/workforcePlanning';

interface Props {
  employees: Employee[];
  shifts: Shift[];
  stations: Station[];
  holidays: PublicHoliday[];
  config: Config;
  schedule: Schedule;
  isPeakDay: (day: number) => boolean;
  prevMonth: () => void;
  nextMonth: () => void;
  onGoToRoster: () => void;
  onGoToLayout: () => void;
}

// Workforce Planning tab — answers "what does my ideal roster look like for
// this venue's coverage requirements, peak/non-peak split, and operating
// windows, and how does it compare to what I have today?".
//
// The math lives in `lib/workforcePlanning.ts` so it can be unit-tested and
// re-used. This tab is a presentation layer + a list of recommended actions
// per role (hire / release / hold) with a payroll-delta KPI.
export function WorkforcePlanningTab(props: Props) {
  const {
    employees, shifts, stations, holidays, config, schedule, isPeakDay,
    prevMonth, nextMonth, onGoToRoster, onGoToLayout,
  } = props;
  const { t } = useI18n();
  void schedule; void shifts;

  const plan = useMemo(
    () => analyzeWorkforce({ employees, shifts, stations, holidays, config, isPeakDay }),
    [employees, shifts, stations, holidays, config, isPeakDay],
  );

  const fmtIQD = (n: number) => Math.round(Math.abs(n)).toLocaleString();

  const hasInputs = stations.length > 0;
  const hasDemand = plan.byRole.some(r => r.monthlyRequiredHours > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
          <button onClick={prevMonth} aria-label={t('action.prevMonth')} className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center px-4 w-40 font-mono">
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">{config.year}</p>
            <p className="text-xl font-black text-slate-800 tracking-tighter uppercase whitespace-nowrap">
              {format(new Date(config.year, config.month - 1, 1), 'MMMM')}
            </p>
          </div>
          <button onClick={nextMonth} aria-label={t('action.nextMonth')} className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('workforce.eyebrow')}</p>
      </div>

      {!hasInputs ? (
        <Card className="p-10 text-center space-y-4">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
            <MapPin className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-700">{t('workforce.empty.title')}</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">{t('workforce.empty.body')}</p>
          <button onClick={onGoToLayout} className="px-5 py-2 bg-slate-900 text-white rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all">
            {t('workforce.empty.cta')}
          </button>
        </Card>
      ) : !hasDemand ? (
        <Card className="p-8 text-center space-y-3 bg-amber-50/40 border-amber-200">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
            <Info className="w-7 h-7 text-amber-700" />
          </div>
          <h3 className="text-lg font-bold text-amber-800">{t('workforce.noDemand.title')}</h3>
          <p className="text-sm text-amber-700 max-w-md mx-auto leading-relaxed">{t('workforce.noDemand.body')}</p>
        </Card>
      ) : (
        <>
          {/* ── Top KPI strip ───────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-5 bg-slate-900 text-white border-0 shadow-xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-2">{t('workforce.kpi.idealFTE')}</p>
              <p className="text-3xl font-black tracking-tight">{plan.totalIdealFTE}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">{t('workforce.kpi.idealFTESub')}</p>
            </Card>
            <Card className="p-5 bg-emerald-50 border-emerald-200">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-2">{t('workforce.kpi.recommendedFTE')}</p>
              <p className="text-3xl font-black tracking-tight text-emerald-700">{plan.totalRecommendedFTE}</p>
              <p className="text-[10px] font-bold text-emerald-600 mt-1 uppercase tracking-wider">{t('workforce.kpi.recommendedFTESub')}</p>
            </Card>
            <Card className="p-5 bg-blue-50 border-blue-200">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 mb-2">{t('workforce.kpi.partTime')}</p>
              <p className="text-3xl font-black tracking-tight text-blue-700">{plan.totalRecommendedPartTime}</p>
              <p className="text-[10px] font-bold text-blue-600 mt-1 uppercase tracking-wider">{t('workforce.kpi.partTimeSub')}</p>
            </Card>
            <Card className={cn(
              "p-5 border",
              plan.monthlyDelta < 0 ? "bg-emerald-50 border-emerald-200" : plan.monthlyDelta > 0 ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200",
            )}>
              <p className={cn(
                "text-[10px] font-black uppercase tracking-widest mb-2",
                plan.monthlyDelta < 0 ? "text-emerald-700" : plan.monthlyDelta > 0 ? "text-rose-700" : "text-slate-600",
              )}>{t('workforce.kpi.payrollDelta')}</p>
              <p className={cn(
                "text-2xl font-black tracking-tight",
                plan.monthlyDelta < 0 ? "text-emerald-700" : plan.monthlyDelta > 0 ? "text-rose-700" : "text-slate-700",
              )}>
                {plan.monthlyDelta >= 0 ? '+' : '−'}{fmtIQD(plan.monthlyDelta)}
              </p>
              <p className={cn(
                "text-[10px] font-bold mt-1",
                plan.monthlyDelta < 0 ? "text-emerald-600" : plan.monthlyDelta > 0 ? "text-rose-600" : "text-slate-500",
              )}>IQD / mo</p>
            </Card>
          </div>

          {/* Method note explaining the recommendation logic */}
          <Card className="p-4 bg-blue-50/50 border-blue-100 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black text-blue-800 uppercase tracking-widest">{t('workforce.method.title')}</p>
              <p className="text-[11px] text-blue-700 leading-relaxed mt-1">{t('workforce.method.body')}</p>
            </div>
          </Card>

          {/* ── Per-role breakdown ──────────────────────────────────────── */}
          <div className="space-y-4">
            {plan.byRole.map(r => <RoleCard key={r.role} role={r} fmtIQD={fmtIQD} />)}
          </div>

          {/* Footer CTA — go to roster to act on hire suggestions */}
          <Card className="p-5 bg-slate-900 text-white border-0 flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">{t('workforce.cta.title')}</p>
              <p className="text-[11px] text-slate-300 leading-relaxed mt-1">{t('workforce.cta.body')}</p>
            </div>
            <button onClick={onGoToRoster} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shrink-0">
              {t('workforce.cta.button')}
            </button>
          </Card>
        </>
      )}
    </div>
  );
}

function RoleCard({ role, fmtIQD }: { role: RoleDemand; fmtIQD: (n: number) => string }) {
  const { t } = useI18n();
  const totalRecommended = role.recommendedFTE + role.recommendedPartTime;
  const peakLift = role.nonPeakRequiredHours > 0
    ? (role.peakRequiredHours / role.nonPeakRequiredHours)
    : (role.peakRequiredHours > 0 ? Infinity : 0);
  const actionTone =
    role.action === 'hire' ? { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', Icon: TrendingUp }
      : role.action === 'release' ? { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', Icon: TrendingDown }
        : { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', Icon: Minus };
  const ActionIcon = actionTone.Icon;
  const actionLabel = role.action === 'hire' ? t('workforce.action.hire')
    : role.action === 'release' ? t('workforce.action.release')
    : t('workforce.action.hold');

  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
          <Briefcase className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-slate-800 tracking-tight">{role.role}</h3>
          <p className="text-[10px] text-slate-500 font-mono">
            {role.monthlyRequiredHours.toFixed(0)}h {t('workforce.role.required')} · {Math.round(role.cap)}h {t('workforce.role.cap')}
          </p>
        </div>
        <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border", actionTone.bg, actionTone.border)}>
          <ActionIcon className={cn("w-3.5 h-3.5", actionTone.text)} />
          <span className={cn("text-[10px] font-black uppercase tracking-widest", actionTone.text)}>
            {actionLabel}
          </span>
        </div>
      </div>

      <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-slate-100">
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('workforce.role.current')}</p>
          <p className="text-2xl font-black text-slate-800">{role.currentCount}</p>
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('workforce.role.recommendedFTE')}</p>
          <p className="text-2xl font-black text-emerald-700">{role.recommendedFTE}</p>
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('workforce.role.recommendedPT')}</p>
          <p className="text-2xl font-black text-blue-700">{role.recommendedPartTime}</p>
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('workforce.role.delta')}</p>
          <p className={cn(
            "text-2xl font-black",
            role.delta > 0 ? "text-rose-700" : role.delta < 0 ? "text-emerald-700" : "text-slate-700",
          )}>
            {role.delta > 0 ? '+' : ''}{role.delta}
          </p>
          <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">
            {role.action === 'hire'
              ? t('workforce.role.hireBy', { count: role.delta })
              : role.action === 'release'
                ? t('workforce.role.releaseBy', { count: Math.abs(role.delta) })
                : t('workforce.role.matchesNeed')}
          </p>
        </div>
      </div>

      {/* Reasoning */}
      <div className="p-5 bg-slate-50/40 border-b border-slate-100 flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-700 leading-relaxed">{role.reasoning}</p>
      </div>

      {/* Peak vs non-peak demand visual */}
      <div className="p-5 border-b border-slate-100 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> {t('workforce.role.demandSplit')}
          </p>
          {peakLift > 0 && peakLift !== Infinity && (
            <p className="text-[10px] text-slate-500 font-mono">
              {t('workforce.role.peakLift', { pct: (peakLift * 100).toFixed(0) })}
            </p>
          )}
        </div>
        {(role.peakRequiredHours + role.nonPeakRequiredHours) > 0 && (
          <>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
              <div className="h-full bg-amber-500" style={{ width: `${(role.peakRequiredHours / (role.peakRequiredHours + role.nonPeakRequiredHours)) * 100}%` }} />
              <div className="h-full bg-emerald-500" style={{ width: `${(role.nonPeakRequiredHours / (role.peakRequiredHours + role.nonPeakRequiredHours)) * 100}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-amber-500 rounded-sm" /> {role.peakRequiredHours.toFixed(0)}h {t('workforce.role.peak')}</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-500 rounded-sm" /> {role.nonPeakRequiredHours.toFixed(0)}h {t('workforce.role.nonPeak')}</span>
            </div>
          </>
        )}
      </div>

      {/* Per-station breakdown */}
      {role.byStation.length > 0 && (
        <div className="p-5 space-y-2">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <MapPin className="w-3 h-3" /> {t('workforce.role.stationsHeader')}
          </p>
          <div className="space-y-1.5">
            {role.byStation.map(st => (
              <div key={st.stationId} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 truncate">{st.stationName}</p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {st.openHrsPerDay.toFixed(0)}h/day · peak {st.peakMinHC} HC · normal {st.normalMinHC} HC
                  </p>
                </div>
                <div className="text-right shrink-0 w-24">
                  <p className="text-sm font-black text-slate-800">{st.monthlyHours.toFixed(0)}h</p>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{t('workforce.role.monthlyHours')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
