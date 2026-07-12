import { type Id, newId } from '@aura/shared';

// CRM domain — framework-free. A Contact is a person at an Account (the customer/prospect
// org). Contacts hang off the account by reference + name snapshot (no cross-module join),
// mirroring the rest of the deal chain.

export type ContactStatus = 'active' | 'inactive';

/** The role this person plays in the buying decision (the stakeholder map). */
export type StakeholderRole =
  | 'decision_maker'
  | 'influencer'
  | 'technical'
  | 'commercial'
  | 'finance'
  | 'executive_sponsor'
  | 'user';

export const STAKEHOLDER_ROLES: readonly StakeholderRole[] = [
  'decision_maker', 'influencer', 'technical', 'commercial', 'finance', 'executive_sponsor', 'user',
];

/** How strong our relationship with this person is — a champion vs a blocker. */
export type RelationshipStrength = 'champion' | 'strong' | 'neutral' | 'weak' | 'detractor';

export const RELATIONSHIP_STRENGTHS: readonly RelationshipStrength[] = [
  'champion', 'strong', 'neutral', 'weak', 'detractor',
];

export interface Contact {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** The account this person belongs to — reference + name snapshot, not a join. */
  accountId: Id | null;
  accountName: string | null;
  name: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  /** The primary point of contact for the account. */
  isPrimary: boolean;
  /** Where this person sits in the buying decision. */
  stakeholderRole: StakeholderRole | null;
  /** How strong the relationship is (champion … detractor). */
  relationshipStrength: RelationshipStrength | null;
  /** Account hierarchy — the contact this person reports to (reference + snapshot). */
  reportsToId: Id | null;
  reportsToName: string | null;
  status: ContactStatus;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewContact {
  tenantId: Id;
  companyId?: Id | null;
  accountId?: Id | null;
  accountName?: string | null;
  name: string;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
  stakeholderRole?: StakeholderRole | null;
  relationshipStrength?: RelationshipStrength | null;
  reportsToId?: Id | null;
  reportsToName?: string | null;
  status?: ContactStatus;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeContact(input: NewContact): Contact {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    accountId: input.accountId ?? null,
    accountName: input.accountName?.trim() || null,
    name: input.name.trim(),
    jobTitle: input.jobTitle?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    isPrimary: input.isPrimary ?? false,
    stakeholderRole: input.stakeholderRole ?? null,
    relationshipStrength: input.relationshipStrength ?? null,
    reportsToId: input.reportsToId ?? null,
    reportsToName: input.reportsToName?.trim() || null,
    status: input.status ?? 'active',
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** CRM contact events on the spine. */
export const CRM_CONTACT_EVENT = {
  created: 'crm.contact.created',
  updated: 'crm.contact.updated',
} as const;
