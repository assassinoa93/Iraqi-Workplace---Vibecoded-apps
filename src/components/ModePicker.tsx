/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * First-launch screen: picks between Offline Demo (current local-first
 * behavior) and Connect Online (Firestore-backed multi-user). The choice
 * persists in localStorage so subsequent launches go straight to the chosen
 * mode. Switching modes prompts a restart from Settings.
 */

import React from 'react';
import { Database, Cloud } from 'lucide-react';
import { setMode, AppMode } from '../lib/mode';
import { isFirebaseConfigured } from '../lib/firebase';
import { cn } from '../lib/utils';

interface Props {
  onPick: (mode: AppMode) => void;
}

export function ModePicker({ onPick }: Props) {
  const onlineAvailable = isFirebaseConfigured();

  const choose = (mode: AppMode) => {
    setMode(mode);
    onPick(mode);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-50 mb-2 tracking-tight">
            Iraqi Labor Scheduler
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Choose how you want to use the app
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => choose('offline')}
            className="apple-press text-left p-8 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-xl transition-all group"
          >
            <div className="w-14 h-14 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center mb-6 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/25 transition-colors">
              <Database className="w-7 h-7 text-emerald-600 dark:text-emerald-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-2">Offline Demo</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              Single-user, fully local. Data stays on this machine. No internet
              required. Perfect for evaluating the app or working without a
              connection.
            </p>
            <ul className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
              <li>· No login required</li>
              <li>· Data in %APPDATA%\IraqiLaborScheduler</li>
              <li>· All features available</li>
            </ul>
          </button>

          <button
            onClick={() => onlineAvailable && choose('online')}
            disabled={!onlineAvailable}
            className={cn(
              "apple-press text-left p-8 bg-white dark:bg-slate-900 border-2 rounded-2xl transition-all group",
              onlineAvailable
                ? "border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-xl cursor-pointer"
                : "border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed"
            )}
          >
            <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center mb-6 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/25 transition-colors">
              <Cloud className="w-7 h-7 text-blue-600 dark:text-blue-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-2">Connect Online</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              Multi-user via Firebase. Site managers and supervisors collaborate
              on shared data. Works offline mid-session — edits queue locally
              and sync up when the connection returns.
            </p>
            <ul className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
              <li>· Email + password sign-in</li>
              <li>· Roles: super-admin / admin / supervisor</li>
              <li>· Auto-sync, offline-resilient</li>
            </ul>
            {!onlineAvailable && (
              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-rose-500 dark:text-rose-400">
                Firebase not configured · See .env.example
              </p>
            )}
          </button>
        </div>
        <p className="mt-10 text-center text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-600 font-medium">
          You can switch modes later from Settings
        </p>
      </div>
    </div>
  );
}
