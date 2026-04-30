/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Persistence layer for Firebase Web SDK configs that the user pastes in-app
 * (instead of editing .env.local). Two needs this serves:
 *
 *   1. A super-admin connecting from a second machine without redoing the
 *      full Firebase setup.
 *   2. A regular user joining a team setup with one paste.
 *
 * The 6 VITE_FIREBASE_* values are PUBLIC client identifiers — they ship in
 * any Firebase web app's bundle. Persisting them in localStorage is no
 * riskier than baking them into the build. Real security comes from
 * Firestore rules + Auth + (optional) API key restrictions in Google Cloud.
 *
 * ── Multi-database support (Phase 3.5) ────────────────────────────────────
 *
 * Earlier versions stored a single config under `iraqi-scheduler-firebase-config`
 * as the raw object. Now we keep a list of saved configs (one per Firebase
 * project the user has connected to) plus an "active" pointer, so the user
 * can:
 *   - Manage multiple companies/branches with separate Firebase projects.
 *   - Switch between them from Settings without re-pasting credentials.
 *   - Add a brand-new project even when one is already configured (i.e.
 *     the OnlineSetup pick screen + wizard remain reachable from the
 *     in-app "Add another database" button).
 *
 * The legacy single-config shape is auto-migrated on first read. The
 * `getStoredConfig()` / `setStoredConfig()` API is preserved as
 * "active-entry shorthand" so existing call sites work unchanged — they
 * read or replace the active entry's config.
 */

export interface StoredFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface StoredConfigEntry {
  /** Stable id — defaults to projectId; user can rename without changing this. */
  id: string;
  /** User-facing label, shown in the database switcher. */
  label: string;
  config: StoredFirebaseConfig;
  addedAt: number;
}

interface StoredConfigsState {
  active: string | null; // id of the active entry, or null when empty
  entries: StoredConfigEntry[];
}

const LEGACY_KEY = 'iraqi-scheduler-firebase-config';
const KEY = 'iraqi-scheduler-firebase-configs-v2';

// ── Migration + read ────────────────────────────────────────────────────

function readState(): StoredConfigsState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredConfigsState;
      if (parsed && Array.isArray(parsed.entries)) {
        // Defensive normalize: drop entries missing required fields.
        const entries = parsed.entries
          .filter((e) => e && e.id && e.config && e.config.apiKey && e.config.projectId && e.config.appId)
          .map((e) => ({
            id: String(e.id),
            label: String(e.label ?? e.config.projectId),
            config: normalizeConfig(e.config),
            addedAt: typeof e.addedAt === 'number' ? e.addedAt : Date.now(),
          }));
        const active = parsed.active && entries.find((e) => e.id === parsed.active)
          ? parsed.active
          : (entries[0]?.id ?? null);
        return { active, entries };
      }
    }
  } catch {
    // fall through to legacy migration
  }

  // Legacy single-config migration. The original v3.0 storage put one
  // config object under LEGACY_KEY; promote it to a single-entry list.
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const cfg = JSON.parse(legacyRaw);
      if (cfg?.apiKey && cfg?.authDomain && cfg?.projectId && cfg?.appId) {
        const entry: StoredConfigEntry = {
          id: String(cfg.projectId),
          label: String(cfg.projectId),
          config: normalizeConfig(cfg),
          addedAt: Date.now(),
        };
        const state: StoredConfigsState = { active: entry.id, entries: [entry] };
        writeState(state);
        try { localStorage.removeItem(LEGACY_KEY); } catch { /* best-effort */ }
        return state;
      }
    }
  } catch {
    // fall through to empty
  }

  return { active: null, entries: [] };
}

function writeState(state: StoredConfigsState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore — quota errors are unrecoverable; OnlineSetup will re-prompt
  }
}

function normalizeConfig(cfg: Partial<StoredFirebaseConfig>): StoredFirebaseConfig {
  return {
    apiKey: String(cfg.apiKey ?? ''),
    authDomain: String(cfg.authDomain ?? ''),
    projectId: String(cfg.projectId ?? ''),
    storageBucket: String(cfg.storageBucket ?? ''),
    messagingSenderId: String(cfg.messagingSenderId ?? ''),
    appId: String(cfg.appId ?? ''),
  };
}

// ── Multi-config API ────────────────────────────────────────────────────

export function getStoredConfigs(): StoredConfigsState {
  return readState();
}

export function getActiveStoredEntry(): StoredConfigEntry | null {
  const s = readState();
  if (!s.active) return null;
  return s.entries.find((e) => e.id === s.active) ?? null;
}

/**
 * Adds a new entry OR replaces the existing one with the same projectId,
 * and marks it active. Returns the entry's id.
 *
 * "Replace if same project" matches the natural mental model: pasting the
 * same firebaseConfig you already had isn't a new database, it's a relink.
 * Pasting a config for a different projectId is a genuinely new entry.
 */
export function addOrReplaceStoredConfig(cfg: StoredFirebaseConfig, label?: string): string {
  const normalized = normalizeConfig(cfg);
  if (!normalized.projectId) throw new Error('config has no projectId');
  const state = readState();
  const id = normalized.projectId;
  const existingIdx = state.entries.findIndex((e) => e.id === id);
  if (existingIdx >= 0) {
    state.entries[existingIdx] = {
      ...state.entries[existingIdx],
      config: normalized,
      label: label ?? state.entries[existingIdx].label,
    };
  } else {
    state.entries.push({
      id,
      label: label ?? normalized.projectId,
      config: normalized,
      addedAt: Date.now(),
    });
  }
  state.active = id;
  writeState(state);
  return id;
}

export function setActiveStoredConfig(id: string): void {
  const state = readState();
  if (!state.entries.some((e) => e.id === id)) return;
  state.active = id;
  writeState(state);
}

export function renameStoredConfig(id: string, label: string): void {
  const state = readState();
  const idx = state.entries.findIndex((e) => e.id === id);
  if (idx < 0) return;
  state.entries[idx] = { ...state.entries[idx], label };
  writeState(state);
}

export function removeStoredConfig(id: string): void {
  const state = readState();
  const remaining = state.entries.filter((e) => e.id !== id);
  const wasActive = state.active === id;
  state.entries = remaining;
  if (wasActive) {
    state.active = remaining[0]?.id ?? null;
  }
  writeState(state);
}

// ── Legacy single-config API (preserved for unchanged call sites) ───────
//
// These read/write the ACTIVE entry. Pre-multi-config call sites that just
// asked "what's the current config?" get the active one; ones that wrote
// a config get add-or-replace semantics.

export function getStoredConfig(): StoredFirebaseConfig | null {
  return getActiveStoredEntry()?.config ?? null;
}

export function setStoredConfig(cfg: StoredFirebaseConfig): void {
  try { addOrReplaceStoredConfig(cfg); } catch { /* see comment in writeState */ }
}

export function clearStoredConfig(): void {
  // Clears the ACTIVE entry only — the multi-config API has removeStoredConfig
  // for targeted removal. Pre-3.5 call sites used this for "relink" UX, where
  // dropping the active entry is the expected behavior.
  const active = getActiveStoredEntry();
  if (active) removeStoredConfig(active.id);
}

// ── Parsers (unchanged from earlier phases) ─────────────────────────────

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
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
}

/**
 * Connection Code (Phase 3.1) — a single shareable string that encodes the
 * full firebaseConfig. Format: `ils-connect:<base64-json>`.
 *
 * Why a custom prefix instead of raw base64? So callers can auto-detect
 * input type without trying to decode it first — and so a user staring at
 * the string in chat can tell what it's for.
 */
const CONNECTION_CODE_PREFIX = 'ils-connect:';

export function encodeConnectionCode(cfg: StoredFirebaseConfig): string {
  const json = JSON.stringify(cfg);
  return CONNECTION_CODE_PREFIX + btoa(json);
}

export function isConnectionCode(input: string): boolean {
  return !!input && input.trim().startsWith(CONNECTION_CODE_PREFIX);
}

export function decodeConnectionCode(input: string): StoredFirebaseConfig | null {
  if (!isConnectionCode(input)) return null;
  try {
    const b64 = input.trim().slice(CONNECTION_CODE_PREFIX.length);
    const json = atob(b64);
    const parsed = JSON.parse(json);
    if (!parsed?.apiKey || !parsed?.authDomain || !parsed?.projectId || !parsed?.appId) return null;
    return normalizeConfig(parsed);
  } catch {
    return null;
  }
}

export function parseAnyConfigInput(input: string): StoredFirebaseConfig | null {
  return decodeConnectionCode(input) ?? parseFirebaseConfigBlob(input);
}
