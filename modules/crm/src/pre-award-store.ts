import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Requirement, SolutionScope } from './domain/solution-scope';

export const CRM_PRE_AWARD_STORE = Symbol('CRM_PRE_AWARD_STORE');

/** Store for the opportunity-scoped pre-award artifacts — requirements + solution scopes (R4). */
export interface PreAwardStore {
  // requirements
  saveRequirement(r: Requirement): Promise<void>;
  /** Save inside the caller's transaction; null is the in-memory/no-DB equivalent. */
  saveRequirementWithClient(tx: TxHandle | null, r: Requirement): Promise<void>;
  listRequirements(tenantId: Id, opportunityId: Id): Promise<Requirement[]>;
  // solution scopes
  saveScope(s: SolutionScope): Promise<void>;
  getScope(id: Id): Promise<SolutionScope | null>;
  listScopes(tenantId: Id, opportunityId: Id): Promise<SolutionScope[]>;
}
