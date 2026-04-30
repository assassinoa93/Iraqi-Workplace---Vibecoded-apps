# Firebase / Online Mode setup

This is the step-by-step to run the Iraqi Labor Scheduler in **Online mode**
(multi-user, cloud-backed). Total time: ~10 minutes of clicks + one terminal
command.

> **You don't need this for Offline Demo mode** — the app works fully local
> with no setup. Online mode is opt-in for multiple supervisors collaborating.

This repository contains **zero credentials**. Each developer runs through
the steps below with their own Firebase project. Your `.env.local` and
service-account JSON stay on your machine — both are gitignored.

---

## Prerequisites

- A Google account
- Node.js 20+ and npm (already required by the app)

---

## Step 1 — Create a Firebase project (~1 min)

1. Open <https://console.firebase.google.com>.
2. Click **"Add project"** (or "Create a project").
3. Pick any name (e.g. `iraqi-labor-scheduler`).
4. **Uncheck** "Enable Google Analytics for this project" → **Continue**.
5. Wait for the project to be created → **Continue**.

---

## Step 2 — Create the Firestore database (~1 min)

1. In your project, left sidebar: **Build → Firestore Database**.
2. Click **"Create database"**.
3. Location: pick **`europe-west3` (Frankfurt)** — lowest latency from Iraq.
   *(Alternatives: `europe-west1` Belgium, `me-central2` Dammam.)*
   This is permanent — cannot be changed later. → **Next**.
4. Mode: **"Start in production mode"** → **Create**.
5. Wait for the database to provision (10–20 seconds).

---

## Step 3 — Deploy the security rules (~30 sec)

1. Still in Firestore, click the **"Rules"** tab at the top.
2. Open the file [`firestore.rules`](./firestore.rules) in this repo.
3. Copy **the entire file contents**.
4. Paste it into the rules editor, replacing whatever's there.
5. Click **"Publish"**.

These rules enforce role-based access (super_admin / admin / supervisor) on
the server side. They're public by design — security comes from authentication,
not obscurity.

---

## Step 4 — Enable Email/Password sign-in (~1 min)

1. Left sidebar: **Build → Authentication**.
2. Click **"Get started"**.
3. From the providers list, click **"Email/Password"**.
4. Toggle **Enable** to ON. Leave "Email link" off. → **Save**.
5. Click the **"Settings"** tab inside Authentication (top of page).
6. Scroll to **"User actions"**.
7. **Uncheck** "Enable create (sign-up)" → **Save**.

This makes the project closed-membership: only the super-admin can create
new accounts.

---

## Step 5 — Register a Web app (~1 min)

1. Top of page: click the **gear icon** → **Project settings**.
2. Stay on the **General** tab.
3. Scroll to **"Your apps"** at the bottom.
4. Click the **`</>` Web** icon.
5. Nickname: anything (e.g. `Iraqi Labor Scheduler — Electron`).
6. **Do NOT check** "Also set up Firebase Hosting".
7. Click **"Register app"**.
8. Firebase shows a code block with `const firebaseConfig = { ... }`.
   **Keep this tab open** — you'll need these values in step 7.

---

## Step 6 — Create your super-admin user account (~1 min)

1. Left sidebar: **Build → Authentication → Users** tab.
2. Click **"Add user"**.
3. Email: your email (the one you'll log into the app with).
4. Password: any strong password (you can change it later from the app).
5. Click **"Add user"**.
6. The user appears in the list. Click on the **User UID** column to copy
   the UID (long random string starting with letters/digits). **Save this**
   — you'll paste it in step 9.

---

## Step 7 — Configure your local app (~1 min)

You have **two options**, pick whichever you prefer:

### Option A — Paste in-app (recommended for second-machine / team users)

Skip this step entirely for now. When you launch the app, click
**Connect Online** → **I already have one** → paste your `firebaseConfig`
in the form. The values are saved on this device's local storage and
persist across restarts.

This is also how your **other team members** join your team's setup, and
how **you** connect from a second computer without redoing setup. Just
share your `firebaseConfig` (e.g. via Signal) and they paste it.

### Option B — `.env.local` file

In the repo root, copy the env template:

```
# Windows (PowerShell or cmd):
copy .env.example .env.local

# macOS / Linux:
cp .env.example .env.local
```

Open `.env.local` in any text editor. Paste the values from the
`firebaseConfig` block in step 5 into the matching `VITE_FIREBASE_*`
variables:

```
VITE_FIREBASE_API_KEY=AIza...your-key...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef
```

Save the file. `.env.local` is gitignored — these values stay on your
machine. (Build-time env vars take precedence over the in-app paste, so
this is the right choice if you want config baked into the build.)

---

## Step 8 — Generate a service-account key (~30 sec)

This file lets the bootstrap script (next step) set custom claims on your
account. It's the master key for your Firebase project — treat it like a
password.

1. **Project settings** (gear icon, top of page) → **"Service accounts"** tab.
2. Click **"Generate new private key"** → confirm with **"Generate key"**.
3. A JSON file downloads.
4. In the repo root, create a folder called `firebase-admin/`:
   ```
   # Windows:
   mkdir firebase-admin

   # macOS / Linux:
   mkdir firebase-admin
   ```
5. **Move the downloaded file** into that folder and **rename it** to:
   ```
   firebase-admin/serviceAccount.json
   ```

The `firebase-admin/` folder is gitignored — the file never makes it into
git or any release.

---

## Step 9 — Bootstrap your super-admin role (~10 sec)

In a terminal at the repo root, run:

```
npm run bootstrap-super-admin <YOUR_UID_FROM_STEP_6>
```

Example (replace with your real UID):

```
npm run bootstrap-super-admin AbCdEf123XyZ456...
```

You should see:

```
  ✅  you@example.com is now "super_admin".
  Sign out and sign in again so the new claim is in the ID token.
```

That's it — Firebase is fully configured.

---

## Step 10 — Run the app

```
npm run electron:dev
```

On the launch screen:
1. Click **"Connect Online"**.
2. On the sign-in screen, enter your email + password from step 6.
3. You should land in the app with the full sidebar — including **Variables**,
   **Audit Log**, and (in Phase 3 of the migration) **Super Admin**.

If you see "Firebase not configured" on the launch screen, your `.env.local`
isn't being picked up — make sure you placed it in the **repo root** and
restart `npm run electron:dev`.

---

## Adding more users later

Until the in-app **Super Admin** tab ships in Phase 3, add admins and
supervisors the same way you added yourself:

1. Firebase Console → Authentication → Users → **Add user** (email + temp
   password).
2. Copy their UID.
3. Run:
   ```
   npm run bootstrap-super-admin <THEIR_UID> admin
   ```
   ...or `supervisor` for a supervisor account. (For supervisors, you'll
   later assign companies via the Super Admin tab.)
4. Send them their email + password securely (Signal, in-person, etc. —
   never plain email).

---

## Pre-push safety check

Before any `git push`, run this to confirm nothing sensitive snuck in:

```
git ls-files | grep -E "(\.env\.local|serviceAccount.*\.json|firebase-admin/)"
```

If that prints anything, **stop**. Run `git rm --cached <file>` for each
match, commit the removal, then push.

The repo's `.gitignore` already blocks all of these patterns, so this should
print nothing — but the check costs you a second and is worth doing.

---

## Optional hardening — restrict your API key

The web SDK config (`apiKey`, `projectId`, etc.) is technically a public
client identifier — it ships in any Firebase web app's bundle. Security
comes from your **rules** + **Auth**, not from hiding the key. But you can
prevent random API abuse:

1. Open <https://console.cloud.google.com/apis/credentials>.
2. Pick your Firebase project.
3. Find the **Browser key** (auto-created by Firebase).
4. Under **API restrictions**, choose **"Restrict key"** and pick:
   - Identity Toolkit API
   - Token Service API
   - Firebase Installations API
   - Cloud Firestore API
5. Save.

Now even if your `.env.local` leaked, the key couldn't be used for, say,
Maps or Translate — quotas you'd otherwise pay for.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Firebase not configured" on launch screen | `.env.local` missing or in wrong folder. Must be in repo root. Restart dev server. |
| `npm run bootstrap-super-admin` says "Service account JSON not found" | The JSON must be at exactly `firebase-admin/serviceAccount.json` in the repo root. Recheck the path & filename. |
| Login fails with "auth/invalid-credential" | Email/password mismatch, or the user doesn't exist. Check Firebase Console → Authentication → Users. |
| Login succeeds but only Dashboard tab is visible | Custom claims didn't take effect. **Sign out and sign in again** to refresh the ID token. |
| Bootstrap says "auth/user-not-found" | Wrong UID. Copy the UID column value from Firebase Console → Authentication → Users. |
