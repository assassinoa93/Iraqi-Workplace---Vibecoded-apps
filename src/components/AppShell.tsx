/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Top-level wrapper that picks between Offline Demo and Online modes.
 * - No mode chosen → ModePicker.
 * - Offline → render <App /> directly (current single-user product).
 * - Online → wrap <App /> in <AuthProvider> and gate behind <LoginScreen />.
 *
 * Design intent (per the migration plan): Offline Demo is preserved verbatim
 * as a permanent fallback / trust anchor. Online mode is additive.
 */

import React, { useState } from 'react';
import App from '../App';
import { ModePicker } from './ModePicker';
import { LoginScreen } from './LoginScreen';
import { AuthProvider, useAuth } from '../lib/auth';
import { getMode, AppMode } from '../lib/mode';

function OnlineGate() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <p className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Loading…</p>
      </div>
    );
  }
  if (!user) return <LoginScreen />;
  return <App />;
}

export function AppShell() {
  const [mode, setModeState] = useState<AppMode | null>(() => getMode());

  if (!mode) {
    return <ModePicker onPick={setModeState} />;
  }

  if (mode === 'offline') {
    return <App />;
  }

  return (
    <AuthProvider>
      <OnlineGate />
    </AuthProvider>
  );
}
