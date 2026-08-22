import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, newId, moneyNumber, computeBuildUp, type CostComponent } from '@aura/shared';
import { CRM_PRE_AWARD_PACKAGE_STORE, type PreAwardGovernance, type PreAwardPackageStore } from './pre-award-package-store';
import {
  type PreAwardPackage, type EstimationBasisRevision, type EstimateRevision, type EstimateBuildUp, type BasisLine,
  makePreAwardPackage, makeBasisRevision, approveBasis, makeEstimateRevision, freezeEstimate, approveEstimate,
} from './domain/pre-award-package';

type BuildUpInput = {
  basisLineId: Id;
  components: Array<Pick<CostComponent, 'costType' | 'description' | 'quantity' | 'unitCost'>>;
  indirectPercent?: number; overheadPercent?: number; riskPercent?: number; profitPercent?: number;
  notes?: string | null;
};

/**
 * Direct Pre-Award orchestration (Phase 3): open a package for an opportunity, project a scope into a
 * basis revision, build + approve an estimate revision on it (via the SHARED estimation engine), and
 * expose governance. The commercial gate (quotationReadiness) reads that governance, so a direct deal
 * becomes quotable exactly when scope + estimate are approved and pricing is frozen.
 */
@Injectable()
export class PreAwardPackageService {
  private readonly logger = new Logger('CRM-PreAward');
  constructor(@Inject(CRM_PRE_AWARD_PACKAGE_STORE) private readonly store: PreAwardPackageStore) {}

  /** Idempotent: one direct package per opportunity. */
  async openDirect(input: { tenantId: Id; companyId?: Id | null; opportunityId: Id; createdBy?: Id | null }): Promise<PreAwardPackage> {
    const existing = await this.store.getByOpportunity(input.tenantId, input.opportunityId);
    if (existing) return existing;
    const pkg = makePreAwardPackage({ tenantId: input.tenantId, companyId: input.companyId ?? null, opportunityId: input.opportunityId, createdBy: input.createdBy ?? null });
    await this.store.savePackage(pkg);
    this.logger.log(`Direct pre-award package opened for opportunity ${input.opportunityId} (${pkg.id})`);
    return pkg;
  }

  /** Create a new scope basis revision (draft) from projected lines. */
  async addScopeBasis(input: { tenantId: Id; companyId?: Id | null; packageId: Id; sourceId: Id; sourceRevRef?: string | null; lines: BasisLine[]; createdBy?: Id | null }): Promise<EstimationBasisRevision> {
    const revisionNo = (await this.store.listBasis(input.tenantId, input.packageId)).length + 1;
    const basis = makeBasisRevision({ ...input, sourceKind: 'scope', revisionNo });
    await this.store.saveBasis(basis);
    return basis;
  }

  async approveScopeBasis(basis: EstimationBasisRevision, approvedBy: Id | null): Promise<EstimationBasisRevision> {
    const approved = approveBasis(basis, approvedBy);
    await this.store.saveBasis(approved);
    return approved;
  }

  /** Build an estimate revision (draft) on a basis, computing each line via the shared rate engine. */
  async addEstimate(input: { tenantId: Id; companyId?: Id | null; packageId: Id; basisRevisionId: Id; lines: BasisLine[]; buildUps: BuildUpInput[]; createdBy?: Id | null }): Promise<{ estimate: EstimateRevision; buildUps: EstimateBuildUp[] }> {
    const qtyByLine = new Map(input.lines.map((l) => [l.lineId, l.quantity]));
    const buildUps: EstimateBuildUp[] = input.buildUps.map((b) => {
      const components: CostComponent[] = b.components.map((c) => ({ id: newId(), costType: c.costType, description: c.description, quantity: Number(c.quantity) || 0, unitCost: Number(c.unitCost) || 0, amount: moneyNumber((Number(c.quantity) || 0) * (Number(c.unitCost) || 0)) }));
      const f = computeBuildUp(components, Number(b.overheadPercent) || 0, Number(b.profitPercent) || 0, Number(b.indirectPercent) || 0, Number(b.riskPercent) || 0);
      return { id: newId(), basisLineId: b.basisLineId, components, resources: null, indirectPercent: Number(b.indirectPercent) || 0, overheadPercent: Number(b.overheadPercent) || 0, riskPercent: Number(b.riskPercent) || 0, profitPercent: Number(b.profitPercent) || 0, ...f, notes: b.notes ?? null };
    });
    const totalSellingValue = moneyNumber(buildUps.reduce((s, b) => s + b.sellingRate * (qtyByLine.get(b.basisLineId) ?? 0), 0));
    const totalDirectCost = moneyNumber(buildUps.reduce((s, b) => s + b.directCost * (qtyByLine.get(b.basisLineId) ?? 0), 0));
    const totals = { totalDirectCost, totalSellingValue, marginPercent: totalSellingValue > 0 ? moneyNumber(((totalSellingValue - totalDirectCost) / totalSellingValue) * 100) : 0, lineCount: buildUps.length };

    const revisionNo = (await this.store.listEstimates(input.tenantId, input.packageId)).length + 1;
    const estimate = makeEstimateRevision({ tenantId: input.tenantId, companyId: input.companyId ?? null, packageId: input.packageId, basisRevisionId: input.basisRevisionId, revisionNo, totals, createdBy: input.createdBy ?? null });
    await this.store.saveEstimate(estimate);
    await this.store.saveBuildUps(input.tenantId, input.companyId ?? null, estimate.id, buildUps);
    return { estimate, buildUps };
  }

  async freezeEstimateRevision(estimate: EstimateRevision, by: Id | null): Promise<EstimateRevision> {
    const frozen = freezeEstimate(estimate, by);
    await this.store.saveEstimate(frozen);
    return frozen;
  }

  async approveEstimateRevision(estimate: EstimateRevision, by: Id | null): Promise<EstimateRevision> {
    const approved = approveEstimate(estimate, by);
    await this.store.saveEstimate(approved);
    return approved;
  }

  /** Mark the package's pricing frozen (the pricing sheet's freeze is its own concern; postgres derives). */
  async markPricingFrozen(tenantId: Id, packageId: Id, frozen = true): Promise<void> {
    await this.store.markPricingFrozen(tenantId, packageId, frozen);
  }

  governance(tenantId: Id, opportunityId: Id): Promise<PreAwardGovernance> {
    return this.store.governanceForOpportunity(tenantId, opportunityId);
  }
}
