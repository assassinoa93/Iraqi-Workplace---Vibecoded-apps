import { describe, it, expect } from 'vitest';
import { computeWorkedHours } from '../payroll';
import { Employee, Shift, Schedule } from '../../types';

const FS: Shift = { code: 'FS', name: 'Full', start: '09:00', end: '17:00', durationHrs: 8, breakMin: 30, isIndustrial: false, isHazardous: false, isWork: true, description: '' };
const OFF: Shift = { code: 'OFF', name: 'Off', start: '00:00', end: '00:00', durationHrs: 0, breakMin: 0, isIndustrial: false, isHazardous: false, isWork: false, description: '' };
const AL: Shift = { code: 'AL', name: 'Annual', start: '00:00', end: '00:00', durationHrs: 0, breakMin: 0, isIndustrial: false, isHazardous: false, isWork: false, description: '' };

const baseEmp: Employee = {
  empId: 'EMP-1', name: 'Test', role: 'Operator', department: 'Ops',
  contractType: 'Permanent', contractedWeeklyHrs: 48, shiftEligibility: 'All',
  isHazardous: false, isIndustrialRotating: false, hourExempt: false,
  fixedRestDay: 6, phone: '', hireDate: '2024-01-01', notes: '',
  eligibleStations: [], holidayBank: 0, annualLeaveBalance: 21,
  baseMonthlySalary: 1_500_000, baseHourlyRate: 7_812,
  overtimeHours: 0, category: 'Standard',
};

const cfg = { year: 2026, month: 1 };

describe('computeWorkedHours — leave-overlap exclusion', () => {
  it('sums work hours when no leave is active', () => {
    const schedule: Schedule = { 'EMP-1': { 1: { shiftCode: 'FS' }, 2: { shiftCode: 'FS' }, 3: { shiftCode: 'OFF' } } };
    expect(computeWorkedHours(baseEmp, schedule, [FS, OFF], cfg)).toBe(16);
  });

  it('excludes hours overlapping a v1.7 leaveRanges entry', () => {
    const emp = { ...baseEmp, leaveRanges: [{ id: 'l1', type: 'annual' as const, start: '2026-01-02', end: '2026-01-03' }] };
    const schedule: Schedule = { 'EMP-1': { 1: { shiftCode: 'FS' }, 2: { shiftCode: 'FS' }, 3: { shiftCode: 'FS' } } };
    expect(computeWorkedHours(emp, schedule, [FS], cfg)).toBe(8);
  });

  it('excludes hours overlapping a legacy single-range annualLeave field', () => {
    // v1.6 backup: schedule grid still shows FS shifts on the leave dates
    // because the supervisor edited the leave field before re-running the
    // auto-scheduler. Without this fix the table reported 24h worked when
    // 16h were on leave.
    const emp = { ...baseEmp, annualLeaveStart: '2026-01-02', annualLeaveEnd: '2026-01-03' };
    const schedule: Schedule = { 'EMP-1': { 1: { shiftCode: 'FS' }, 2: { shiftCode: 'FS' }, 3: { shiftCode: 'FS' } } };
    expect(computeWorkedHours(emp, schedule, [FS], cfg)).toBe(8);
  });

  it('excludes hours overlapping legacy sickLeave + maternityLeave fields', () => {
    const emp = {
      ...baseEmp,
      sickLeaveStart: '2026-01-05', sickLeaveEnd: '2026-01-05',
      maternityLeaveStart: '2026-01-10', maternityLeaveEnd: '2026-01-12',
    };
    const schedule: Schedule = {
      'EMP-1': {
        4: { shiftCode: 'FS' },
        5: { shiftCode: 'FS' },
        10: { shiftCode: 'FS' }, 11: { shiftCode: 'FS' }, 12: { shiftCode: 'FS' },
        13: { shiftCode: 'FS' },
      },
    };
    expect(computeWorkedHours(emp, schedule, [FS], cfg)).toBe(16);
  });

  it('does not double-subtract a day already painted as AL on the schedule', () => {
    // AL.isWork === false, so it's already excluded by the shift check.
    // The leave-overlap guard is just a belt for the suspenders.
    const emp = { ...baseEmp, leaveRanges: [{ id: 'l1', type: 'annual' as const, start: '2026-01-02', end: '2026-01-02' }] };
    const schedule: Schedule = { 'EMP-1': { 1: { shiftCode: 'FS' }, 2: { shiftCode: 'AL' } } };
    expect(computeWorkedHours(emp, schedule, [FS, AL], cfg)).toBe(8);
  });

  it('returns 0 for an employee with no schedule entries', () => {
    expect(computeWorkedHours(baseEmp, {}, [FS], cfg)).toBe(0);
  });
});
