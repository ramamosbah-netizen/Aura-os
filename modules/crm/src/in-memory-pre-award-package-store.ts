import type { Id } from '@aura/shared';
import type { PreAwardPackageStore } from './pre-award-package-store';
import type { PreAwardPackage, EstimationBasisRevision, EstimateRevision, EstimateBuildUp } from './domain/pre-award-package';

/** In-memory package store (no-DB boots + unit tests). Governance is composed by the service. */
export class InMemoryPreAwardPackageStore implements PreAwardPackageStore {
  private readonly packages = new Map<string, PreAwardPackage>();
  private readonly basis = new Map<string, EstimationBasisRevision>();
  private readonly estimates = new Map<string, EstimateRevision>();
  private readonly buildUps = new Map<string, EstimateBuildUp[]>();
  private clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }

  async savePackage(p: PreAwardPackage): Promise<void> { this.packages.set(p.id, this.clone(p)); }
  async saveBasis(b: EstimationBasisRevision): Promise<void> { this.basis.set(b.id, this.clone(b)); }
  async saveEstimate(e: EstimateRevision): Promise<void> { this.estimates.set(e.id, this.clone(e)); }
  async saveBuildUps(_t: Id, _c: Id | null, estimateRevisionId: Id, buildUps: EstimateBuildUp[]): Promise<void> {
    this.buildUps.set(estimateRevisionId, buildUps.map((b) => this.clone(b)));
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
  async listBuildUps(_tenantId: Id, estimateRevisionId: Id): Promise<EstimateBuildUp[]> {
    return (this.buildUps.get(estimateRevisionId) ?? []).map((b) => this.clone(b));
  }
}
