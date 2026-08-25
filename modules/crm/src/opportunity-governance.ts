import type { Id } from '@aura/shared';
import type { PreAwardPackageStore } from './pre-award-package-store';

/** How a deal's outcome is governed — decides who may close it and how. */
export type OpportunityGovernance = 'direct_legacy' | 'direct_governed' | 'tender_owned';

/**
 * The one narrow port that answers "how is this deal governed?" — injected into OpportunityService so
 * the close invariant lives in the SERVICE, not the controller/UI. Kept deliberately small (not a
 * dependency on the whole PreAwardPackageService) and MANDATORY: a manual close consults it, and if it
 * cannot classify, the close must fail rather than assume legacy.
 */
export interface OpportunityGovernanceResolver {
  classify(opp: { id: Id; tenantId: Id; tenderId: Id | null }): Promise<OpportunityGovernance>;
}

export const OPPORTUNITY_GOVERNANCE_RESOLVER = Symbol('OPPORTUNITY_GOVERNANCE_RESOLVER');

/**
 * Classifies from the AUTHORITATIVE relations — `opp.tenderId` (tender ownership) and the
 * package→opportunity link (`getByOpportunity`) — never a duplicated flag on the opportunity, so
 * there is no second copy of the truth to drift out of sync. Fail-closed by construction: a store
 * error propagates, so a close that cannot be classified is refused, not assumed legacy.
 */
export class PreAwardGovernanceResolver implements OpportunityGovernanceResolver {
  constructor(private readonly packages: PreAwardPackageStore) {}

  async classify(opp: { id: Id; tenantId: Id; tenderId: Id | null }): Promise<OpportunityGovernance> {
    if (opp.tenderId) return 'tender_owned';
    const pkg = await this.packages.getByOpportunity(opp.tenantId, opp.id);
    return pkg ? 'direct_governed' : 'direct_legacy';
  }
}
