// v2.5.0 — Holiday helpers.
//
// Two transformations live here:
//
//  1. `expandHolidayDates(holidays)` — materialises multi-day holidays
//     (Eid Al-Fitr / Eid Al-Adha typically span 2-3 days) into one
//     synthetic single-day record per covered date. Existing consumers
//     match by `holiday.date === dateStr` or filter via
//     `holiday.date.startsWith('YYYY-MM-')`; pre-expanding at the entry
//     point lets all of those keep working unchanged.
//
//  2. `projectHolidaysToYear(holidays, year)` — projects every holiday to
//     the target year by replacing the year prefix (preserving month +
//     day). Both fixed-Gregorian holidays AND movable Islamic holidays
//     are projected — for budget / workforce-forecast purposes a same-
//     month-day approximation is more useful than dropping the movable
//     ones entirely (the user can refine to exact Hijri-correct dates
//     later via the Holidays tab). The return value reports how many
//     entries needed approximation so the UI can flag imprecision.
//
// Both helpers are pure and idempotent: feeding their output back in
// returns the same shape, which keeps memo dependency chains stable.

import { addDays, format, parseISO } from 'date-fns';
import { PublicHoliday } from '../types';

// Fan a holiday list into one entry per calendar day covered. Single-day
// holidays pass through with no change; a 3-day holiday becomes 3
// entries with consecutive dates and the same name/legalReference/etc.
// The synthetic entries share the parent's `id` so any code keying off
// id sees them as one logical holiday.
export function expandHolidayDates(holidays: PublicHoliday[]): PublicHoliday[] {
  const out: PublicHoliday[] = [];
  for (const h of holidays) {
    const days = Math.max(1, Math.min(14, h.durationDays ?? 1));
    if (days === 1) {
      out.push(h);
      continue;
    }
    // Parse the start date and emit one record per offset day.
    let base: Date;
    try {
      base = parseISO(h.date);
      if (Number.isNaN(base.getTime())) { out.push(h); continue; }
    } catch {
      out.push(h);
      continue;
    }
    for (let i = 0; i < days; i++) {
      const d = i === 0 ? base : addDays(base, i);
      out.push({
        ...h,
        date: format(d, 'yyyy-MM-dd'),
      });
    }
  }
  return out;
}

// Project user-defined holidays to a target year for forecast/scenario
// planning. Every holiday is shifted to the SAME month/day in the target
// year — this includes movable Islamic holidays, which is an
// approximation (the actual Hijri-determined date drifts ~11 days
// earlier each Gregorian year) but is acceptable for high-level
// workforce planning. The user can override individual holidays in the
// Holidays tab once the official Hijri schedule is announced.
//
// Returns a new array — does NOT mutate the input. Holidays are
// pre-expanded to single-day entries via `expandHolidayDates` so the
// projection respects multi-day spans correctly.
//
// `projectedFixed` and `approximatedMovable` add up to the projected
// count; the UI uses the split to show "8 fixed projected · 7 movable
// approximated" so the supervisor knows which numbers are guaranteed
// exact and which are best-effort.
export function projectHolidaysToYear(
  holidays: PublicHoliday[],
  targetYear: number,
): {
  projected: PublicHoliday[];
  projectedFixed: number;
  approximatedMovable: number;
  /** @deprecated Kept for back-compat; always 0 since v2.6 (movable holidays are now approximated, not skipped). */
  skippedMovable: number;
} {
  let projectedFixed = 0;
  let approximatedMovable = 0;
  const projected: PublicHoliday[] = [];
  // Project the source holidays first (NOT the expanded versions) so
  // multi-day holidays stay multi-day after projection.
  for (const h of holidays) {
    const parts = h.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) {
      // Malformed — skip silently.
      continue;
    }
    const sourceYear = parseInt(parts[1], 10);
    // Both fixed and movable holidays project by month/day. Movable ones
    // get an `isApproximation` marker so consumers / future UI can show
    // a tooltip clarifying the date is a same-day estimate.
    const isMovable = h.isFixed === false;
    if (sourceYear === targetYear) {
      // Already in the target year — no projection needed, pass through.
      projected.push(h);
    } else {
      projected.push({
        ...h,
        date: `${targetYear}-${parts[2]}-${parts[3]}`,
        // Annotate the projected record so the UI can render an
        // "approx" badge for movable holidays.
        isApproximation: isMovable || h.isApproximation === true,
      });
    }
    if (isMovable) approximatedMovable++; else projectedFixed++;
  }
  return { projected, projectedFixed, approximatedMovable, skippedMovable: 0 };
}
