import type { Id } from '@aura/shared';
import type { Requirement, SolutionScope } from './domain/solution-scope';

export const CRM_PRE_AWARD_STORE = Symbol('CRM_PRE_AWARD_STORE');

/** Store for the opportunity-scoped pre-award artifacts — requirements + solution scopes (R4). */
export interface PreAwardStore {
  // requirements
  saveRequirement(r: Requirement): Promise<void>;
  listRequirements(tenantId: Id, opportunityId: Id): Promise<Requirement[]>;
  // solution scopes
  saveScope(s: SolutionScope): Promise<void>;
  getScope(id: Id): Promise<SolutionScope | null>;
  listScopes(tenantId: Id, opportunityId: Id): Promise<SolutionScope[]>;
}
