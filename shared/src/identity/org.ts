import type { Id } from '../domain/id';

/** Org hierarchy levels, broadest → narrowest. */
export const ORG_LEVELS = ['tenant', 'company', 'business_unit', 'department', 'team'] as const;
export type OrgLevel = (typeof ORG_LEVELS)[number];

/**
 * A node in the org tree (`Tenant → Company → Business Unit → Department → Team`).
 * The chain from a node to the root defines access containment: a grant scoped to
 * an ancestor covers everything beneath it.
 */
export interface OrgNode {
  id: Id;
  level: OrgLevel;
  tenantId: Id;
  parentId: Id | null;
  name: string;
}
