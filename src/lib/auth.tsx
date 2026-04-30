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

export type Role = 'super_admin' | 'admin' | 'supervisor';

export interface AuthState {
  // null in offline mode (no auth applied) or while loading.
  user: User | null;
  role: Role | null;
  // null means "all companies" (super_admin, admin) or "no auth" (offline).
  // An empty array means "explicitly scoped to none" — should not happen.
  allowedCompanies: string[] | null;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const auth = await getFirebaseAuth();
        const { onAuthStateChanged } = await import('firebase/auth');
        unsub = onAuthStateChanged(auth, async (u) => {
          if (cancelled) return;
          setUser(u);
          if (u) {
            try {
              const tokenResult = await u.getIdTokenResult();
              const claims = tokenResult.claims as { role?: string; companies?: string[] };
              const r = (claims.role === 'super_admin' || claims.role === 'admin' || claims.role === 'supervisor')
                ? claims.role as Role
                : null;
              setRole(r);
              // super_admin and admin have access to all companies — represent
              // that as null. Supervisor must have an explicit list.
              if (r === 'super_admin' || r === 'admin') {
                setAllowedCompanies(null);
              } else if (r === 'supervisor' && Array.isArray(claims.companies)) {
                setAllowedCompanies(claims.companies);
              } else {
                setAllowedCompanies([]);
              }
            } catch {
              setRole(null);
              setAllowedCompanies([]);
            }
          } else {
            setRole(null);
            setAllowedCompanies(null);
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
      unsub?.();
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
    user, role, allowedCompanies, loading,
    signIn, signOut,
    isAuthenticated: true,
  }), [user, role, allowedCompanies, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

// Tab visibility map. Offline mode (role === null) sees everything — the
// existing single-user product is unchanged. Online mode filters based on
// the role custom claim.
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
  variables:  ['super_admin', 'admin'], // admin sees but cannot edit (read-only)
  audit:      ['super_admin', 'admin'],
  settings:   ['super_admin', 'admin', 'supervisor'],
};

export function tabAllowed(tab: string, role: Role | null): boolean {
  if (role === null) return true; // offline mode / no auth
  const allowed = TAB_PERMISSIONS[tab];
  return allowed ? allowed.includes(role) : true;
}
