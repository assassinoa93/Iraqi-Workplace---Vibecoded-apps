/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Firebase Auth context. Subscribes to onAuthStateChanged, hydrates the
 * user's role + allowed-companies from custom claims, and exposes a small
 * useAuth() API. Outside an AuthProvider (i.e. in Offline Demo mode) the
 * default context returns role=null which means "no auth, treat as full
 * access" — App.tsx uses this to keep its existing behaviour unchanged.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { getFirebaseAuth } from './firebase';
import type { TabPerms } from './tabAccess';
import { tabAccess as computeTabAccess, canRead as computeCanRead, canWrite as computeCanWrite } from './tabAccess';

// v5.0 — `manager` is the first-tier validator role. Sits between admin and
// supervisor: locks supervisor-submitted schedules so an admin can finalize
// them. Scoped by `allowedCompanies` claim like supervisors.
export type Role = 'super_admin' | 'admin' | 'manager' | 'supervisor';

export interface AuthState {
  // null in offline mode (no auth applied) or while loading.
  user: User | null;
  role: Role | null;
  // null means "all companies" (super_admin, admin) or "no auth" (offline).
  // An empty array means "explicitly scoped to none" — should not happen.
  allowedCompanies: string[] | null;
  // Per-tab access overrides loaded from /users/{uid}.tabPerms. null when
  // none set — falls back to TAB_DEFAULTS_BY_ROLE in tabAccess().
  tabPerms: TabPerms | null;
  // v5.0.2 — human identity for approval-trail attribution. Shown in the
  // schedule banner / approvals queue / history viewer instead of UID.
  // Both nullable: a user with no profile fields falls back to email.
  displayName: string | null;
  position: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  // True only when AuthProvider is mounted (online mode). Helps components
  // decide whether to render auth-only UI like the Sign-out button.
  isAuthenticated: boolean;
}

const defaultState: AuthState = {
  user: null,
  role: null,
  allowedCompanies: null,
  tabPerms: null,
  displayName: null,
  position: null,
  loading: false,
  signIn: async () => { throw new Error('AuthProvider not mounted'); },
  signOut: async () => { /* no-op in offline mode */ },
  isAuthenticated: false,
};

const AuthContext = createContext<AuthState>(defaultState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [allowedCompanies, setAllowedCompanies] = useState<string[] | null>(null);
  const [tabPerms, setTabPerms] = useState<TabPerms | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    let unsubUserDoc: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const auth = await getFirebaseAuth();
        const { onAuthStateChanged } = await import('firebase/auth');
        unsubAuth = onAuthStateChanged(auth, async (u) => {
          if (cancelled) return;
          setUser(u);
          // Tear down the previous user-doc subscription whenever the
          // signed-in user changes (sign-out, account switch).
          unsubUserDoc?.();
          unsubUserDoc = undefined;
          setTabPerms(null);
          setDisplayName(u?.displayName ?? null);
          setPosition(null);

          if (u) {
            try {
              const tokenResult = await u.getIdTokenResult();
              const claims = tokenResult.claims as { role?: string; companies?: string[] };
              // v5.0.2 — recognise 'manager' alongside the original three.
              // Pre-v5.0.2 a user with role='manager' fell through to null
              // and was treated as offline-mode (full access).
              const r = (
                claims.role === 'super_admin' ||
                claims.role === 'admin' ||
                claims.role === 'manager' ||
                claims.role === 'supervisor'
              ) ? claims.role as Role : null;
              setRole(r);
              if (r === 'super_admin' || r === 'admin') {
                setAllowedCompanies(null);
              } else if ((r === 'supervisor' || r === 'manager') && Array.isArray(claims.companies)) {
                setAllowedCompanies(claims.companies);
              } else {
                setAllowedCompanies([]);
              }

              // Subscribe to /users/{uid} for tabPerms + displayName + position.
              // Live updates so a super-admin tweaking perms or job-title in
              // one tab reflects on the user's session within ~1s without a
              // re-login.
              try {
                const { getDb } = await import('./firestoreClient');
                const { doc, onSnapshot } = await import('firebase/firestore');
                const db = await getDb();
                unsubUserDoc = onSnapshot(
                  doc(db, 'users', u.uid),
                  (snap) => {
                    if (cancelled) return;
                    const data = snap.exists() ? snap.data() : null;
                    const perms = data?.tabPerms;
                    if (perms && typeof perms === 'object') {
                      // Trust but normalize — drop any value that isn't a
                      // valid TabAccess literal.
                      const clean: TabPerms = {};
                      for (const [k, v] of Object.entries(perms)) {
                        if (v === 'none' || v === 'read' || v === 'full') clean[k] = v;
                      }
                      setTabPerms(Object.keys(clean).length ? clean : null);
                    } else {
                      setTabPerms(null);
                    }
                    // Doc-level displayName overrides Auth's, since the
                    // super-admin's edit form writes to the doc (single
                    // source of truth for the human-identity fields).
                    const docName = typeof data?.displayName === 'string' ? data.displayName : null;
                    setDisplayName(docName ?? u.displayName ?? null);
                    setPosition(typeof data?.position === 'string' ? data.position : null);
                  },
                  () => { /* permission-denied or transient — ignore, fall back to role default */ },
                );
              } catch {
                // Firestore unavailable in this env — role defaults are fine.
              }
            } catch {
              setRole(null);
              setAllowedCompanies([]);
            }
          } else {
            setRole(null);
            setAllowedCompanies(null);
            setDisplayName(null);
            setPosition(null);
          }
          setLoading(false);
        });
      } catch (err) {
        console.error('[auth] failed to initialise Firebase Auth', err);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      unsubAuth?.();
      unsubUserDoc?.();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const auth = await getFirebaseAuth();
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    const auth = await getFirebaseAuth();
    const { signOut: fbSignOut } = await import('firebase/auth');
    await fbSignOut(auth);
  };

  const value = useMemo<AuthState>(() => ({
    user, role, allowedCompanies, tabPerms, displayName, position, loading,
    signIn, signOut,
    isAuthenticated: true,
  }), [user, role, allowedCompanies, tabPerms, displayName, position, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

// Legacy role-only tab map — kept for any call sites that haven't moved
// to the per-tab permissions API. New code should prefer
// `tabAllowed(tab, role, tabPerms)` (3-arg form) below or the helpers
// from `src/lib/tabAccess.ts` directly.
export const TAB_PERMISSIONS: Record<string, Role[]> = {
  dashboard:  ['super_admin', 'admin', 'supervisor'],
  schedule:   ['super_admin', 'admin', 'supervisor'],
  roster:     ['super_admin', 'admin', 'supervisor'],
  payroll:    ['super_admin', 'admin'],
  coverageOT: ['super_admin', 'admin', 'supervisor'],
  workforce:  ['super_admin', 'admin'],
  reports:    ['super_admin', 'admin'],
  layout:     ['super_admin', 'admin', 'supervisor'],
  shifts:     ['super_admin', 'admin', 'supervisor'],
  holidays:   ['super_admin', 'admin', 'supervisor'],
  variables:  ['super_admin', 'admin'],
  audit:      ['super_admin', 'admin'],
  settings:   ['super_admin', 'admin', 'supervisor'],
  superAdmin: ['super_admin'],
  userManagement: ['super_admin'],
};

/**
 * True if the role (with optional per-user tabPerms override) has at
 * least read access to `tab`. Use this for sidebar visibility.
 */
export function tabAllowed(tab: string, role: Role | null, tabPerms?: TabPerms | null): boolean {
  return computeCanRead(tab, role, tabPerms ?? null);
}

/**
 * True if the user can edit / add / delete inside `tab`. Use this to
 * gate "+ Add", "Save", and destructive buttons.
 */
export function tabWritable(tab: string, role: Role | null, tabPerms?: TabPerms | null): boolean {
  return computeCanWrite(tab, role, tabPerms ?? null);
}

/**
 * Re-export the underlying access enum lookup for components that
 * want the tri-state ('none' | 'read' | 'full') directly.
 */
export const tabAccess = computeTabAccess;
