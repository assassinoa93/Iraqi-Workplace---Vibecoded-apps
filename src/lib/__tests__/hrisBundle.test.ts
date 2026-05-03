import { describe, it, expect } from 'vitest';
import { assembleHrisBundle, buildBundleFilename } from '../hrisBundle';
import type { Employee, Shift, Schedule, Config, Station, PublicHoliday, Violation } from '../../types';
import type { ApprovalBlock } from '../firestoreSchedules';

// v5.1.0 — bundle assembly tests. We don't try to reproduce a full schedule
// month here; we wire up a minimal-but-realistic input set, run the
// assembler, then unzip the result and assert the file roster + manifest
// shape. JSZip can read its own output back with .loadAsync, so the
// round-trip is honest end-to-end coverage.

const baseEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  empId: 'E1', name: 'Test Employee', role: 'Operator', department: 'Warehouse',
  contractType: 'Permanent', contractedWeeklyHrs: 48,
  shiftEligibility: '', isHazardous: false, isIndustrialRotating: false, hourExempt: false,
  fixedRestDay: 0, phone: '', hireDate: '2024-01-01', notes: '',
  eligibleStations: [], holidayBank: 0, annualLeaveBalance: 0,
  baseMonthlySalary: 1500000, baseHourlyRate: 7000, overtimeHours: 0,
  ...overrides,
});

const baseConfig: Config = {
  year: 2026,
  month: 4,
  daysInMonth: 30,
  weeklyHrsCap: 48,
  dailyHrsCap: 11,
  minDailyRestHrs: 11,
  maxConsecWorkDays: 6,
  driverDailyHrsCap: 9,
  driverWeeklyHrsCap: 56,
  driverContinuousDrivingHrsCap: 4.5,
  driverMinDailyRestHrs: 11,
  driverMaxConsecWorkDays: 6,
  ramadanEnabled: false,
  ramadanStartDate: '',
  ramadanEndDate: '',
  ramadanDailyCap: 6,
  art86NightStart: '22:00',
  art86NightEnd: '07:00',
};

const baseApproval: ApprovalBlock = {
  status: 'saved',
  submittedAt: 1715000000000,
  submittedBy: 'uid-supervisor',
  submittedByName: 'Mohammed Al-Rashid',
  submittedByPosition: 'Shift Supervisor',
  submittedNotes: 'Initial submit',
  lockedAt: 1715100000000,
  lockedBy: 'uid-manager',
  lockedByName: 'Ali Hussein',
  lockedByPosition: 'Floor Manager',
  savedAt: 1715200000000,
  savedBy: 'uid-admin',
  savedByName: 'Layla Fawzi',
  savedByPosition: 'HR Director',
  history: [
    { action: 'submit', ts: 1715000000000, actor: 'uid-supervisor', actorEmail: 's@example.com', actorName: 'Mohammed Al-Rashid', actorPosition: 'Shift Supervisor', role: 'supervisor', destinationStatus: 'submitted' },
    { action: 'lock', ts: 1715100000000, actor: 'uid-manager', actorEmail: 'm@example.com', actorName: 'Ali Hussein', actorPosition: 'Floor Manager', role: 'manager', destinationStatus: 'locked' },
    { action: 'save', ts: 1715200000000, actor: 'uid-admin', actorEmail: 'a@example.com', actorName: 'Layla Fawzi', actorPosition: 'HR Director', role: 'admin', destinationStatus: 'saved' },
  ],
};

const buildInputs = () => {
  const employees: Employee[] = [
    baseEmployee({ empId: 'E1', name: 'Test Employee 1' }),
    baseEmployee({ empId: 'E2', name: 'Test Employee 2', role: 'Driver', category: 'Driver' }),
  ];
  const schedule: Schedule = {
    'E1': { 1: { shiftCode: 'M' }, 2: { shiftCode: 'A' } },
    'E2': { 1: { shiftCode: 'N' }, 5: { shiftCode: 'AL' }, 6: { shiftCode: 'AL' }, 7: { shiftCode: 'AL' } },
  };
  const shifts: Shift[] = [
    { code: 'M', name: 'Morning', startTime: '06:00', endTime: '14:00', durationHrs: 8, color: 'bg-blue-500', isOvertime: false, isOvernight: false },
    { code: 'A', name: 'Afternoon', startTime: '14:00', endTime: '22:00', durationHrs: 8, color: 'bg-amber-500', isOvertime: false, isOvernight: false },
    { code: 'N', name: 'Night', startTime: '22:00', endTime: '06:00', durationHrs: 8, color: 'bg-indigo-500', isOvertime: false, isOvernight: true },
  ];
  const stations: Station[] = [];
  const holidays: PublicHoliday[] = [];
  const violations: Violation[] = [
    { empId: 'E1', day: 3, rule: 'TEST_RULE', article: 'Art. 67', message: 'test violation', severity: 'violation' },
    { empId: 'E2', day: 5, rule: 'TEST_INFO', article: 'Art. 67', message: 'test info', severity: 'info' },
  ];
  return {
    companyId: 'co-test', companyName: 'Test Company',
    monthLabel: 'April 2026', yyyymm: '2026-04',
    year: 2026, month: 4, daysInMonth: 30,
    schedule, employees, shifts, stations, holidays, config: baseConfig, violations,
    approval: baseApproval,
    exportedByUid: 'uid-admin',
    exportedByName: 'Layla Fawzi',
    exportedByPosition: 'HR Director',
    exportedByEmail: 'a@example.com',
  };
};

describe('assembleHrisBundle', () => {
  it('produces a non-empty zip blob', async () => {
    const blob = await assembleHrisBundle(buildInputs());
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/zip');
  });

  it('contains the documented six files', async () => {
    const blob = await assembleHrisBundle(buildInputs());
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(['README.txt', 'compliance.json', 'leaves.csv', 'manifest.json', 'roster.csv', 'schedule.csv']);
  });

  it('manifest carries the full approval lineage with names + positions', async () => {
    const blob = await assembleHrisBundle(buildInputs());
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifestText = await zip.file('manifest.json')!.async('string');
    const manifest = JSON.parse(manifestText);
    expect(manifest.version).toBe('5.1.0');
    expect(manifest.company).toEqual({ id: 'co-test', name: 'Test Company' });
    expect(manifest.month.yyyymm).toBe('2026-04');
    expect(manifest.exportedBy.name).toBe('Layla Fawzi');
    expect(manifest.exportedBy.position).toBe('HR Director');
    expect(manifest.approvalLineage.submitted.name).toBe('Mohammed Al-Rashid');
    expect(manifest.approvalLineage.locked.name).toBe('Ali Hussein');
    expect(manifest.approvalLineage.saved.name).toBe('Layla Fawzi');
    expect(manifest.approvalLineage.history).toHaveLength(3);
    expect(manifest.approvalLineage.history[0].action).toBe('submit');
  });

  it('schedule.csv has one header + one row per employee with shift codes by day', async () => {
    const blob = await assembleHrisBundle(buildInputs());
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const csv = await zip.file('schedule.csv')!.async('string');
    const lines = csv.trim().split(/\r?\n/);
    expect(lines).toHaveLength(3); // header + 2 employees
    expect(lines[0]).toContain('Employee ID');
    expect(lines[0]).toContain('Day 1');
    expect(lines[0]).toContain('Day 30');
    // E1 row: M on day 1, A on day 2
    expect(lines[1]).toMatch(/^E1,/);
    expect(lines[1].split(',')[4]).toBe('M');
    expect(lines[1].split(',')[5]).toBe('A');
  });

  it('leaves.csv flattens painted AL ranges (E2 has AL days 5–7)', async () => {
    const blob = await assembleHrisBundle(buildInputs());
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const csv = await zip.file('leaves.csv')!.async('string');
    const lines = csv.trim().split(/\r?\n/);
    // Should have header + 1 row for E2's painted AL run
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const dataRow = lines.find((l) => l.startsWith('E2,'));
    expect(dataRow).toBeTruthy();
    expect(dataRow).toContain('annual');
    expect(dataRow).toContain('painted');
  });

  it('compliance.json reports the right counts + score', async () => {
    const blob = await assembleHrisBundle(buildInputs());
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const text = await zip.file('compliance.json')!.async('string');
    const compliance = JSON.parse(text);
    expect(compliance.hardViolations).toBe(1);
    expect(compliance.infoFindings).toBe(1);
    expect(compliance.score).toBe(98); // 100 - 1*2
    expect(compliance.findings).toHaveLength(2);
  });

  it('CSV cells with commas and quotes are properly escaped', async () => {
    const inputs = buildInputs();
    inputs.employees[0].name = 'Doe, "John"';
    inputs.employees[0].notes = 'has, "stuff"';
    const blob = await assembleHrisBundle(inputs);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const roster = await zip.file('roster.csv')!.async('string');
    // Wrapped + internal quotes doubled — same shape exportScheduleCSV produces.
    expect(roster).toContain('"Doe, ""John"""');
  });
});

describe('buildBundleFilename', () => {
  it('produces the canonical pattern HRIS_<companyId>_<yyyymm>.zip', () => {
    expect(buildBundleFilename('2026-04', 'co-iraqi-mall')).toBe('HRIS_co-iraqi-mall_2026-04.zip');
  });
});
