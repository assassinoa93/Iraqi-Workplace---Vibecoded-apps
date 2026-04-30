/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * True clean-slate factory reset.
 *
 * Wipes EVERY local trace so the next launch boots into the mode picker
 * as if the app had just been installed:
 *
 *   - signed-in Firebase Auth session (IndexedDB-persisted)
 *   - all locally-saved Firebase configs (multi-database list)
 *   - service-account JSONs in <userData>/firebase-admin/
 *   - Firestore IndexedDB persistent cache
 *   - Express server's data files (offline mode)
 *   - localStorage + sessionStorage (mode picker, locale, dark-mode, etc.)
 *
 * Critically: this function navigates away (location.reload) at the end,
 * so it never returns. Don't put code after it. The reason: even after
 * we localStorage.clear(), live React effects (e.g. the activeCompanyId
 * persistence effect) can fire one more time and re-write the value
 * before the SPA tears down. Three defenses:
 *
 *   1. Monkey-patch localStorage.setItem to a no-op for the rest of the
 *      page's life so straggling effects can't repopulate.
 *   2. Reload immediately after the clears — no setTimeout, no info modal.
 *   3. Order ops so the SDK is signed-out / quiesced before storage clears.
 *
 * Server-side state is NOT touched: Firestore data, Firebase Auth users,
 * security rules, indexes all persist. Factory reset is a *local* clean
 * slate, not a project teardown.
 */

import { wipeLocalSecrets, isAvailable as adminAvailable } from './adminApi';

export async function factoryResetClean(isOnline: boolean): Promise<void> {
  // Defense (1): replace localStorage.setItem with a no-op for the rest
  // of this page's life. Any React effect / Firebase SDK callback that
  // tries to repopulate state during the brief gap before reload now
  // silently fails. We don't restore the original — the page is about
  // to navigate away anyway.
  try {
    const ls = window.localStorage;
    Object.defineProperty(ls, 'setItem', {
      value: () => { /* no-op during factory reset */ },
      writable: true,
      configurable: true,
    });
  } catch { /* best-effort */ }

  // 1. Sign out Firebase Auth so the cached refresh token can't auto-
  //    rehydrate the session on next boot. No-op offline.
  if (isOnline) {
    try {
      const { getFirebaseAuth } = await import('./firebase');
      const { signOut } = await import('firebase/auth');
      const auth = await getFirebaseAuth();
      await signOut(auth);
    } catch { /* best-effort */ }
  }

  // 2. Tear down any live Firestore connection so its IndexedDB stops
  //    being held open. Without this, deleteDatabase calls below go
  //    into "blocked" state and the cache survives the wipe.
  if (isOnline) {
    try {
      const { getDb } = await import('./firestoreClient');
      const { terminate, clearIndexedDbPersistence } = await import('firebase/firestore');
      const db = await getDb();
      await terminate(db);
      try { await clearIndexedDbPersistence(db); } catch { /* best-effort */ }
    } catch { /* best-effort */ }
  }

  // 3. Tell the Express server (offline mode) to wipe its data files.
  //    Failure here is non-fatal — the local clears below still happen.
  if (!isOnline) {
    try {
      await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE_ALL_DATA' }),
      }).then((r) => (r.ok ? r.json() : Promise.reject(r)));
    } catch { /* best-effort */ }
  }

  // 4. Wipe service-account JSONs from <userData>/firebase-admin/
  //    via the Electron main-process IPC bridge.
  if (adminAvailable()) {
    try { await wipeLocalSecrets(); } catch { /* best-effort */ }
  }

  // 5. Clear localStorage AND sessionStorage. setItem is now a no-op
  //    (defense #1) so any React effect that fires before reload can't
  //    repopulate. clear() works normally — it's removeItem-style, not
  //    setItem-style, and we didn't shim it.
  try { window.localStorage.clear(); } catch { /* best-effort */ }
  try { window.sessionStorage.clear(); } catch { /* best-effort */ }

  // 6. Delete IndexedDB databases. Firestore's persistent cache, the
  //    Firebase Auth state, and any other client SDK that uses IDB
  //    all live here.
  try {
    const idb = (typeof indexedDB !== 'undefined' && indexedDB) as IDBFactory | null;
    if (idb) {
      // @ts-ignore — databases() isn't in older lib types
      const list: { name?: string }[] = typeof idb.databases === 'function'
        ? await idb.databases()
        : [];
      const names = list.map((d) => d.name).filter((n): n is string => !!n);
      const knownFirebase = [
        'firebaseLocalStorageDb',
        'firebase-installations-database',
        'firebase-heartbeat-database',
        'firestore/[DEFAULT]/main',
      ];
      const toDelete = new Set([...names, ...knownFirebase]);
      await Promise.all(Array.from(toDelete).map((name) => new Promise<void>((resolve) => {
        const req = idb.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      })));
    }
  } catch { /* best-effort */ }

  // 7. Hard reload. Defense (2): immediately, no setTimeout, no info
  //    modal — both would yield to React render passes that could
  //    re-write storage we just cleared.
  window.location.reload();
}
