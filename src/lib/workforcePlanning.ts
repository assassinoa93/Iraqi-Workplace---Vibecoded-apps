import { Employee, Shift, Station, PublicHoliday, Config } from '../types';
import { format, getDaysInMonth } from 'date-fns';
import { parseHour, getOperatingHoursForDow } from './time';
import { monthlyHourCap } from './payroll';

// Mirrored from compliance.ts (which keeps this private). Driver caps under
// Iraqi Labor Law Art. 88 — 56h weekly. Mirroring is fine: the constant
// rarely changes and we'd otherwise need to widen the export.
const DRIVER_WEEKLY_CAP_DEFAULT = 56;

// Compute the ideal workforce composition for a venue, given its stations,
// operating windows, peak/non-peak split, and public holidays. This is the
// "what should my roster look like for optimal coverage with least cost?"
// answer surfaced on the Workforce Planning tab.
//
// Approach (per role):
//   1. Sum the demand-hours each station with that role contributes for each
//      day of the active month. Day's hours = open window × required HC,
//      using peakMinHC on peak days / holidays and normalMinHC otherwise.
//   2. Split demand into peak vs non-peak so the recommendation can mix
//      FTEs (carry the non-peak baseline) with part-timers (cover the peak
//      surge). When peak demand is materially higher than non-peak, a PT
//      strategy is cheaper than scaling FTE for peak — that's the levered
//      recommendation here.
//   3. Compare to the current roster (employees grouped by role/category)
//      and emit a hire/release/hold action with the IQD impact.
//
// All math is per-month in the active config (config.year, config.month).

export const PART_TIME_MONTHLY_HOURS = 96; // 24h/week × 4 — common Iraqi PT contract
export const PART_TIME_MONTHLY_SALARY_IQD_RATIO = 0.5; // PT salary roughly 50% of FTE
export const PEAK_LIFT_THRESHOLD = 1.25; // peak ÷ non-peak ratio above which PT mix kicks in

export type WorkforceRole = 'Driver' | 'Standard' | string; // concrete role names also allowed

export interface StationDemand {
  stationId: string;
  stationName: string;
  monthlyHours: number;
  peakHours: number;
  nonPeakHours: number;
  // Average required HC per peak/non-peak day (peakMinHC and normalMinHC) —
  // helps the UI explain "why N FTE for this station?".
  peakMinHC: number;
  normalMinHC: number;
  openHrsPerDay: number;
}

export interface RoleDemand {
  role: WorkforceRole;
  // Cap used for FTE math. Drivers use Art. 88 weekly × 4; everyone else
  // uses standard cap (Art. 67/70). Hazardous staff would need a different
  // cap but stations don't carry that flag — supervisor handles manually.
  cap: number;
  monthlyRequiredHours: number;
  peakRequiredHours: number;
  nonPeakRequiredHours: number;
  byStation: StationDemand[];
  // Recommendation
  idealFTE: number;          // ceil(monthly / cap) — the "all FTE" answer
  recommendedFTE: number;    // FTE component of the suggested mix
  recommendedPartTime: number; // PT component of the suggested mix
  // Short text explaining why this mix was chosen.
  reasoning: string;
  // Current roster comparison (filled in after merge).
  currentCount: number;
  delta: number;             // positive = need to hire; negative = excess
  action: 'hire' | 'release' | 'hold';
}

export interface WorkforcePlan {
  byRole: RoleDemand[];
  totalIdealFTE: number;
  totalRecommendedFTE: number;
  totalRecommendedPartTime: number;
  totalCurrentEmployees: number;
  // Estimated monthly payroll for the recommended mix vs the current roster.
  recommendedMonthlySalary: number;
  currentMonthlySalary: number;
  monthlyDelta: number;      // recommended - current (negative = save money)
}

interface AnalyzeArgs {
  employees: Employee[];
  shifts: Shift[];
  stations: Station[];
  holidays: PublicHoliday[];
  config: Config;
  // Pull in venue-wide opening windows; per-station openTime/closeTime
  // overrides take precedence when present.
  isPeakDay: (day: number) => boolean;
}

// Length of a station's open window in hours, handling overnight (close < open)
// by wrapping through midnight. e.g. 22:00–05:00 → 7 hours.
function stationOpenHours(st: Station): number {
  const open = parseHour(st.openingTime);
  const close = parseHour(st.closingTime);
  if (close > open) return close - open;
  // Overnight close (e.g. 22:00 → 05:00 = 7h)
  return (24 - open) + close;
}

// Compute each station's monthly demand split by peak vs non-peak.
function stationDemand(args: AnalyzeArgs): Map<string, StationDemand> {
  const { stations, config, isPeakDay } = args;
  const out = new Map<string, StationDemand>();
  const daysInMonth = getDaysInMonth(new Date(config.year, config.month - 1, 1));

  for (const st of stations) {
    let peakHours = 0;
    let nonPeakHours = 0;
    const openHrs = stationOpenHours(st);
    if (openHrs <= 0) {
      out.set(st.id, {
        stationId: st.id, stationName: st.name,
        monthlyHours: 0, peakHours: 0, nonPeakHours: 0,
        peakMinHC: st.peakMinHC, normalMinHC: st.normalMinHC,
        openHrsPerDay: 0,
      });
      continue;
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const peak = isPeakDay(day);
      const minHC = peak ? st.peakMinHC : st.normalMinHC;
      if (minHC <= 0) continue;
      // Hours across the open window × headcount = labour demand.
      const dayHours = openHrs * minHC;
      if (peak) peakHours += dayHours;
      else nonPeakHours += dayHours;
    }
    out.set(st.id, {
      stationId: st.id, stationName: st.name,
      monthlyHours: peakHours + nonPeakHours,
      peakHours, nonPeakHours,
      peakMinHC: st.peakMinHC, normalMinHC: st.normalMinHC,
      openHrsPerDay: openHrs,
    });
  }
  // Suppress unused-import warning during development.
  void format; void getOperatingHoursForDow;
  return out;
}

// Group station demand by role: Driver stations (requiredRoles includes
// 'Driver') roll up to 'Driver'. All others roll up to either the explicit
// `requiredRoles[0]` concrete role (e.g. 'Cashier') or to 'Standard' if
// none specified. This matches the auto-scheduler's eligibility model.
function rollupByRole(stations: Station[], demand: Map<string, StationDemand>): Map<string, StationDemand[]> {
  const out = new Map<string, StationDemand[]>();
  const isGenericRole = (r: string) => r === '' || r === 'Standard';
  for (const st of stations) {
    const d = demand.get(st.id);
    if (!d || d.monthlyHours <= 0) continue;
    let role: string;
    if (st.requiredRoles?.includes('Driver')) {
      role = 'Driver';
    } else {
      const explicit = st.requiredRoles?.find(r => !isGenericRole(r));
      role = explicit || 'Standard';
    }
    if (!out.has(role)) out.set(role, []);
    out.get(role)!.push(d);
  }
  return out;
}

// Decide FTE/PT mix for a role. The rule: if peak demand is > PEAK_LIFT_THRESHOLD
// times the non-peak demand, route the surge to part-timers (paid pro-rata,
// usually no full benefits) and size FTEs to the non-peak baseline. Otherwise
// fill everything with FTEs since the load is roughly flat.
function recommendMix(monthlyRequiredHours: number, peakHrs: number, nonPeakHrs: number, cap: number): {
  recommendedFTE: number;
  recommendedPartTime: number;
  reasoning: string;
} {
  if (monthlyRequiredHours <= 0) {
    return { recommendedFTE: 0, recommendedPartTime: 0, reasoning: '' };
  }

  const idealFTE = Math.ceil(monthlyRequiredHours / cap);

  // Edge case: no peak (all non-peak demand). All FTE.
  if (peakHrs === 0) {
    return {
      recommendedFTE: idealFTE,
      recommendedPartTime: 0,
      reasoning: 'Flat demand — pure FTE coverage.',
    };
  }
  // Edge case: no non-peak. Demand is entirely surge — FTEs would idle most
  // of the time, so PT-only.
  if (nonPeakHrs === 0) {
    const ptCount = Math.ceil(peakHrs / PART_TIME_MONTHLY_HOURS);
    return {
      recommendedFTE: 0,
      recommendedPartTime: ptCount,
      reasoning: 'Demand only on peak days — part-time covers the surge without paying for idle time.',
    };
  }

  const lift = peakHrs / nonPeakHrs;
  if (lift < PEAK_LIFT_THRESHOLD) {
    // Demand is roughly flat across peak/non-peak — FTEs are efficient.
    return {
      recommendedFTE: idealFTE,
      recommendedPartTime: 0,
      reasoning: `Peak only ${(lift * 100).toFixed(0)}% of non-peak demand — FTE-only is efficient.`,
    };
  }

  // Peak surge. Size FTEs to the non-peak baseline so they're never idle on
  // off-peak days. Part-timers cover the peak excess.
  const fteCount = Math.ceil(nonPeakHrs / cap);
  const ftePeakCoverage = fteCount * cap; // FTEs cover this many hours total
  // Hours still needed during peak = peakHrs minus what FTEs already covered
  // from their normal allocation. We assume FTEs prioritize their non-peak
  // schedule; whatever's left of their cap goes to peak.
  const fteHoursAvailableForPeak = Math.max(0, ftePeakCoverage - nonPeakHrs);
  const peakUncovered = Math.max(0, peakHrs - fteHoursAvailableForPeak);
  const ptCount = Math.ceil(peakUncovered / PART_TIME_MONTHLY_HOURS);

  return {
    recommendedFTE: fteCount,
    recommendedPartTime: ptCount,
    reasoning: `Peak demand is ${(lift * 100).toFixed(0)}% of non-peak — ${fteCount} FTE for the baseline + ${ptCount} part-timer(s) for the surge is cheaper than scaling FTE.`,
  };
}

// Count current employees by role. Drivers go to 'Driver'; others go to
// their `role` field if it's set and concrete, otherwise to 'Standard'.
// This mirrors `rollupByRole` so the comparison is apples-to-apples.
function currentByRole(employees: Employee[]): Map<string, number> {
  const out = new Map<string, number>();
  const isGenericRole = (r: string) => r === '' || r === 'Standard';
  for (const e of employees) {
    let key: string;
    if (e.category === 'Driver') key = 'Driver';
    else if (e.role && !isGenericRole(e.role)) key = e.role;
    else key = 'Standard';
    out.set(key, (out.get(key) || 0) + 1);
  }
  return out;
}

export function analyzeWorkforce(args: AnalyzeArgs): WorkforcePlan {
  const { employees, stations, config } = args;
  const stdCap = monthlyHourCap(config);
  const driverCap = (config.driverWeeklyHrsCap ?? DRIVER_WEEKLY_CAP_DEFAULT) * 4;

  const demand = stationDemand(args);
  const grouped = rollupByRole(stations, demand);
  const current = currentByRole(employees);

  // Average IQD/mo — used to estimate the savings/cost of the recommended
  // mix vs the current roster.
  const avgFTESalary = employees.length > 0
    ? Math.round(employees.reduce((s, e) => s + (e.baseMonthlySalary || 0), 0) / employees.length)
    : 1_500_000;
  const avgPartTimeSalary = Math.round(avgFTESalary * PART_TIME_MONTHLY_SALARY_IQD_RATIO);

  const byRole: RoleDemand[] = [];
  // Track which roles we've handled so we can also emit "release" rows for
  // current roles with zero recommended demand.
  const handledRoles = new Set<string>();

  for (const [role, stationsForRole] of grouped) {
    const monthlyRequiredHours = stationsForRole.reduce((s, x) => s + x.monthlyHours, 0);
    const peakRequiredHours = stationsForRole.reduce((s, x) => s + x.peakHours, 0);
    const nonPeakRequiredHours = stationsForRole.reduce((s, x) => s + x.nonPeakHours, 0);
    const cap = role === 'Driver' ? driverCap : stdCap;
    const idealFTE = Math.ceil(monthlyRequiredHours / cap);
    const mix = recommendMix(monthlyRequiredHours, peakRequiredHours, nonPeakRequiredHours, cap);
    const currentCount = current.get(role) || 0;
    const recommendedTotal = mix.recommendedFTE + mix.recommendedPartTime;
    const delta = recommendedTotal - currentCount;
    const action: RoleDemand['action'] = delta > 0 ? 'hire' : delta < 0 ? 'release' : 'hold';
    byRole.push({
      role, cap,
      monthlyRequiredHours, peakRequiredHours, nonPeakRequiredHours,
      byStation: [...stationsForRole].sort((a, b) => b.monthlyHours - a.monthlyHours),
      idealFTE,
      recommendedFTE: mix.recommendedFTE,
      recommendedPartTime: mix.recommendedPartTime,
      reasoning: mix.reasoning,
      currentCount, delta, action,
    });
    handledRoles.add(role);
  }
  // Roles present in the roster but not represented by any station demand
  // (typical: leftover role labels after a station rename). Surface as
  // "release" candidates so the supervisor knows to consolidate.
  for (const [role, count] of current) {
    if (handledRoles.has(role)) continue;
    byRole.push({
      role, cap: role === 'Driver' ? driverCap : stdCap,
      monthlyRequiredHours: 0, peakRequiredHours: 0, nonPeakRequiredHours: 0,
      byStation: [],
      idealFTE: 0,
      recommendedFTE: 0, recommendedPartTime: 0,
      reasoning: 'No station demand for this role this month — consider reassigning or releasing.',
      currentCount: count, delta: -count, action: 'release',
    });
  }

  // Sort by absolute delta so the biggest changes float to the top.
  byRole.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const totalIdealFTE = byRole.reduce((s, r) => s + r.idealFTE, 0);
  const totalRecommendedFTE = byRole.reduce((s, r) => s + r.recommendedFTE, 0);
  const totalRecommendedPartTime = byRole.reduce((s, r) => s + r.recommendedPartTime, 0);
  const totalCurrentEmployees = employees.length;
  const recommendedMonthlySalary = totalRecommendedFTE * avgFTESalary + totalRecommendedPartTime * avgPartTimeSalary;
  const currentMonthlySalary = employees.reduce((s, e) => s + (e.baseMonthlySalary || 0), 0);
  const monthlyDelta = recommendedMonthlySalary - currentMonthlySalary;

  return {
    byRole,
    totalIdealFTE,
    totalRecommendedFTE,
    totalRecommendedPartTime,
    totalCurrentEmployees,
    recommendedMonthlySalary,
    currentMonthlySalary,
    monthlyDelta,
  };
}
