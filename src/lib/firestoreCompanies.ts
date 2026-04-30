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
 * Hard-delete the company document. In Phase 2.1 there are no per-company
 * subcollections to cascade-clean (employees, shifts, schedules etc. still
 * live in the Express layer), so a clean delete is safe and matches user
 * expectation ("delete means gone, including in Firestore Console").
 *
 * When Phase 2.2 / 2.3 move per-domain data into subcollections, this
 * function will get a cascading wipe (delete all `/companies/{id}/employees`,
 * `/companies/{id}/shifts`, `/companies/{id}/schedules`, etc. before the
 * registry doc itself). The Super Admin tab (Phase 3) will provide the
 * confirm-with-typed-name guard for that destructive action.
 */
export async function deleteCompany(id: string, _actorUid: string | null): Promise<void> {
  const db = await getDb();
  const { doc, deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, COLLECTION, id));
}
