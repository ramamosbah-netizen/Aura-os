import { type Id, newId } from '@aura/shared';

// Contracts domain — framework-free. A ContractClause is a reusable, tenant-scoped template of
// contract language (payment terms, retention, LD/penalty, warranty, indemnity, …) that estimators
// and contract admins pull into contracts. Categorised + tagged for search; versioned by revision.

export type ClauseCategory =
  | 'general'
  | 'payment'
  | 'retention'
  | 'variation'
  | 'delay_ld'
  | 'warranty'
  | 'indemnity'
  | 'termination'
  | 'insurance'
  | 'hse'
  | 'other';

export interface ContractClause {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  title: string;
  category: ClauseCategory;
  body: string;
  tags: string[];
  revision: number;
  active: boolean;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewContractClause {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  title: string;
  category?: ClauseCategory;
  body: string;
  tags?: string[];
  active?: boolean;
  createdBy?: Id | null;
}

export function makeContractClause(input: NewContractClause): ContractClause {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    category: input.category ?? 'general',
    body: input.body.trim(),
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    revision: 1,
    active: input.active ?? true,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Amend a clause — bumps the revision and updates the body/title/tags. */
export function reviseClause(
  clause: ContractClause,
  patch: { title?: string; body?: string; category?: ClauseCategory; tags?: string[]; active?: boolean },
): ContractClause {
  return {
    ...clause,
    title: patch.title?.trim() ?? clause.title,
    body: patch.body?.trim() ?? clause.body,
    category: patch.category ?? clause.category,
    tags: patch.tags ? patch.tags.map((t) => t.trim()).filter(Boolean) : clause.tags,
    active: patch.active ?? clause.active,
    revision: clause.revision + 1,
    updatedAt: new Date().toISOString(),
  };
}

export const CLAUSE_EVENT = {
  created: 'contracts.clause.created',
  revised: 'contracts.clause.revised',
} as const;
