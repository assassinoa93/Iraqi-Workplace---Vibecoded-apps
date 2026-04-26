import { format } from 'date-fns';
import { Employee, Shift, Station, PublicHoliday, Config, Schedule } from '../types';

interface RunArgs {
  employees: Employee[];
  shifts: Shift[];
  stations: Station[];
  holidays: PublicHoliday[];
  config: Config;
  isPeakDay: (day: number) => boolean;
}

export interface RunResult {
  schedule: Schedule;
  updatedEmployees: Employee[];
}

/**
 * Build a full month schedule by greedy day-by-day, hour-by-hour station fill.
 *
 * Three escalating strictness levels:
 *  1. Legal — respects all caps + fixed rest day + max consecutive days
 *  2. Continuity — allows OT and consecutive-day breaches but still respects fixed rest
 *  3. Emergency — only "not already working today" + station eligibility
 *
 * Drivers (category === 'Driver') use Art. 88 caps and only land on stations
 * whose requiredRoles list includes 'Driver'. Rotating-rest staff (fixedRestDay === 0)
 * are governed by maxConsecWorkDays + the rolling-7-day weekly cap; the candidate
 * sort prefers those who recently rested, distributing rest naturally across the week.
 */
export function runAutoScheduler({ employees, shifts, stations, holidays, config, isPeakDay }: RunArgs): RunResult {
  const newSchedule: Schedule = {};
  const workShifts = shifts.filter(s => s.isWork);

  if (workShifts.length === 0 || stations.length === 0) {
    throw new Error('Auto-scheduler requires shifts and stations defined.');
  }

  const consecutiveWork = new Map<string, number>();
  const totalHoursWorked = new Map<string, number>();
  const usedHolidayBankThisMonth = new Map<string, number>();
  const updatedEmployees = [...employees];

  employees.forEach(emp => {
    newSchedule[emp.empId] = {};
    consecutiveWork.set(emp.empId, 0);
    totalHoursWorked.set(emp.empId, 0);
    usedHolidayBankThisMonth.set(emp.empId, 0);
  });

  const holidayDates = new Set(holidays.map(h => h.date));

  const driverCfg = {
    dailyHrsCap: config.driverDailyHrsCap ?? 9,
    weeklyHrsCap: config.driverWeeklyHrsCap ?? 56,
    maxConsecWorkDays: config.driverMaxConsecWorkDays ?? 6,
  };

  const evaluate = (emp: Employee, day: number, shift: Shift, stationId: string, level: 1 | 2 | 3, peak: boolean, station: Station) => {
    if (newSchedule[emp.empId][day]) return false;

    const driver = emp.category === 'Driver';
    if (driver) {
      if (!station.requiredRoles?.includes('Driver')) return false;
    } else {
      const isEligible = emp.eligibleStations.length === 0 || emp.eligibleStations.includes(stationId);
      if (!isEligible) return false;
      if (station.requiredRoles?.length && !station.requiredRoles.some(r => r === emp.role || r === 'Standard')) return false;
    }

    if (driver && shift.durationHrs > driverCfg.dailyHrsCap && level < 3) return false;

    const date = new Date(config.year, config.month - 1, day);
    const dayOfWeek = date.getDay() + 1; // 1=Sun..7=Sat

    if (!peak && level < 3) {
      const currentBank = emp.holidayBank - (usedHolidayBankThisMonth.get(emp.empId) || 0);
      if (currentBank > 0 && dayOfWeek !== emp.fixedRestDay) {
        return false;
      }
    }

    const consecCap = driver ? driverCfg.maxConsecWorkDays : config.maxConsecWorkDays;

    if (level === 1) {
      // fixedRestDay === 0 means rotating; rest is enforced via maxConsecWorkDays + rolling-7 below.
      if (emp.fixedRestDay !== 0 && dayOfWeek === emp.fixedRestDay) return false;
      if ((consecutiveWork.get(emp.empId) || 0) >= consecCap) return false;

      let rolling = 0;
      for (let d = Math.max(1, day - 6); d < day; d++) {
        const entry = newSchedule[emp.empId][d];
        const s = shifts.find(sh => sh.code === entry?.shiftCode);
        if (s) rolling += s.durationHrs;
      }
      const cap = driver
        ? driverCfg.weeklyHrsCap
        : (emp.isHazardous ? config.hazardousWeeklyHrsCap : config.standardWeeklyHrsCap);
      if (rolling + shift.durationHrs > cap) return false;
    }

    if (level === 2) {
      if (emp.fixedRestDay !== 0 && dayOfWeek === emp.fixedRestDay) return false;
    }

    return true;
  };

  for (let day = 1; day <= config.daysInMonth; day++) {
    const date = new Date(config.year, config.month - 1, day);
    const isHoliday = holidayDates.has(format(date, 'yyyy-MM-dd'));
    const peak = isPeakDay(day);

    const sortedStations = [...stations].sort((a, b) => {
      const isA = a.id.startsWith('ST-C');
      const isB = b.id.startsWith('ST-C');
      if (isA !== isB) return isA ? -1 : 1;
      return 0;
    });

    const hours = Array.from({ length: 24 }, (_, i) => i);

    hours.forEach(hour => {
      sortedStations.forEach(st => {
        const sOpen = parseInt(st.openingTime.split(':')[0]);
        const sClose = parseInt(st.closingTime.split(':')[0]);
        if (hour < sOpen || hour >= sClose) return;

        let currentHC = employees.filter(e => {
          const assignment = newSchedule[e.empId][day];
          if (!assignment || assignment.stationId !== st.id) return false;
          const shift = shifts.find(s => s.code === assignment.shiftCode);
          if (!shift) return false;
          const start = parseInt(shift.start.split(':')[0]);
          const end = parseInt(shift.end.split(':')[0]);
          return hour >= start && hour < end;
        }).length;

        const requiredHC = peak ? st.peakMinHC : st.normalMinHC;

        while (currentHC < requiredHC) {
          const validShifts = workShifts
            .filter(s => {
              const start = parseInt(s.start.split(':')[0]);
              const end = parseInt(s.end.split(':')[0]);
              return hour >= start && hour < end;
            })
            .sort((a, b) => b.durationHrs - a.durationHrs);

          if (validShifts.length === 0) break;

          const sortedPool = [...employees].sort((a, b) => {
            const hA = totalHoursWorked.get(a.empId) || 0;
            const hB = totalHoursWorked.get(b.empId) || 0;
            if (Math.abs(hA - hB) > 4) return hA - hB;
            const cA = consecutiveWork.get(a.empId) || 0;
            const cB = consecutiveWork.get(b.empId) || 0;
            return cA - cB;
          });

          let assigned = false;
          for (let level of [1, 2, 3] as (1 | 2 | 3)[]) {
            for (const targetShift of validShifts) {
              const candidate = sortedPool.find(e => evaluate(e, day, targetShift, st.id, level, peak, st));
              if (candidate) {
                newSchedule[candidate.empId][day] = { shiftCode: targetShift.code, stationId: st.id };
                totalHoursWorked.set(candidate.empId, (totalHoursWorked.get(candidate.empId) || 0) + targetShift.durationHrs);
                consecutiveWork.set(candidate.empId, (consecutiveWork.get(candidate.empId) || 0) + 1);

                if (isHoliday) {
                  const idx = updatedEmployees.findIndex(e => e.empId === candidate.empId);
                  if (idx >= 0) {
                    updatedEmployees[idx] = { ...updatedEmployees[idx], holidayBank: (updatedEmployees[idx].holidayBank || 0) + 1 };
                  }
                }

                assigned = true;
                currentHC++;
                break;
              }
            }
            if (assigned) break;
          }
          if (!assigned) break; // Could not fill station
        }
      });
    });

    employees.forEach(e => {
      if (!newSchedule[e.empId][day]) {
        newSchedule[e.empId][day] = { shiftCode: 'OFF' };
        consecutiveWork.set(e.empId, 0);

        const dayOfWeek = date.getDay() + 1;

        if (!peak && dayOfWeek !== e.fixedRestDay) {
          const idx = updatedEmployees.findIndex(emp => emp.empId === e.empId);
          if (idx >= 0 && updatedEmployees[idx].holidayBank > 0) {
            updatedEmployees[idx].holidayBank -= 1;
            usedHolidayBankThisMonth.set(e.empId, (usedHolidayBankThisMonth.get(e.empId) || 0) + 1);
          }
        }
      }
    });
  }

  return { schedule: newSchedule, updatedEmployees };
}
