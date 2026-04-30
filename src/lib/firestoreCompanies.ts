/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Companies registry — Firestore CRUD + real-time subscription.
 *
 * Document shape at `/companies/{id}`:
 *   {
 *     name: string,
 *     color?: string,
 *     order?: number,        // for stable display ordering across clients
 *     archived?: boolean,    // soft-delete (Phase 3 surfaces this)
 *     createdAt: Timestamp,
 *     updatedAt: Timestamp,
 *     updatedBy: string      // uid of the user who last touched it
 *   }
 *
 * The `id` is the document ID (also stored as the field-less Company.id in
 * the renderer), so `Company` shape stays identical between Offline and
 * Online modes — no consumer of `companies: Company[]` needs to change.
 *
 * Phase 2.1 scope: only this collection migrates to Firestore. Per-domain
 * data (employees, shifts, schedules, …) keeps using the Express layer in
 * Online mode for now. Phase 2.2 / 2.3 swap those in.
 */

import type { Unsubscribe } from 'firebase/firestore';
import type { Company } from '../types';
import { getDb } from './firestoreClient';

const COLLECTION = 'companies';

export interface FirestoreCompanyDoc {
  name: string;
  color?: string;
  order?: number;
  archived?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy?: string;
}

function toCompany(id: string, data: FirestoreCompanyDoc): Company {
  return { id, name: data.name, color: data.color };
}

export async function subscribeCompanies(
  onChange: (companies: Company[]) => void,
  onError?: (err: unknown) => void,
): Promise<Unsubscribe> {
  const db = await getDb();
  const { collection, onSnapshot, query, orderBy } = await import('firebase/firestore');
  // Order by `order` field then name. Firestore ignores docs that lack the
  // `order` field for the orderBy when the field doesn't exist on every doc;
  // we backfill `order` on every write so this stays consistent.
  const q = query(collection(db, COLLECTION), orderBy('order', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const list: Company[] = snap.docs
        .map((d) => ({ id: d.id, data: d.data() as FirestoreCompanyDoc }))
        .filter((x) => !x.data.archived) // hide soft-deleted from the switcher
        .map((x) => toCompany(x.id, x.data));
      onChange(list);
    },
    (err) => {
      console.error('[firestoreCompanies] subscribe error:', err);
      onError?.(err);
    },
  );
}

/**
 * Add a new company. Returns the assigned document ID so the caller can
 * set it as active locally.
 *
 * `order` is set to `Date.now()` so newly-added companies sort to the
 * bottom of the list deterministically and the value is monotonic across
 * machines (good enough — collisions are vanishingly unlikely for a
 * 14-user team).
 */
export async function addCompany(
  name: string,
  actorUid: string | null,
  color?: string,
): Promise<string> {
  const db = await getDb();
  const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
  const ref = await addDoc(collection(db, COLLECTION), {
    name,
    color: color ?? null,
    order: Date.now(),
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: actorUid ?? 'unknown',
  } satisfies FirestoreCompanyDoc);
  return ref.id;
}

export async function renameCompany(
  id: string,
  newName: string,
  actorUid: string | null,
): Promise<void> {
  const db = await getDb();
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
  await updateDoc(doc(db, COLLECTION, id), {
    name: newName,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid ?? 'unknown',
  });
}

/**
 * Soft-delete via `archived: true` rather than a hard `deleteDoc`. Reasons:
 *   - We don't yet have the per-company subcollection cleanup logic
 *     (employees, shifts, schedules, etc.) — that's Phase 2.2/2.3.
 *     Hard-deleting a company while its data still lives elsewhere
 *     orphans those records.
 *   - The Super Admin tab (Phase 3) will offer an explicit "Permanently
 *     delete and remove all data" action that does the cascading wipe
 *     once the per-domain layers are in.
 *
 * The subscribeCompanies() filter hides archived rows from the switcher
 * so the UX matches "delete" from the user's perspective.
 */
export async function deleteCompany(id: string, actorUid: string | null): Promise<void> {
  const db = await getDb();
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
  await updateDoc(doc(db, COLLECTION, id), {
    archived: true,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid ?? 'unknown',
  });
}
