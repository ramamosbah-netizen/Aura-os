import { type Id, newId } from '@aura/shared';

// CRM domain — framework-free. An Account is a customer/prospect: the head of the
// deal chain (CRM → Tender → Contract → Project). Module-owned (not kernel), so this
// lives in the module package, not @aura/shared.

export type AccountStatus = 'lead' | 'active' | 'inactive';

export interface Account {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  name: string;
  status: AccountStatus;
  industry: string | null;
  website: string | null;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewAccount {
  tenantId: Id;
  companyId?: Id | null;
  name: string;
  status?: AccountStatus;
  industry?: string | null;
  website?: string | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeAccount(input: NewAccount): Account {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    name: input.name.trim(),
    status: input.status ?? 'lead',
    industry: input.industry ?? null,
    website: input.website ?? null,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** CRM events on the spine. */
export const CRM_EVENT = {
  accountCreated: 'crm.account.created',
} as const;
