#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One-time bootstrap: sets the {role: 'super_admin'} custom claim on a
 * Firebase Auth user and writes the matching /users/{uid} doc.
 *
 * Usage:
 *   npm run bootstrap-super-admin <UID>
 *
 * Prerequisites (see FIREBASE_SETUP.md):
 *   1. Generate a service-account JSON in Firebase Console →
 *      Project Settings → Service accounts → Generate new private key.
 *   2. Save it as ./firebase-admin/serviceAccount.json (the folder is
 *      gitignored — the file never ships).
 *   3. Find your user's UID in Authentication → Users (click the row).
 *
 * After running this once, sign out of the app and sign in again so the
 * new claim shows up in your ID token.
 */

const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT_PATH = path.resolve(
  __dirname,
  '..',
  'firebase-admin',
  'serviceAccount.json'
);

function exit(msg, code = 1) {
  console.error(`\n  ${msg}\n`);
  process.exit(code);
}

const uid = process.argv[2];
const role = process.argv[3] || 'super_admin';

if (!uid) {
  exit(
    'Usage: npm run bootstrap-super-admin <UID> [role]\n' +
    '  Find your UID in Firebase Console → Authentication → Users (click your row).\n' +
    '  role defaults to "super_admin"; pass "admin" or "supervisor" for other roles.'
  );
}

if (!['super_admin', 'admin', 'supervisor'].includes(role)) {
  exit(`Invalid role "${role}". Must be one of: super_admin, admin, supervisor.`);
}

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  exit(
    `Service account JSON not found at:\n    ${SERVICE_ACCOUNT_PATH}\n\n` +
    '  Generate it in Firebase Console → Project Settings → Service accounts →\n' +
    '  Generate new private key, then save it to that exact path.\n' +
    '  See FIREBASE_SETUP.md step 8.'
  );
}

let serviceAccount;
try {
  serviceAccount = require(SERVICE_ACCOUNT_PATH);
} catch (err) {
  exit(`Failed to read service account JSON: ${err.message}`);
}

let admin;
try {
  admin = require('firebase-admin');
} catch (err) {
  exit(
    'firebase-admin is not installed. Run `npm install` first to pick up\n' +
    '  the devDependency that was added for this script.'
  );
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

(async () => {
  try {
    const user = await admin.auth().getUser(uid);
    const claims = role === 'supervisor'
      ? { role, companies: [] } // supervisors get an empty list — set per-user later
      : { role };               // super_admin / admin see all companies

    await admin.auth().setCustomUserClaims(uid, claims);

    await admin.firestore().collection('users').doc(uid).set(
      {
        email: user.email || null,
        displayName: user.displayName || null,
        role,
        ...(role === 'supervisor' ? { companies: [] } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`\n  ✅  ${user.email || uid} is now "${role}".`);
    console.log(`  Sign out and sign in again so the new claim is in the ID token.\n`);
    process.exit(0);
  } catch (err) {
    if (err && err.code === 'auth/user-not-found') {
      exit(
        `No user with UID "${uid}" exists in this project.\n` +
        '  Double-check the UID in Firebase Console → Authentication → Users.'
      );
    }
    exit(`Bootstrap failed: ${err && err.message ? err.message : err}`);
  }
})();
