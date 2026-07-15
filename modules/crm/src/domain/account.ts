import { type Id, newId } from '@aura/shared';

// CRM domain — framework-free. An Account is a customer/prospect: the head of the
// deal chain (CRM → Tender → Contract → Project). Module-owned (not kernel), so this
// lives in the module package, not @aura/shared.

/**
 * Relationship stage — the account is the PERSISTENT commercial party, so its
 * state is the RELATIONSHIP, not a lead funnel:
 * prospect → qualified → active_customer → strategic · dormant · inactive.
 * (Deals move through the pipeline; the account moves through the relationship.)
 */
export type AccountStatus = 'prospect' | 'qualified' | 'active_customer' | 'strategic' | 'dormant' | 'inactive';

export const RELATIONSHIP_STAGES: readonly AccountStatus[] = [
  'prospect',
  'qualified',
  'active_customer',
  'strategic',
  'dormant',
  'inactive',
];

/**
 * Party type — what the account IS, orthogonal to `status` (what the relationship
 * is worth right now). ELV deals move through a web of parties: the consultant
 * specifies, the main contractor buys, the developer owns. The graph (G6) needs
 * the node typed before an edge like "influences" can mean anything.
 */
export type PartyType =
  | 'end_client'
  | 'consultant'
  | 'main_contractor'
  | 'developer'
  | 'supplier'
  | 'partner'
  | 'subcontractor'
  | 'government'
  | 'other';

export const PARTY_TYPES: readonly PartyType[] = [
  'end_client',
  'consultant',
  'main_contractor',
  'developer',
  'supplier',
  'partner',
  'subcontractor',
  'government',
  'other',
];

export interface Account {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  name: string;
  status: AccountStatus;
  /** What the party IS (consultant, developer, …). Null = not classified yet, never guessed. */
  partyType: PartyType | null;
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
  partyType?: PartyType | null;
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
    status: input.status ?? 'prospect',
    partyType: input.partyType ?? null,
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
  accountLinked: 'crm.account.linked',
  accountUnlinked: 'crm.account.unlinked',
} as const;
