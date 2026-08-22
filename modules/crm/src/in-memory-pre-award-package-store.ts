import type { Id } from '@aura/shared';
import { type PreAwardGovernance, type PreAwardPackageStore, UNGOVERNED } from './pre-award-package-store';
import {
  type PreAwardPackage, type EstimationBasisRevision, type EstimateRevision, type EstimateBuildUp,
  packageGovernance,
} from './domain/pre-award-package';

/** Phase-0 package store — in memory (no-DB boots + unit tests). */
export class InMemoryPreAwardPackageStore implements PreAwardPackageStore {
  private readonly packages = new Map<string, PreAwardPackage>();
  private readonly basis = new Map<string, EstimationBasisRevision>();
  private readonly estimates = new Map<string, EstimateRevision>();
  private readonly buildUps = new Map<string, EstimateBuildUp[]>();
  private readonly pricingFrozen = new Set<string>();
  private clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }

  async savePackage(p: PreAwardPackage): Promise<void> { this.packages.set(p.id, this.clone(p)); }
  async saveBasis(b: EstimationBasisRevision): Promise<void> { this.basis.set(b.id, this.clone(b)); }
  async saveEstimate(e: EstimateRevision): Promise<void> { this.estimates.set(e.id, this.clone(e)); }
  async saveBuildUps(_t: Id, _c: Id | null, estimateRevisionId: Id, buildUps: EstimateBuildUp[]): Promise<void> {
    this.buildUps.set(estimateRevisionId, buildUps.map((b) => this.clone(b)));
  }
  async markPricingFrozen(_t: Id, packageId: Id, frozen: boolean): Promise<void> {
    if (frozen) this.pricingFrozen.add(packageId); else this.pricingFrozen.delete(packageId);
  }

  async getByOpportunity(tenantId: Id, opportunityId: Id): Promise<PreAwardPackage | null> {
    for (const p of this.packages.values()) if (p.tenantId === tenantId && p.opportunityId === opportunityId) return this.clone(p);
    return null;
  }
  async listBasis(tenantId: Id, packageId: Id): Promise<EstimationBasisRevision[]> {
    return [...this.basis.values()].filter((b) => b.tenantId === tenantId && b.packageId === packageId).map((b) => this.clone(b));
  }
  async listEstimates(tenantId: Id, packageId: Id): Promise<EstimateRevision[]> {
    return [...this.estimates.values()].filter((e) => e.tenantId === tenantId && e.packageId === packageId).map((e) => this.clone(e));
  }

  async governanceForOpportunity(tenantId: Id, opportunityId: Id): Promise<PreAwardGovernance> {
    const pkg = await this.getByOpportunity(tenantId, opportunityId);
    if (!pkg) return UNGOVERNED;
    const [basis, estimates] = await Promise.all([this.listBasis(tenantId, pkg.id), this.listEstimates(tenantId, pkg.id)]);
    return packageGovernance(pkg.id, basis, estimates, this.pricingFrozen.has(pkg.id));
  }
}
