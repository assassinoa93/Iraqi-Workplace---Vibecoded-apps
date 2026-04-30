/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lazy Firestore client. Loaded only when Online mode is active (per the
 * `getDb()` accessor below). Configures persistent local cache so reads
 * are served instantly from IndexedDB and writes queue locally when the
 * client is offline — exactly the offline-first behaviour the user
 * requires for unreliable Iraqi internet.
 *
 * Design notes:
 *   - We use the v9 modular SDK with `initializeFirestore` + `persistentLocalCache`
 *     (the modern replacement for `enableIndexedDbPersistence`, which is
 *     deprecated). The single-tab manager is correct here because Electron
 *     opens one BrowserWindow per session.
 *   - Cache survives process restarts (data lives in Electron's IndexedDB
 *     which is in `app.getPath('userData')` — sandboxed in dev to
 *     `.dev-userdata/` per the Phase 1 isolation work).
 *   - getDb() throws if Firebase isn't configured. Callers should only
 *     invoke it inside the online-mode branch in App.tsx (when
 *     `useAuth().isAuthenticated === true`), so this never fires in
 *     Offline mode.
 */

import type { Firestore } from 'firebase/firestore';
import { getFirebaseApp } from './firebase';

let cachedDb: Firestore | null = null;
let pendingDb: Promise<Firestore> | null = null;

export async function getDb(): Promise<Firestore> {
  if (cachedDb) return cachedDb;
  if (pendingDb) return pendingDb;
  pendingDb = (async () => {
    const app = await getFirebaseApp();
    const { initializeFirestore, persistentLocalCache, persistentSingleTabManager, getFirestore } =
      await import('firebase/firestore');
    let db: Firestore;
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentSingleTabManager({}),
        }),
      });
    } catch (err) {
      // initializeFirestore throws if it has already been initialised on
      // this app instance (e.g. HMR in dev, or a previous getDb() call
      // raced past the cache). Fall back to the existing instance.
      console.warn('[firestoreClient] initializeFirestore failed, falling back to getFirestore:', err);
      db = getFirestore(app);
    }
    cachedDb = db;
    return db;
  })();
  try {
    return await pendingDb;
  } finally {
    pendingDb = null;
  }
}
