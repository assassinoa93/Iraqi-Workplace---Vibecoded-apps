/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lazy Firebase initialization. The Firebase SDK is only imported when Online
 * mode is selected; Offline Demo mode never pays the bundle cost. Config is
 * read from Vite env vars (VITE_FIREBASE_*) — these are public client-side
 * identifiers, not secrets. Security is enforced by Auth + Firestore rules.
 */

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { getStoredConfig } from './firebaseConfigStorage';

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;

function readConfig(): FirebaseConfig | null {
  // Build-time env vars (.env.local) take precedence so existing setups keep
  // working unchanged. localStorage is the runtime fallback used when a
  // super-admin connects from another device or a user pastes the team's
  // config in-app — see OnlineSetup.tsx.
  const env = import.meta.env;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  if (apiKey && authDomain && projectId && appId) {
    return {
      apiKey,
      authDomain,
      projectId,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
      appId,
    };
  }
  return getStoredConfig();
}

export function isFirebaseConfigured(): boolean {
  return readConfig() !== null;
}

/**
 * Returns the currently-active Firebase config (env vars OR localStorage),
 * or null if none is set. Used by Settings → "Generate Connection Code"
 * so the super-admin can share their setup regardless of which path
 * (.env.local or in-app paste) wired it up.
 */
export function getActiveConfig(): FirebaseConfig | null {
  return readConfig();
}

export async function getFirebaseApp(): Promise<FirebaseApp> {
  if (cachedApp) return cachedApp;
  const config = readConfig();
  if (!config) throw new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars.');
  const { initializeApp, getApps, getApp } = await import('firebase/app');
  cachedApp = getApps().length ? getApp() : initializeApp(config);
  return cachedApp;
}

export async function getFirebaseAuth(): Promise<Auth> {
  if (cachedAuth) return cachedAuth;
  const app = await getFirebaseApp();
  const { getAuth, browserLocalPersistence, setPersistence } = await import('firebase/auth');
  const auth = getAuth(app);
  // browserLocalPersistence is the SDK default; setting it explicitly makes
  // the intent obvious — sessions survive app restarts on the same machine.
  await setPersistence(auth, browserLocalPersistence);
  cachedAuth = auth;
  return cachedAuth;
}
