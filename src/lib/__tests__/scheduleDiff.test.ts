import { describe, it, expect } from 'vitest';
import { diffScheduleVsSnapshot, summarizeDiffMap } from '../firestoreSchedules';
import type { Schedule } from '../../types';

// v5.1.0 — re-approval diff view tests. The diff is a small pure function,
// but it sits behind a UI toggle that reviewers rely on to spot what
// changed since the last archived save — so the boundary cases need
// nailing down (empty/empty, code-only-change vs station-only-change,
// added vs removed vs modified attribution, supervisor-removed-then-
// re-added cells, etc.).

const cell = (shiftCode: string, stationId?: string) => ({ shiftCode, stationId });

describe('diffScheduleVsSnapshot', () => {
  it('returns an empty map when both schedules are identical', () => {
    const sched: Schedule = {
      'E1': { 1: cell('M', 'S1'), 2: cell('A', 'S2') },
    };
    const diff = diffScheduleVsSnapshot(sched, sched);
    expect(diff.size).toBe(0);
  });

  it('returns an empty map when both schedules are empty', () => {
    const diff = diffScheduleVsSnapshot({}, {});
    expect(diff.size).toBe(0);
  });

  it('flags a cell present now but absent in the snapshot as added', () => {
    const current: Schedule = { 'E1': { 5: cell('M') } };
    const snapshot: Schedule = {};
    const diff = diffScheduleVsSnapshot(current, snapshot);
    expect(diff.size).toBe(1);
    expect(diff.get('E1:5')).toBe('added');
  });

  it('flags a cell present in the snapshot but absent now as removed', () => {
    const current: Schedule = {};
    const snapshot: Schedule = { 'E1': { 5: cell('M') } };
    const diff = diffScheduleVsSnapshot(current, snapshot);
    expect(diff.size).toBe(1);
    expect(diff.get('E1:5')).toBe('removed');
  });

  it('flags a shift-code change as modified', () => {
    const current: Schedule = { 'E1': { 5: cell('A') } };
    const snapshot: Schedule = { 'E1': { 5: cell('M') } };
    const diff = diffScheduleVsSnapshot(current, snapshot);
    expect(diff.size).toBe(1);
    expect(diff.get('E1:5')).toBe('modified');
  });

  it('does NOT flag a station-only change (visually identical to reviewer)', () => {
    const current: Schedule = { 'E1': { 5: cell('M', 'S2') } };
    const snapshot: Schedule = { 'E1': { 5: cell('M', 'S1') } };
    const diff = diffScheduleVsSnapshot(current, snapshot);
    expect(diff.size).toBe(0);
  });

  it('handles employees who only exist in current OR only in snapshot', () => {
    const current: Schedule = { 'E1': { 1: cell('M') }, 'E2': { 1: cell('A') } };
    const snapshot: Schedule = { 'E1': { 1: cell('M') }, 'E3': { 1: cell('N') } };
    const diff = diffScheduleVsSnapshot(current, snapshot);
    expect(diff.get('E2:1')).toBe('added');
    expect(diff.get('E3:1')).toBe('removed');
    expect(diff.size).toBe(2);
  });

  it('treats an empty shiftCode as no-cell — so blank → blank is not a change', () => {
    // Cells can hang around in the entries map with shiftCode = '' after a
    // user clears them; the diff must treat that as equivalent to "no cell".
    const current: Schedule = { 'E1': { 1: cell('') } };
    const snapshot: Schedule = {};
    const diff = diffScheduleVsSnapshot(current, snapshot);
    expect(diff.size).toBe(0);
  });

  it('aggregates a mixed set into the summary the banner pill reads', () => {
    const current: Schedule = {
      'E1': { 1: cell('M'), 2: cell('A') },          // added, modified (vs N)
      'E2': { 1: cell('M') },                         // unchanged
    };
    const snapshot: Schedule = {
      'E1': { 2: cell('N'), 3: cell('M') },           // E1.1 added, E1.2 modified, E1.3 removed
      'E2': { 1: cell('M') },                         // unchanged
    };
    const diff = diffScheduleVsSnapshot(current, snapshot);
    const summary = summarizeDiffMap(diff);
    expect(summary.added).toBe(1);
    expect(summary.modified).toBe(1);
    expect(summary.removed).toBe(1);
    expect(summary.total).toBe(3);
  });

  it('summarizeDiffMap on an empty map returns all zeros', () => {
    const summary = summarizeDiffMap(new Map());
    expect(summary).toEqual({ added: 0, modified: 0, removed: 0, total: 0 });
  });
});
