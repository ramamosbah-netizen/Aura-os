import type { Id } from '@aura/shared';
import { type PreAwardGovernance, type PreAwardPackageStore, UNGOVERNED } from './pre-award-package-store';

/**
 * Phase-0 governance store — no-DB boots have no Pre-Award packages, so every deal reads as
 * ungoverned (legacy/grandfathered). A test may seed `set()` to exercise the governed path.
 */
export class InMemoryPreAwardPackageStore implements PreAwardPackageStore {
  private readonly byOpportunity = new Map<string, PreAwardGovernance>();
  private key(tenantId: Id, opportunityId: Id): string { return `${tenantId}:${opportunityId}`; }

  /** Test seam: declare the governance facts for a deal. */
  set(tenantId: Id, opportunityId: Id, gov: PreAwardGovernance): void {
    this.byOpportunity.set(this.key(tenantId, opportunityId), gov);
  }

  async governanceForOpportunity(tenantId: Id, opportunityId: Id): Promise<PreAwardGovernance> {
    return this.byOpportunity.get(this.key(tenantId, opportunityId)) ?? UNGOVERNED;
  }
}
