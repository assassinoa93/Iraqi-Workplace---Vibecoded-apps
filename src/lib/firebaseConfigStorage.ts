/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Persistence layer for the Firebase Web SDK config when the user pastes it
 * in-app instead of editing .env.local. Lets a super-admin connect from a
 * second machine without redoing the full Firebase setup, and lets a regular
 * user join the team's setup with one paste.
 *
 * The 6 VITE_FIREBASE_* values are PUBLIC client identifiers — they ship in
 * any Firebase web app's bundle. Persisting them in localStorage is no riskier
 * than baking them into the build. Real security comes from Firestore rules
 * + Auth + (optional) API key restrictions in Google Cloud Console.
 */

export interface StoredFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const KEY = 'iraqi-scheduler-firebase-config';

export function getStoredConfig(): StoredFirebaseConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.apiKey || !parsed?.authDomain || !parsed?.projectId || !parsed?.appId) {
      return null;
    }
    return {
      apiKey: String(parsed.apiKey),
      authDomain: String(parsed.authDomain),
      projectId: String(parsed.projectId),
      storageBucket: String(parsed.storageBucket ?? ''),
      messagingSenderId: String(parsed.messagingSenderId ?? ''),
      appId: String(parsed.appId),
    };
  } catch {
    return null;
  }
}

export function setStoredConfig(cfg: StoredFirebaseConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    // ignore — Online mode without a config will simply re-prompt
  }
}

export function clearStoredConfig(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Pragmatic parser that accepts any of:
 *   const firebaseConfig = { apiKey: "...", ... };
 *   { "apiKey": "...", ... }
 *   { apiKey: "...", ... }
 *
 * Pulls each known key out with a regex so a user can paste either the
 * `firebaseConfig = { ... }` snippet from Firebase Console verbatim, or
 * just the inner object — quotes / no-quotes / trailing commas all OK.
 *
 * Returns null if any required key is missing.
 */
export function parseFirebaseConfigBlob(input: string): StoredFirebaseConfig | null {
  if (!input || !input.trim()) return null;
  const pull = (key: string): string | null => {
    // Match `key: "value"`, `key: 'value'`, or `"key": "value"`
    const re = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`);
    const m = input.match(re);
    return m ? m[1] : null;
  };
  const apiKey = pull('apiKey');
  const authDomain = pull('authDomain');
  const projectId = pull('projectId');
  const storageBucket = pull('storageBucket') ?? '';
  const messagingSenderId = pull('messagingSenderId') ?? '';
  const appId = pull('appId');

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }
  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
}
