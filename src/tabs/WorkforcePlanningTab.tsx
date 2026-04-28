import React, { useMemo, useState } from 'react';
import {
  Users, TrendingUp, TrendingDown, Minus, Briefcase, Clock, Sparkles, Info,
  MapPin, ChevronDown, ChevronUp, Calendar, Coins, Activity,
} from 'lucide-react';
import { Employee, Shift, Station, PublicHoliday, Config, Schedule } from '../types';
import { Card } from '../components/Primitives';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import { analyzeWorkforceAnnual, RoleDemand, MonthlyPlanSummary } from '../lib/workforcePlanning';

interface Props {
  employees: Employee[];
  shifts: Shift[];
  stations: Station[];
  holidays: PublicHoliday[];
  config: Config;
  schedule: Schedule;
  // Per-month peak-day factory. Given a config (with year/month overridden),
  // returns the predicate. App.tsx already has this logic; the tab only
  // needs the factory so each month's analysis honours the user's peak-day
  // settings + holiday list.
  isPeakDayFor: (config: Config) => (day: number) => boolean;
  prevMonth: () => void;
  nextMonth: () => void;
  onGoToRoster: () => void;
  onGoToLayout: () => void;
}

// Workforce Planning tab (v1.13 — annual view)
//
// Pre-1.13 this tab analyzed only the active month, which made the
// recommendation feel jumpy: Ramadan dropped demand, Eid spiked it, and the
// supervisor couldn't see the bigger picture. The annual view runs the
// monthly analyzer for every month of the year and surfaces:
//   • Annual aggregates (total hours, average FTE/PT, payroll delta)
//   • A monthly demand bar chart (peak month and valley month highlighted)
//   • Per-role roll-ups using the year-average plan
//   • An implementation timing table — pick a start month, see the
//     remaining-year savings — so the supervisor can decide WHEN to roll
//     out the change, not just whether to do it.
export function WorkforcePlanningTab(props: Props) {
  const {
    employees, shifts, stations, holidays, config, schedule, isPeakDayFor,
    prevMonth, nextMonth, onGoToRoster, onGoToLayout,
  } = props;
  const { t } = useI18n();
  void prevMonth; void nextMonth; void schedule;

  const annual = useMemo(
    () => analyzeWorkforceAnnual({ employees, shifts, stations, holidays, baseConfig: config, isPeakDayFor }),
    [employees, shifts, stations, holidays, config, isPeakDayFor],
  );

  // The "headline plan" for the per-role section uses the peak month so the
  // supervisor sees the worst-case staffing requirement. They can drill into
  // any month via the monthly bar chart below.
  const [drillMonthIndex, setDrillMonthIndex] = useState<number>(annual.peakMonthIndex);
  const drillMonth = annual.byMonth.find(m => m.monthIndex === drillMonthIndex) || annual.byMonth[annual.peakMonthIndex - 1];

  const fmtIQD = (n: number) => Math.round(Math.abs(n)).toLocaleString();

  const hasInputs = stations.length > 0;
  const hasDemand = annual.annualRequiredHours > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 mb-2">
        <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">{t('workforce.annual.year')}</p>
          <p className="text-2xl font-black text-slate-800 tracking-tight font-mono">{annual.year}</p>
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
          {/* ── Annual KPI strip ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-5 bg-slate-900 text-white border-0 shadow-xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-2">{t('workforce.annual.kpi.totalHours')}</p>
              <p className="text-3xl font-black tracking-tight">{Math.round(annual.annualRequiredHours).toLocaleString()}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">{t('workforce.annual.kpi.totalHoursSub')}</p>
            </Card>
            <Card className="p-5 bg-emerald-50 border-emerald-200">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-2">{t('workforce.annual.kpi.avgFTE')}</p>
              <p className="text-3xl font-black tracking-tight text-emerald-700">{annual.avgRecommendedFTE.toFixed(1)}</p>
              <p className="text-[10px] font-bold text-emerald-600 mt-1 uppercase tracking-wider">{t('workforce.annual.kpi.avgFTESub')}</p>
            </Card>
            <Card className="p-5 bg-blue-50 border-blue-200">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 mb-2">{t('workforce.annual.kpi.avgPT')}</p>
              <p className="text-3xl font-black tracking-tight text-blue-700">{annual.avgRecommendedPartTime.toFixed(1)}</p>
              <p className="text-[10px] font-bold text-blue-600 mt-1 uppercase tracking-wider">{t('workforce.annual.kpi.avgPTSub')}</p>
            </Card>
            <Card className={cn(
              "p-5 border",
              annual.annualDelta < 0 ? "bg-emerald-50 border-emerald-200" : annual.annualDelta > 0 ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200",
            )}>
              <p className={cn(
                "text-[10px] font-black uppercase tracking-widest mb-2",
                annual.annualDelta < 0 ? "text-emerald-700" : annual.annualDelta > 0 ? "text-rose-700" : "text-slate-600",
              )}>{t('workforce.annual.kpi.annualDelta')}</p>
              <p className={cn(
                "text-2xl font-black tracking-tight",
                annual.annualDelta < 0 ? "text-emerald-700" : annual.annualDelta > 0 ? "text-rose-700" : "text-slate-700",
              )}>
                {annual.annualDelta >= 0 ? '+' : '−'}{fmtIQD(annual.annualDelta)}
              </p>
              <p className={cn(
                "text-[10px] font-bold mt-1",
                annual.annualDelta < 0 ? "text-emerald-600" : annual.annualDelta > 0 ? "text-rose-600" : "text-slate-500",
              )}>IQD / yr</p>
            </Card>
          </div>

          {/* Method note */}
          <Card className="p-4 bg-blue-50/50 border-blue-100 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black text-blue-800 uppercase tracking-widest">{t('workforce.method.title')}</p>
              <p className="text-[11px] text-blue-700 leading-relaxed mt-1">{t('workforce.annual.method.body')}</p>
            </div>
          </Card>

          {/* ── Monthly demand chart ───────────────────────────────────── */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" /> {t('workforce.annual.chart.title')}
              </h3>
              <p className="text-[10px] text-slate-500">{t('workforce.annual.chart.tip')}</p>
            </div>
            <MonthlyDemandChart
              months={annual.byMonth}
              peakMonthIndex={annual.peakMonthIndex}
              valleyMonthIndex={annual.valleyMonthIndex}
              activeMonthIndex={drillMonthIndex}
              onPickMonth={setDrillMonthIndex}
            />
            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-[10px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-slate-500">{t('workforce.annual.chart.peakLabel')}: <span className="font-bold text-slate-800">{annual.byMonth[annual.peakMonthIndex - 1].monthName}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-slate-500">{t('workforce.annual.chart.valleyLabel')}: <span className="font-bold text-slate-800">{annual.byMonth[annual.valleyMonthIndex - 1].monthName}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-slate-500">{t('workforce.annual.chart.activeLabel')}: <span className="font-bold text-slate-800">{drillMonth.monthName}</span></span>
              </div>
            </div>
          </Card>

          {/* ── Per-role breakdown for the picked drill month ──────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                {t('workforce.annual.drill.header', { month: drillMonth.monthName })}
              </h3>
              <p className="text-[10px] text-slate-500">{t('workforce.annual.drill.subtitle')}</p>
            </div>
            <div className="space-y-3">
              {drillMonth.plan.byRole.map(r => <RoleCard key={r.role} role={r} fmtIQD={fmtIQD} />)}
            </div>
          </div>

          {/* ── Implementation timing ─────────────────────────────────── */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-600" /> {t('workforce.annual.timing.title')}
              </h3>
              <p className="text-[10px] text-slate-500 mt-1">{t('workforce.annual.timing.subtitle')}</p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {annual.savingsByStartMonth.map(row => {
                  const isSaving = row.savings > 0;
                  const isNeutral = row.savings === 0;
                  return (
                    <div
                      key={row.monthIndex}
                      className={cn(
                        "p-3 rounded-xl border transition-all",
                        isNeutral ? "bg-slate-50 border-slate-200"
                          : isSaving ? "bg-emerald-50 border-emerald-200"
                            : "bg-rose-50 border-rose-200",
                      )}
                    >
                      <p className={cn(
                        "text-[10px] font-black uppercase tracking-widest",
                        isNeutral ? "text-slate-500" : isSaving ? "text-emerald-700" : "text-rose-700",
                      )}>
                        {t('workforce.annual.timing.startIn', { month: row.monthName })}
                      </p>
                      <p className={cn(
                        "text-lg font-black mt-1",
                        isNeutral ? "text-slate-700" : isSaving ? "text-emerald-700" : "text-rose-700",
                      )}>
                        {isSaving ? '+' : row.savings < 0 ? '−' : ''}{fmtIQD(row.savings)}
                      </p>
                      <p className={cn(
                        "text-[9px] font-bold uppercase tracking-wider mt-0.5",
                        isNeutral ? "text-slate-500" : isSaving ? "text-emerald-600" : "text-rose-600",
                      )}>
                        IQD · {row.remainingMonths} {row.remainingMonths === 1 ? t('workforce.annual.timing.monthLeft') : t('workforce.annual.timing.monthsLeft')}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed mt-4 italic">{t('workforce.annual.timing.footnote')}</p>
            </div>
          </Card>

          {/* Footer CTA */}
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

// 12-bar monthly demand chart with peak/valley highlighting and click-to-pick
// drill behaviour. Stays simple — no axis labels other than the month name
// inside the bar.
function MonthlyDemandChart({
  months, peakMonthIndex, valleyMonthIndex, activeMonthIndex, onPickMonth,
}: {
  months: MonthlyPlanSummary[];
  peakMonthIndex: number;
  valleyMonthIndex: number;
  activeMonthIndex: number;
  onPickMonth: (idx: number) => void;
}) {
  const max = Math.max(1, ...months.map(m => m.monthlyRequiredHours));
  return (
    <div className="grid grid-cols-12 gap-1.5">
      {months.map(m => {
        const heightPct = Math.max(4, Math.round((m.monthlyRequiredHours / max) * 100));
        const isPeak = m.monthIndex === peakMonthIndex;
        const isValley = m.monthIndex === valleyMonthIndex;
        const isActive = m.monthIndex === activeMonthIndex;
        const tone = isPeak ? 'bg-rose-500'
          : isValley ? 'bg-emerald-500'
          : isActive ? 'bg-blue-500'
          : 'bg-slate-300';
        return (
          <button
            key={m.monthIndex}
            onClick={() => onPickMonth(m.monthIndex)}
            className={cn(
              "flex flex-col items-stretch group transition-all rounded-lg p-1.5",
              isActive ? "bg-blue-50/60" : "hover:bg-slate-50",
            )}
            title={`${m.monthName}: ${Math.round(m.monthlyRequiredHours).toLocaleString()}h required · ${m.recommendedFTE} FTE + ${m.recommendedPartTime} PT`}
          >
            <div className="flex items-end h-24">
              <div
                className={cn("w-full rounded-md transition-all", tone, isActive && "ring-2 ring-blue-500 ring-offset-1")}
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <p className={cn(
              "text-[10px] font-black mt-1.5 text-center uppercase tracking-widest",
              isActive ? "text-blue-700" : "text-slate-600",
            )}>{m.monthName}</p>
            <p className="text-[9px] font-mono text-center text-slate-500 leading-tight">
              {Math.round(m.monthlyRequiredHours).toLocaleString()}h
            </p>
          </button>
        );
      })}
    </div>
  );
}

function RoleCard({ role, fmtIQD }: { role: RoleDemand; fmtIQD: (n: number) => string }) {
  const { t } = useI18n();
  void fmtIQD;
  const [expanded, setExpanded] = useState(false);
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
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-4 border-b border-slate-100 flex items-center gap-4 hover:bg-slate-50/50 transition-colors text-left"
      >
        <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
          <Briefcase className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-slate-800 tracking-tight">{role.role}</h3>
          <p className="text-[10px] text-slate-500 font-mono">
            {role.monthlyRequiredHours.toFixed(0)}h {t('workforce.role.required')} · {role.currentCount} {t('workforce.role.currentShort')} → {role.recommendedFTE} FTE + {role.recommendedPartTime} PT
          </p>
        </div>
        <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border", actionTone.bg, actionTone.border)}>
          <ActionIcon className={cn("w-3.5 h-3.5", actionTone.text)} />
          <span className={cn("text-[10px] font-black uppercase tracking-widest", actionTone.text)}>{actionLabel}</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <>
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-slate-100">
            <KpiBlock label={t('workforce.role.current')} value={role.currentCount.toString()} />
            <KpiBlock label={t('workforce.role.recommendedFTE')} value={role.recommendedFTE.toString()} tone="emerald" />
            <KpiBlock label={t('workforce.role.recommendedPT')} value={role.recommendedPartTime.toString()} tone="blue" />
            <KpiBlock
              label={t('workforce.role.delta')}
              value={`${role.delta > 0 ? '+' : ''}${role.delta}`}
              tone={role.delta > 0 ? 'rose' : role.delta < 0 ? 'emerald' : 'neutral'}
              hint={role.action === 'hire' ? t('workforce.role.hireBy', { count: role.delta })
                : role.action === 'release' ? t('workforce.role.releaseBy', { count: Math.abs(role.delta) })
                : t('workforce.role.matchesNeed')}
            />
          </div>

          <div className="p-5 bg-slate-50/40 border-b border-slate-100 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-700 leading-relaxed">{role.reasoning}</p>
          </div>

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
        </>
      )}
    </Card>
  );
}

function KpiBlock({ label, value, tone = 'neutral', hint }: { label: string; value: string; tone?: 'emerald' | 'blue' | 'rose' | 'neutral'; hint?: string }) {
  const valueClass =
    tone === 'emerald' ? 'text-emerald-700'
    : tone === 'blue' ? 'text-blue-700'
    : tone === 'rose' ? 'text-rose-700'
    : 'text-slate-800';
  return (
    <div>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={cn("text-2xl font-black", valueClass)}>{value}</p>
      {hint && <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">{hint}</p>}
    </div>
  );
}
