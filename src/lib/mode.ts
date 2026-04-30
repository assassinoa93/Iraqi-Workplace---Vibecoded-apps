/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App mode flag. Persisted in localStorage so the next launch skips the
 * mode picker. Switching modes prompts a restart from the Settings tab.
 */

export type AppMode = 'offline' | 'online';

const KEY = 'iraqi-scheduler-mode';

export function getMode(): AppMode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'offline' || v === 'online' ? v : null;
  } catch {
    return null;
  }
}

export function setMode(mode: AppMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // ignore — falling back to the picker is acceptable
  }
}

export function clearMode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
