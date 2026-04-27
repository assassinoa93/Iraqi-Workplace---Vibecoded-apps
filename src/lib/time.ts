// Hour parsing for the HH:mm strings used throughout the app's data model.
// Consolidated here so we don't duplicate `parseInt(x.split(':')[0])` in every
// view. The auto-scheduler uses these on its hot path; if you change the
// signature, profile that loop before merging.

import type { Config, DayOfWeek } from '../types';

export interface HourBounds {
  open: number;
  close: number;
}

// Returns the hour component (0-23) of an "HH:mm" string. Returns 0 for
// malformed input so a bad data row doesn't crash the renderer; the
// EmployeeModal / StationModal validate at write time.
export function parseHour(hhmm: string | undefined): number {
  if (!hhmm) return 0;
  const n = parseInt(hhmm.split(':')[0], 10);
  return Number.isFinite(n) ? n : 0;
}

// Convenience for the (open, close) pairs we use on stations and shifts.
export function parseHourBounds(start: string, end: string): HourBounds {
  return { open: parseHour(start), close: parseHour(end) };
}

// Returns the operating window for a given calendar date, honoring the
// optional per-day-of-week override on Config. Falls back to
// shopOpeningTime / shopClosingTime when no override is set for that day.
// `dayOfWeek` is 1=Sun..7=Sat to match the app's convention.
export function getOperatingHoursForDow(
  config: Pick<Config, 'shopOpeningTime' | 'shopClosingTime' | 'operatingHoursByDayOfWeek'>,
  dayOfWeek: DayOfWeek,
): { open: string; close: string } {
  const override = config.operatingHoursByDayOfWeek?.[dayOfWeek];
  if (override && override.open && override.close) return override;
  return {
    open: config.shopOpeningTime || '11:00',
    close: config.shopClosingTime || '23:00',
  };
}
