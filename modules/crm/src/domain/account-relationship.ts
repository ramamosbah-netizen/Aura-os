import { type Id, newId } from '@aura/shared';

// G6 — the relationship graph between accounts. ELV work is won through a web of
// parties ("this consultant influences that developer's tender"), and the graph is
// what makes that web queryable. Edges are DIRECTED: the meaning flips with the
// arrow, so one row per edge and the inverse reading is derived, never stored.

export type AccountRelationshipType =
  | 'influences'
  | 'consultant_for'
  | 'main_contractor_for'
  | 'subcontractor_of'
  | 'supplier_to'
  | 'partner_of'
  | 'parent_of';

export const ACCOUNT_RELATIONSHIP_TYPES: readonly AccountRelationshipType[] = [
  'influences',
  'consultant_for',
  'main_contractor_for',
  'subcontractor_of',
  'supplier_to',
  'partner_of',
  'parent_of',
];

/**
 * How the edge reads from each end. `forward` renders on the FROM account
 * ("influences → Emaar"), `inverse` on the TO account ("influenced by ← Alpha").
 * Rendering the same row differently per side is what keeps one stored edge honest.
 */
export const RELATIONSHIP_READING: Record<AccountRelationshipType, { forward: string; inverse: string }> = {
  influences: { forward: 'influences', inverse: 'influenced by' },
  consultant_for: { forward: 'consultant for', inverse: 'engages consultant' },
  main_contractor_for: { forward: 'main contractor for', inverse: 'engages main contractor' },
  subcontractor_of: { forward: 'subcontractor of', inverse: 'subcontracts to' },
  supplier_to: { forward: 'supplier to', inverse: 'buys from' },
  partner_of: { forward: 'partner of', inverse: 'partner of' },
  parent_of: { forward: 'parent of', inverse: 'subsidiary of' },
};

export interface AccountRelationship {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  fromAccountId: Id;
  toAccountId: Id;
  type: AccountRelationshipType;
  /** Why the edge exists — "specified us on Marina Hotel", not a category. */
  notes: string | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewAccountRelationship {
  tenantId: Id;
  companyId?: Id | null;
  fromAccountId: Id;
  toAccountId: Id;
  type: AccountRelationshipType;
  notes?: string | null;
  createdBy?: Id | null;
}

export function makeAccountRelationship(input: NewAccountRelationship): AccountRelationship {
  if (!ACCOUNT_RELATIONSHIP_TYPES.includes(input.type)) {
    throw new Error(`unknown relationship type: ${String(input.type)}`);
  }
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('an account cannot be related to itself');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    type: input.type,
    notes: input.notes?.trim() || null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}
