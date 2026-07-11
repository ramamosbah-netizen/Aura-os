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
  /** Main phone/email for the party (a contact can refine these). */
  phone: string | null;
  email: string | null;
  billingAddress: string | null;
  /** Where the relationship came from (referral, exhibition, cold call, …). */
  source: string | null;
  /** Credit / payment terms, e.g. "30 days PDC". */
  paymentTerms: string | null;
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
  phone?: string | null;
  email?: string | null;
  billingAddress?: string | null;
  source?: string | null;
  paymentTerms?: string | null;
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
    phone: input.phone ?? null,
    email: input.email ?? null,
    billingAddress: input.billingAddress ?? null,
    source: input.source ?? null,
    paymentTerms: input.paymentTerms ?? null,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** CRM events on the spine. */
export const CRM_EVENT = {
  accountCreated: 'crm.account.created',
  accountUpdated: 'crm.account.updated',
  accountStatusChanged: 'crm.account.status_changed',
} as const;
