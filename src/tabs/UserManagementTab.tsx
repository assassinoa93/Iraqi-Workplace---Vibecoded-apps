/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 3.6 — Dedicated User Management tab (super_admin only).
 *
 * Splits the Users panel out of the Super Admin tab into its own
 * sidebar entry, since the user-administration workflow is large
 * enough to deserve a top-level home (with growth room for granular
 * per-tab permission editing, account auditing, etc.).
 *
 * The UsersPanel component is reused unchanged from Super Admin —
 * splitting just changes where the panel renders, not its internals.
 */

import React from 'react';
import { useAuth } from '../lib/auth';
import { UsersPanel } from '../components/SuperAdmin/UsersPanel';
import type { Company } from '../types';

interface Props {
  companies: Company[];
}

export function UserManagementTab({ companies }: Props) {
  const { role } = useAuth();
  if (role !== 'super_admin') {
    return (
      <div className="p-8">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          You don't have permission to view this tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-100 uppercase tracking-tight mb-1">
          User Management
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase tracking-widest font-mono">
          Create, edit, and remove users · grant per-tab permissions
        </p>
      </div>

      <UsersPanel companies={companies} />
    </div>
  );
}
