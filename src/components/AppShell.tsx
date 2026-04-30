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
import { OnlineSetup } from './OnlineSetup';
import { AuthProvider, useAuth } from '../lib/auth';
import { getMode, AppMode } from '../lib/mode';
import { isFirebaseConfigured } from '../lib/firebase';

function OnlineGate({ onSwitchDatabase }: { onSwitchDatabase: () => void }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <p className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Loading…</p>
      </div>
    );
  }
  if (!user) return <LoginScreen onSwitchDatabase={onSwitchDatabase} />;
  return <App />;
}

export function AppShell() {
  const [mode, setModeState] = useState<AppMode | null>(() => getMode());
  // `configured` is read on every render, not pinned in state. The user
  // pasting a config from OnlineSetup mutates localStorage; we re-render
  // by bumping `configBump` and the `isFirebaseConfigured()` check picks
  // up the new value naturally.
  const [configBump, setConfigBump] = useState(0);
  // forceSetup: when true, route to OnlineSetup even though a config is
  // saved. Triggered by the "Switch / add database" button on LoginScreen
  // and by the "Add another database" flow in Settings — both use cases
  // where the user is signed out (or just signed out) and wants to pick
  // a different project.
  const [forceSetup, setForceSetup] = useState(false);
  const configured = isFirebaseConfigured();

  if (!mode) {
    return <ModePicker onPick={setModeState} />;
  }

  if (mode === 'offline') {
    return <App />;
  }

  if (!configured || forceSetup) {
    return (
      <OnlineSetup
        onConfigured={() => {
          setForceSetup(false);
          setConfigBump((b) => b + 1);
          // A different active config means the cached Firebase singletons
          // (auth + app + Firestore) are now pointing at the WRONG project.
          // The cleanest reset is a full page reload — same pattern as
          // "switch mode" / "relink config" elsewhere in the app.
          location.reload();
        }}
        onCancel={configured ? () => setForceSetup(false) : undefined}
      />
    );
  }

  // Bump key forces AuthProvider to re-init when a fresh config lands so
  // the SDK reads the new credentials.
  return (
    <AuthProvider key={configBump}>
      <OnlineGate onSwitchDatabase={() => setForceSetup(true)} />
    </AuthProvider>
  );
}
