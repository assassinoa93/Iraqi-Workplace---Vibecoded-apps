import { describe, it, expect } from 'vitest';
import { analyzeWorkforce, PART_TIME_MONTHLY_HOURS } from '../workforcePlanning';
import { Employee, Shift, Station, PublicHoliday, Config } from '../../types';

const config: Config = {
  company: 'Test', year: 2026, month: 1, daysInMonth: 31,
  weekendPolicy: 'Friday Only', weeklyRestDayPrimary: 6,
  continuousShiftsMode: 'OFF', coverageMin: 1, maxConsecWorkDays: 6,
  standardDailyHrsCap: 8, hazardousDailyHrsCap: 7,
  standardWeeklyHrsCap: 48, hazardousWeeklyHrsCap: 36,
  minRestBetweenShiftsHrs: 11, shopOpeningTime: '11:00', shopClosingTime: '23:00',
  peakDays: [5, 6, 7], holidays: [], otRateDay: 1.5, otRateNight: 2.0,
};

// peakDays = [5, 6, 7] in our 1=Sun..7=Sat convention → Thu, Fri, Sat.
// In Jan 2026 (Thu start): peak days are days 1,2,3,8,9,10,15,16,17,22,23,24,29,30,31 = 15 peak days, 16 non-peak.
const isPeakDay = (day: number) => {
  const dow = new Date(2026, 0, day).getDay() + 1;
  return [5, 6, 7].includes(dow);
};

const mkEmp = (id: string, role: string = 'Standard', category: 'Standard' | 'Driver' = 'Standard'): Employee => ({
  empId: id, name: id, role, department: 'Ops',
  contractType: 'Permanent', contractedWeeklyHrs: 48, shiftEligibility: 'All',
  isHazardous: false, isIndustrialRotating: false, hourExempt: false,
  fixedRestDay: 6, phone: '', hireDate: '2024-01-01', notes: '',
  eligibleStations: [], holidayBank: 0, annualLeaveBalance: 21,
  baseMonthlySalary: 1_500_000, baseHourlyRate: 7_812,
  overtimeHours: 0, category,
});

describe('analyzeWorkforce — empty / degenerate', () => {
  it('returns zeros when no stations exist', () => {
    const plan = analyzeWorkforce({
      employees: [], shifts: [], stations: [], holidays: [], config, isPeakDay,
    });
    expect(plan.totalIdealFTE).toBe(0);
    expect(plan.totalRecommendedFTE).toBe(0);
    expect(plan.byRole).toHaveLength(0);
  });

  it('emits zero-demand role rows for current employees with no station match', () => {
    // Roster has 2 cashiers but there are no stations needing cashiers →
    // should show a Standard "release" row.
    const plan = analyzeWorkforce({
      employees: [mkEmp('A', 'Cashier'), mkEmp('B', 'Cashier')],
      shifts: [], stations: [], holidays: [], config, isPeakDay,
    });
    const cashierRow = plan.byRole.find(r => r.role === 'Cashier');
    expect(cashierRow).toBeDefined();
    expect(cashierRow?.action).toBe('release');
    expect(cashierRow?.delta).toBe(-2);
  });
});

describe('analyzeWorkforce — flat demand → all FTE', () => {
  // Single station that needs 1 person every day, 12h open window.
  const flatStation: Station = {
    id: 'ST-A', name: 'Counter', normalMinHC: 1, peakMinHC: 1,
    openingTime: '11:00', closingTime: '23:00',
  };

  it('recommends FTE-only when peak and non-peak demand are equal', () => {
    const plan = analyzeWorkforce({
      employees: [], shifts: [], stations: [flatStation], holidays: [], config, isPeakDay,
    });
    const role = plan.byRole.find(r => r.role === 'Standard');
    expect(role).toBeDefined();
    expect(role?.recommendedPartTime).toBe(0);
    expect(role?.recommendedFTE).toBeGreaterThan(0);
    // 31 days × 12h = 372h. With 192h cap → 2 FTE.
    expect(role?.recommendedFTE).toBe(2);
  });

  it('flags hire when current roster is below the recommendation', () => {
    const plan = analyzeWorkforce({
      employees: [mkEmp('A')], shifts: [], stations: [flatStation], holidays: [], config, isPeakDay,
    });
    const role = plan.byRole.find(r => r.role === 'Standard');
    expect(role?.action).toBe('hire');
    expect(role?.delta).toBeGreaterThan(0);
  });

  it('flags release when current roster exceeds the recommendation', () => {
    const plan = analyzeWorkforce({
      employees: Array.from({ length: 5 }, (_, i) => mkEmp(`E${i}`)),
      shifts: [], stations: [flatStation], holidays: [], config, isPeakDay,
    });
    const role = plan.byRole.find(r => r.role === 'Standard');
    expect(role?.action).toBe('release');
    expect(role?.delta).toBeLessThan(0);
  });
});

describe('analyzeWorkforce — peak-heavy demand → FTE+PT mix', () => {
  // Station that needs 2 on peak days only. Non-peak needs nobody.
  const peakOnlyStation: Station = {
    id: 'ST-B', name: 'Surge Booth', normalMinHC: 0, peakMinHC: 2,
    openingTime: '11:00', closingTime: '23:00',
  };

  it('switches to part-time-only when demand only exists on peak days', () => {
    const plan = analyzeWorkforce({
      employees: [], shifts: [], stations: [peakOnlyStation], holidays: [], config, isPeakDay,
    });
    const role = plan.byRole.find(r => r.role === 'Standard');
    expect(role).toBeDefined();
    expect(role?.recommendedFTE).toBe(0);
    expect(role?.recommendedPartTime).toBeGreaterThan(0);
  });

  it('uses part-timers when peak lift exceeds the threshold', () => {
    // Station needs 2 peak / 1 non-peak. Lift = 2x → above 1.25 threshold.
    const liftedStation: Station = {
      id: 'ST-C', name: 'Lift', normalMinHC: 1, peakMinHC: 2,
      openingTime: '11:00', closingTime: '23:00',
    };
    const plan = analyzeWorkforce({
      employees: [], shifts: [], stations: [liftedStation], holidays: [], config, isPeakDay,
    });
    const role = plan.byRole.find(r => r.role === 'Standard');
    expect(role?.recommendedPartTime).toBeGreaterThan(0);
  });
});

describe('analyzeWorkforce — driver caps follow Art. 88', () => {
  const driverStation: Station = {
    id: 'ST-V1', name: 'Van', normalMinHC: 1, peakMinHC: 1,
    openingTime: '08:00', closingTime: '20:00', requiredRoles: ['Driver'],
  };

  it('uses driverWeeklyHrsCap × 4 (default 224h) for driver FTE math', () => {
    const plan = analyzeWorkforce({
      employees: [], shifts: [], stations: [driverStation], holidays: [], config, isPeakDay,
    });
    const role = plan.byRole.find(r => r.role === 'Driver');
    expect(role).toBeDefined();
    expect(role?.cap).toBe(56 * 4); // 224
    // 31 days × 12h = 372h / 224h = ceil(1.66) = 2 FTE
    expect(role?.idealFTE).toBe(2);
  });

  it('separates driver demand from standard demand when stations are mixed', () => {
    const cashier: Station = {
      id: 'ST-C1', name: 'Counter', normalMinHC: 1, peakMinHC: 1,
      openingTime: '11:00', closingTime: '23:00',
    };
    const plan = analyzeWorkforce({
      employees: [], shifts: [], stations: [driverStation, cashier], holidays: [], config, isPeakDay,
    });
    const driverRole = plan.byRole.find(r => r.role === 'Driver');
    const stdRole = plan.byRole.find(r => r.role === 'Standard');
    expect(driverRole?.idealFTE).toBeGreaterThan(0);
    expect(stdRole?.idealFTE).toBeGreaterThan(0);
  });
});

describe('analyzeWorkforce — payroll delta', () => {
  it('reports negative monthlyDelta when the recommendation has fewer FTE', () => {
    const station: Station = {
      id: 'ST-A', name: 'Counter', normalMinHC: 1, peakMinHC: 1,
      openingTime: '11:00', closingTime: '23:00',
    };
    // 5 employees but only 2 FTE actually needed → release saves money.
    const plan = analyzeWorkforce({
      employees: Array.from({ length: 5 }, (_, i) => mkEmp(`E${i}`)),
      shifts: [], stations: [station], holidays: [], config, isPeakDay,
    });
    expect(plan.monthlyDelta).toBeLessThan(0);
  });

  it('exposes the part-time monthly hours constant for the UI', () => {
    expect(PART_TIME_MONTHLY_HOURS).toBe(96);
  });
});
