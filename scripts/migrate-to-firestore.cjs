#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One-time migration: upload existing Offline-mode JSON data to Firestore.
 *
 * Reads from `%APPDATA%\Roaming\IraqiLaborScheduler\data\` (Windows) or the
 * `--source` path. Walks each company and uploads:
 *   - companies registry          → /companies/{id}
 *   - per-company employees       → /companies/{id}/employees/{empId}
 *   - per-company shifts          → /companies/{id}/shifts/{code}
 *   - per-company stations        → /companies/{id}/stations/{stationId}
 *   - per-company stationGroups   → /companies/{id}/stationGroups/{id}
 *   - per-company holidays        → /companies/{id}/holidays/{id|date}
 *   - per-company config          → /companies/{id}/config/current
 *   - per-company schedules       → /companies/{id}/schedules/{YYYY-MM}
 *   - audit log                   → /audit/{autoId}  (capped at 500 most recent)
 *
 * Idempotent — `setDoc` overwrites, so re-running with the same source
 * produces the same Firestore state. NO Firestore docs are deleted; if the
 * online project already has more docs than the local source (e.g. test
 * companies created in-app), they survive the migration.
 *
 * Usage:
 *   npm run migrate-to-firestore                       # default source path
 *   npm run migrate-to-firestore -- --source ./data    # custom source
 *   npm run migrate-to-firestore -- --dry-run          # preview, no writes
 *
 * Prerequisites (see FIREBASE_SETUP.md):
 *   - Service account JSON at ./firebase-admin/serviceAccount.json
 *   - .env.local populated (used to identify the project — admin SDK
 *     reads project_id from the service account JSON itself)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '..', 'firebase-admin', 'serviceAccount.json');

function defaultSourcePath() {
  // Windows: %APPDATA%\Roaming\IraqiLaborScheduler\data
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) {
      const p = path.join(appData, 'IraqiLaborScheduler', 'data');
      if (fs.existsSync(p)) return p;
    }
  }
  // Linux/macOS: ~/.config/IraqiLaborScheduler/data
  const homeData = path.join(os.homedir(), '.config', 'IraqiLaborScheduler', 'data');
  if (fs.existsSync(homeData)) return homeData;
  // Dev fallback: ./data in the repo root
  const repoData = path.resolve(__dirname, '..', 'data');
  if (fs.existsSync(repoData)) return repoData;
  return null;
}

function parseArgs() {
  const args = { source: null, dryRun: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--source' && process.argv[i + 1]) { args.source = process.argv[++i]; continue; }
    if (a === '--dry-run' || a === '--dryrun') { args.dryRun = true; continue; }
  }
  return args;
}

function exit(msg, code = 1) {
  console.error(`\n  ${msg}\n`);
  process.exit(code);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`[migrate] failed to parse ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Consolidate split-Eid entries that exist in legacy local data.
 * Pre-fix data had Eid al-Fitr and Eid al-Adha as 2-3 separate single-day
 * entries; the v3.1 model uses one entry with durationDays. The consolidator
 * groups by name (case-insensitive substring match) and merges into a
 * single entry on the earliest date with durationDays = span length.
 */
function consolidateHolidays(holidays) {
  if (!Array.isArray(holidays) || !holidays.length) return holidays || [];
  const groups = new Map(); // canonical-name → list
  const others = [];
  const canon = (name) => {
    const n = (name || '').toLowerCase();
    if (n.includes('eid al-fitr') || n.includes('eid al fitr')) return 'eid-al-fitr';
    if (n.includes('eid al-adha') || n.includes('eid al adha')) return 'eid-al-adha';
    return null;
  };
  for (const h of holidays) {
    const k = canon(h.name);
    if (!k) { others.push(h); continue; }
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(h);
  }
  const consolidated = [...others];
  for (const [k, list] of groups) {
    list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const first = list[0];
    if (list.length === 1) {
      consolidated.push(first);
    } else {
      // Compute span from first → last date inclusive.
      const last = list[list.length - 1];
      const start = new Date(first.date + 'T00:00:00Z').getTime();
      const end = new Date(last.date + 'T00:00:00Z').getTime();
      const days = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1);
      consolidated.push({
        ...first,
        // Strip "(Estimated)" / "Holiday" suffixes for the canonical entry.
        name: k === 'eid-al-fitr' ? 'Eid al-Fitr' : 'Eid al-Adha',
        durationDays: days,
      });
      console.log(`[migrate]   consolidated ${list.length} ${k} entries → 1 entry on ${first.date} with durationDays=${days}`);
    }
  }
  return consolidated;
}

async function main() {
  const args = parseArgs();
  const source = args.source ? path.resolve(args.source) : defaultSourcePath();

  if (!source || !fs.existsSync(source)) {
    exit(
      `Source data folder not found.\n` +
      `  Tried: ${args.source ?? '(default)'}\n` +
      `  Use --source <path> to point at your data folder.`
    );
  }

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    exit(
      `Service account JSON not found at:\n    ${SERVICE_ACCOUNT_PATH}\n\n` +
      `  Generate it in Firebase Console → Project Settings → Service accounts →\n` +
      `  Generate new private key, then save it to that exact path.\n` +
      `  See FIREBASE_SETUP.md step 8.`
    );
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    exit(`firebase-admin is not installed. Run \`npm install\` first.`);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  console.log(`\n[migrate] source: ${source}`);
  console.log(`[migrate] project: ${serviceAccount.project_id}`);
  console.log(`[migrate] mode: ${args.dryRun ? 'DRY RUN (no writes)' : 'WRITING TO FIRESTORE'}\n`);

  // ── Read source files ─────────────────────────────────────────────────
  const companiesFile = readJson(path.join(source, 'companies.json'));
  const employeesByCo = readJson(path.join(source, 'employees.json')) || {};
  const shiftsByCo = readJson(path.join(source, 'shifts.json')) || {};
  const stationsByCo = readJson(path.join(source, 'stations.json')) || {};
  const stationGroupsByCo = readJson(path.join(source, 'stationGroups.json')) || {};
  const holidaysByCo = readJson(path.join(source, 'holidays.json')) || {};
  const configByCo = readJson(path.join(source, 'config.json')) || {};
  const allSchedulesByCo = readJson(path.join(source, 'allSchedules.json')) || {};
  const auditFile = readJson(path.join(source, 'audit.json'));

  if (!companiesFile || !Array.isArray(companiesFile.companies)) {
    exit(`No companies found in ${source}/companies.json — nothing to migrate.`);
  }
  const companies = companiesFile.companies;
  console.log(`[migrate] found ${companies.length} companies in source\n`);

  let writes = 0;
  let skipped = 0;
  const seenCompanyIds = new Set();

  // ── Per-company upload ────────────────────────────────────────────────
  for (const c of companies) {
    if (!c.id || seenCompanyIds.has(c.id)) { skipped++; continue; }
    seenCompanyIds.add(c.id);
    console.log(`[migrate] company "${c.name}" (${c.id})`);

    // Companies registry doc.
    const cdocPayload = {
      name: c.name,
      color: c.color || null,
      order: typeof c.order === 'number' ? c.order : Date.now(),
      archived: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'migration-script',
    };
    if (!args.dryRun) await db.collection('companies').doc(c.id).set(cdocPayload, { merge: true });
    writes++;

    // Subcollections: employees / shifts / stations / stationGroups
    const arrayDomains = [
      ['employees', employeesByCo[c.id], 'empId'],
      ['shifts', shiftsByCo[c.id], 'code'],
      ['stations', stationsByCo[c.id], 'id'],
      ['stationGroups', stationGroupsByCo[c.id], 'id'],
    ];
    for (const [name, list, idKey] of arrayDomains) {
      if (!Array.isArray(list) || !list.length) continue;
      const batch = db.batch();
      let count = 0;
      for (const item of list) {
        const id = item[idKey];
        if (!id) continue;
        const ref = db.collection('companies').doc(c.id).collection(name).doc(String(id));
        batch.set(ref, { ...item, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'migration-script' });
        count++;
      }
      if (!args.dryRun) await batch.commit();
      console.log(`  ${name}: ${count} docs`);
      writes += count;
    }

    // Holidays — consolidate split Eids before upload.
    const rawHolidays = Array.isArray(holidaysByCo[c.id]) ? holidaysByCo[c.id] : [];
    const consolidatedHolidays = consolidateHolidays(rawHolidays);
    if (consolidatedHolidays.length) {
      const batch = db.batch();
      let count = 0;
      for (const h of consolidatedHolidays) {
        const id = h.id || h.date;
        if (!id) continue;
        const ref = db.collection('companies').doc(c.id).collection('holidays').doc(String(id));
        batch.set(ref, { ...h, id, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'migration-script' });
        count++;
      }
      if (!args.dryRun) await batch.commit();
      console.log(`  holidays: ${count} docs`);
      writes += count;
    }

    // Config — single doc /companies/{id}/config/current
    const cfg = configByCo[c.id];
    if (cfg && typeof cfg === 'object') {
      const ref = db.collection('companies').doc(c.id).collection('config').doc('current');
      if (!args.dryRun) {
        await ref.set({
          value: cfg,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'migration-script',
        });
      }
      console.log(`  config: 1 doc`);
      writes++;
    }

    // Schedules — one doc per month, key transformation YYYY_MM → YYYY-MM.
    const scheds = allSchedulesByCo[c.id];
    if (scheds && typeof scheds === 'object') {
      const monthKeys = Object.keys(scheds);
      let count = 0;
      for (const legacyKey of monthKeys) {
        const m = /^scheduler_schedule_(\d{4})_(\d{1,2})$/.exec(legacyKey);
        if (!m) continue;
        const yyyymm = `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`;
        const entries = scheds[legacyKey] || {};
        const ref = db.collection('companies').doc(c.id).collection('schedules').doc(yyyymm);
        if (!args.dryRun) {
          await ref.set({
            entries,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: 'migration-script',
          });
        }
        count++;
      }
      if (count) console.log(`  schedules: ${count} months`);
      writes += count;
    }
  }

  // ── Audit log (top-level collection) ──────────────────────────────────
  if (auditFile && Array.isArray(auditFile.entries) && auditFile.entries.length) {
    // Migrate only the most recent 500 to keep the import small. Older
    // entries can be re-imported individually if needed; the user can
    // also choose to skip audit migration entirely with --no-audit.
    const recent = auditFile.entries.slice(-500);
    let count = 0;
    let batch = db.batch();
    for (const e of recent) {
      const ref = db.collection('audit').doc();
      batch.set(ref, {
        ts: e.ts || Date.now(),
        domain: e.domain,
        op: e.op,
        targetId: e.targetId ?? null,
        label: e.label ?? null,
        summary: e.summary,
        companyId: e.companyId ?? null,
        actorUid: 'migration-script',
        actorEmail: null,
        serverTs: FieldValue.serverTimestamp(),
      });
      count++;
      // Firestore batches max out at 500 ops; commit and start fresh as we go.
      if (count % 400 === 0) {
        if (!args.dryRun) await batch.commit();
        batch = db.batch();
      }
    }
    if (count % 400 !== 0 && !args.dryRun) await batch.commit();
    console.log(`\n[migrate] audit: ${count} entries (most recent 500 of ${auditFile.entries.length})`);
    writes += count;
  }

  console.log(`\n[migrate] ${args.dryRun ? 'WOULD WRITE' : 'wrote'} ~${writes} docs (${skipped} skipped).`);
  if (args.dryRun) console.log('\n  Run again without --dry-run to actually upload.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n[migrate] FATAL:', err);
  process.exit(1);
});
