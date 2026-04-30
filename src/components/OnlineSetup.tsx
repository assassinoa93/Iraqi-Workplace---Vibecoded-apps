/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Online-mode onboarding screen. Shown when the user picks "Connect Online"
 * but no Firebase config has been wired up yet (no .env.local AND no
 * previously-stored localStorage config). Two paths:
 *
 *   1. First time setup — links to FIREBASE_SETUP.md so the super-admin
 *      runs the 10-step Console flow, then comes back here to paste
 *      their config.
 *   2. Returning / joining — paste an existing firebaseConfig that was
 *      already created on another device, or shared by the team's
 *      super-admin. Fills the form via the smart parser.
 *
 * Both paths land at the same paste form. On valid input, the config is
 * saved to localStorage; AppShell re-renders and proceeds to LoginScreen.
 */

import React, { useState } from 'react';
import { Cloud, ArrowLeft, AlertCircle, ExternalLink, KeyRound, Sparkles } from 'lucide-react';
import { setStoredConfig, parseFirebaseConfigBlob, StoredFirebaseConfig } from '../lib/firebaseConfigStorage';
import { clearMode } from '../lib/mode';
import { cn } from '../lib/utils';

type Step = 'pick' | 'first-time' | 'paste';

interface Props {
  onConfigured: () => void;
}

const FIELDS: Array<{ key: keyof StoredFirebaseConfig; label: string; required: boolean; placeholder: string }> = [
  { key: 'apiKey',           label: 'API key',             required: true,  placeholder: 'AIzaSy...' },
  { key: 'authDomain',       label: 'Auth domain',         required: true,  placeholder: 'your-project.firebaseapp.com' },
  { key: 'projectId',        label: 'Project ID',          required: true,  placeholder: 'your-project' },
  { key: 'appId',            label: 'App ID',              required: true,  placeholder: '1:123:web:abc' },
  { key: 'storageBucket',    label: 'Storage bucket',      required: false, placeholder: 'your-project.firebasestorage.app' },
  { key: 'messagingSenderId',label: 'Messaging sender ID', required: false, placeholder: '123456789012' },
];

const EMPTY_FIELDS: StoredFirebaseConfig = {
  apiKey: '', authDomain: '', projectId: '',
  storageBucket: '', messagingSenderId: '', appId: '',
};

export function OnlineSetup({ onConfigured }: Props) {
  const [step, setStep] = useState<Step>('pick');
  const [blob, setBlob] = useState('');
  const [fields, setFields] = useState<StoredFirebaseConfig>(EMPTY_FIELDS);
  const [error, setError] = useState<string | null>(null);

  const switchToOffline = () => {
    clearMode();
    location.reload();
  };

  const handleBlobChange = (value: string) => {
    setBlob(value);
    setError(null);
    const parsed = parseFirebaseConfigBlob(value);
    if (parsed) {
      setFields(parsed);
    }
  };

  const handleSave = () => {
    setError(null);
    const missing = FIELDS.filter(f => f.required && !fields[f.key].trim());
    if (missing.length) {
      setError(`Missing required field${missing.length > 1 ? 's' : ''}: ${missing.map(f => f.label).join(', ')}.`);
      return;
    }
    setStoredConfig({
      apiKey: fields.apiKey.trim(),
      authDomain: fields.authDomain.trim(),
      projectId: fields.projectId.trim(),
      storageBucket: fields.storageBucket.trim(),
      messagingSenderId: fields.messagingSenderId.trim(),
      appId: fields.appId.trim(),
    });
    onConfigured();
  };

  if (step === 'pick') {
    return (
      <Frame onSwitchOffline={switchToOffline}>
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center mx-auto mb-5">
            <Cloud className="w-7 h-7 text-blue-600 dark:text-blue-300" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight mb-1">Connect Online</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Is this a fresh setup or are you connecting to an existing one?
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <button
            onClick={() => setStep('first-time')}
            className="apple-press text-left p-7 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-xl transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center mb-5 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/25 transition-colors">
              <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-300" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 mb-1.5">First time setup</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Create a brand-new Firebase project for your team. We'll walk you
              through it. (You only do this once — ever.)
            </p>
          </button>

          <button
            onClick={() => setStep('paste')}
            className="apple-press text-left p-7 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-xl transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center mb-5 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/25 transition-colors">
              <KeyRound className="w-6 h-6 text-blue-600 dark:text-blue-300" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 mb-1.5">I already have one</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Connect to a Firebase project you set up before — on another
              device, or that your super-admin already configured for the team.
              Paste the config and you're in.
            </p>
          </button>
        </div>
      </Frame>
    );
  }

  if (step === 'first-time') {
    return (
      <Frame onBack={() => setStep('pick')} onSwitchOffline={switchToOffline}>
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center mx-auto mb-5">
            <Sparkles className="w-7 h-7 text-emerald-600 dark:text-emerald-300" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight mb-1">First time setup</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Create a Firebase project, then come back to paste the config
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-7 space-y-5 shadow-sm">
          <ol className="space-y-3 text-[12px] text-slate-700 dark:text-slate-300 leading-relaxed">
            <li><span className="font-bold text-slate-900 dark:text-slate-100">1.</span> Open the setup guide in this repo: <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-mono text-slate-800 dark:text-slate-200">FIREBASE_SETUP.md</code></li>
            <li><span className="font-bold text-slate-900 dark:text-slate-100">2.</span> Follow steps 1 through 9 — it's about 10 minutes of clicks in your browser plus one terminal command.</li>
            <li><span className="font-bold text-slate-900 dark:text-slate-100">3.</span> When you've finished step 5, you'll have a <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-mono text-slate-800 dark:text-slate-200">firebaseConfig</code> object. Come back here and paste it.</li>
          </ol>

          <a
            href="https://console.firebase.google.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Firebase Console
          </a>
        </div>

        <button
          onClick={() => setStep('paste')}
          className="apple-press mt-6 w-full py-3 rounded-lg text-xs font-bold uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-colors"
        >
          I've finished — paste my config
        </button>
      </Frame>
    );
  }

  // step === 'paste'
  return (
    <Frame onBack={() => setStep('pick')} onSwitchOffline={switchToOffline}>
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center mx-auto mb-5">
          <KeyRound className="w-7 h-7 text-blue-600 dark:text-blue-300" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight mb-1">Paste your Firebase config</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          From Firebase Console → Project Settings → Your apps
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-7 shadow-sm space-y-5">
        <div className="space-y-2">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Quick paste · paste the entire firebaseConfig block
          </label>
          <textarea
            value={blob}
            onChange={(e) => handleBlobChange(e.target.value)}
            rows={6}
            placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "your-project.firebaseapp.com",\n  projectId: "your-project",\n  ...\n};`}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
          />
          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
            Paste with or without quotes, with or without <code>const firebaseConfig = ...</code>. The fields below auto-fill.
          </p>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">
            Or fill in manually
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FIELDS.map(f => (
              <div key={f.key} className="space-y-1">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {f.label}{f.required && <span className="text-rose-500"> *</span>}
                </label>
                <input
                  type="text"
                  value={fields[f.key]}
                  onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
                />
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-300 mt-0.5 shrink-0" />
            <p className="text-[11px] text-rose-700 dark:text-rose-200 font-medium">{error}</p>
          </div>
        )}

        <button
          onClick={handleSave}
          className="apple-press w-full py-3 rounded-lg text-xs font-bold uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-colors"
        >
          Save and continue
        </button>
      </div>

      <p className="mt-5 text-center text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed font-medium">
        These values are public client identifiers, not secrets. They're saved
        on this device only and persist across app restarts.
      </p>
    </Frame>
  );
}

interface FrameProps {
  children: React.ReactNode;
  onBack?: () => void;
  onSwitchOffline: () => void;
}

function Frame({ children, onBack, onSwitchOffline }: FrameProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </button>
        )}
        {children}
        <button
          onClick={onSwitchOffline}
          className="mt-6 w-full text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          Switch to Offline Demo
        </button>
      </div>
    </div>
  );
}
