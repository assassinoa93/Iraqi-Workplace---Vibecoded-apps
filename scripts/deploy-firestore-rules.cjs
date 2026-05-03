#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * v5.1.4 — Programmatic Firestore rules deploy.
 *
 * Reads `firestore.rules` from the repo root, then uses the Firebase
 * Admin SDK's `securityRules` API to create + release a new ruleset on
 * the project owning the linked service account. No `firebase` CLI
 * required — only the service-account JSON.
 *
 * Usage:
 *   npm run deploy-rules
 *
 * Or directly:
 *   node scripts/deploy-firestore-rules.cjs
 *
 * Prerequisites:
 *   1. Service-account JSON at ./firebase-admin/serviceAccount.json
 *      (same path the bootstrap-super-admin script uses).
 *   2. The service account needs the `roles/firebaserules.admin` IAM
 *      role (or equivalent). The default Firebase Admin SDK role
 *      includes it; custom IAM setups may need to add it explicitly.
 *
 * What this script does:
 *   - Loads serviceAccount.json + firestore.rules from the repo.
 *   - Calls admin.securityRules().releaseFirestoreRulesetFromSource(source)
 *     which (a) creates a new ruleset, and (b) releases it as the active
 *     Firestore ruleset on the project. One round-trip.
 *   - Prints the new ruleset name + create-time so you can confirm in
 *     Firebase Console → Firestore → Rules → Release history.
 *
 * Why a CLI script in addition to the in-app Sync rules button:
 *   - Useful for CI / scripted environments where you don't want to
 *     launch the Electron app to deploy a rules update.
 *   - Useful for CLI-only super-admins who manage multiple projects.
 *   - Same source of truth (firestore.rules) as the in-app deploy, so
 *     both paths produce identical rulesets.
 */

const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '..', 'firebase-admin', 'serviceAccount.json');
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');

function exit(msg, code = 1) {
  console.error(`\n  ${msg}\n`);
  process.exit(code);
}

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  exit(
    `Service account not found at ${SERVICE_ACCOUNT_PATH}.\n` +
    `Generate one in Firebase Console → Project Settings → Service accounts → Generate new private key,\n` +
    `then save it to that path. The folder is gitignored — the file never ships.`,
  );
}
if (!fs.existsSync(RULES_PATH)) {
  exit(`firestore.rules not found at ${RULES_PATH}. Did the file get renamed?`);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);
const rulesSource = fs.readFileSync(RULES_PATH, 'utf8');

const projectId = serviceAccount.project_id;
const clientEmail = serviceAccount.client_email;

console.log(`\n  Iraqi Labor Scheduler — Firestore rules deploy`);
console.log(`  ----------------------------------------------`);
console.log(`  Project:          ${projectId}`);
console.log(`  Service account:  ${clientEmail}`);
console.log(`  Rules file:       ${RULES_PATH}`);
console.log(`  Rules size:       ${rulesSource.length} bytes`);

// Initialize the Admin SDK against the service account's project.
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId,
});

(async () => {
  try {
    const securityRules = admin.securityRules();
    const ruleset = await securityRules.releaseFirestoreRulesetFromSource(rulesSource);
    console.log(`\n  Ruleset created + released:`);
    console.log(`    name:       ${ruleset.name}`);
    console.log(`    createTime: ${ruleset.createTime}`);
    console.log(`\n  Active ruleset is now ${ruleset.name}.`);
    console.log(`  Verify in console:`);
    console.log(`    https://console.firebase.google.com/project/${projectId}/firestore/rules\n`);
    process.exit(0);
  } catch (err) {
    const e = err || {};
    console.error(`\n  Deploy failed:`);
    console.error(`    code:    ${e.code || 'unknown'}`);
    console.error(`    message: ${e.message || String(err)}`);
    if (e.code === 'security-rules/internal' || /permission/i.test(e.message || '')) {
      console.error(`\n  Common cause: the service account lacks the Firebase Rules Admin role.`);
      console.error(`  Grant it in Cloud Console → IAM & Admin → IAM:`);
      console.error(`    https://console.cloud.google.com/iam-admin/iam?project=${projectId}\n`);
    }
    process.exit(1);
  }
})();
