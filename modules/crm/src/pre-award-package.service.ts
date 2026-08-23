import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, newId, moneyNumber, computeBuildUp, type CostComponent, type EstimationLineInput, emptyEstimationInput } from '@aura/shared';
import { CRM_PRE_AWARD_PACKAGE_STORE, type PreAwardGovernance, type PreAwardPackageStore, UNGOVERNED } from './pre-award-package-store';
import { CRM_PRICING_SHEET_STORE, type PricingSheetStore } from './pricing-sheet-store';
import { type PricingSheet, makePricingSheet, freezeSheet, linkQuotation } from './domain/pricing-sheet';
import {
  type PreAwardPackage, type EstimationBasisRevision, type EstimateRevision, type EstimateBuildUp, type BasisLine,
  makePreAwardPackage, makeBasisRevision, approveBasis, updateBasisLines, assertBasisQuantitiesKnown,
  makeEstimateRevision, freezeEstimate, approveEstimate, packageGovernance,
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
  constructor(
    @Inject(CRM_PRE_AWARD_PACKAGE_STORE) private readonly store: PreAwardPackageStore,
    @Inject(CRM_PRICING_SHEET_STORE) private readonly pricing: PricingSheetStore,
  ) {}

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

  /**
   * Edit the lines of a DRAFT basis revision — the human half of Accept ≠ Approve. Provenance on each
   * surviving line is preserved by the domain; only a draft is editable.
   */
  async updateBasisLinesById(tenantId: Id, packageId: Id, basisId: Id, lines: BasisLine[], editedBy: Id | null): Promise<EstimationBasisRevision> {
    const basis = (await this.store.listBasis(tenantId, packageId)).find((b) => b.id === basisId);
    if (!basis) throw new Error(`scope basis ${basisId} not found`);
    const edited = updateBasisLines(basis, lines, editedBy);
    await this.store.saveBasis(edited);
    return edited;
  }

  /** Build an estimate revision (draft) on a basis, computing each line via the shared rate engine. */
  async addEstimate(input: { tenantId: Id; companyId?: Id | null; packageId: Id; basisRevisionId: Id; lines: BasisLine[]; buildUps: BuildUpInput[]; createdBy?: Id | null }): Promise<{ estimate: EstimateRevision; buildUps: EstimateBuildUp[] }> {
    // An estimate multiplies rate × quantity: an unknown quantity cannot be estimated, and must never
    // be silently treated as zero (which would produce a confident AED 0 estimate).
    const unknown = input.lines.filter((l) => l.quantity === null || l.quantity === undefined).map((l) => l.lineId);
    if (unknown.length > 0) {
      throw new Error(`cannot build an estimate: ${unknown.length} basis line(s) still have an unknown quantity — supply a quantity for every line first (unknown is not zero)`);
    }
    const qtyByLine = new Map(input.lines.map((l) => [l.lineId, l.quantity ?? 0]));
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

  // ── id-keyed transitions (the Commercial UI acts on existing revisions by id) ──
  async approveScopeBasisById(tenantId: Id, packageId: Id, basisId: Id, by: Id | null): Promise<EstimationBasisRevision> {
    const basis = (await this.store.listBasis(tenantId, packageId)).find((b) => b.id === basisId);
    if (!basis) throw new Error(`scope basis ${basisId} not found`);
    return this.approveScopeBasis(basis, by);
  }
  async freezeEstimateById(tenantId: Id, packageId: Id, estimateId: Id, by: Id | null): Promise<EstimateRevision> {
    const est = (await this.store.listEstimates(tenantId, packageId)).find((e) => e.id === estimateId);
    if (!est) throw new Error(`estimate revision ${estimateId} not found`);
    return this.freezeEstimateRevision(est, by);
  }
  async approveEstimateById(tenantId: Id, packageId: Id, estimateId: Id, by: Id | null): Promise<EstimateRevision> {
    const est = (await this.store.listEstimates(tenantId, packageId)).find((e) => e.id === estimateId);
    if (!est) throw new Error(`estimate revision ${estimateId} not found`);
    return this.approveEstimateRevision(est, by);
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

  /**
   * Freeze pricing for a package by creating a REAL frozen pricing_sheets row linked to the package
   * and its approved estimate revision. `pricingFrozen` in governance is derived from that row, so it
   * can never be a bare toggle — a frozen sheet must exist, built from the approved estimate's numbers.
   * Idempotent: a package that already has a frozen sheet returns it.
   */
  async freezePricing(input: { tenantId: Id; companyId?: Id | null; opportunityId: Id; actorId?: Id | null }): Promise<PricingSheet> {
    const pkg = await this.store.getByOpportunity(input.tenantId, input.opportunityId);
    if (!pkg) throw new Error('a pre-award package is required before pricing can be frozen');

    const existing = await this.pricing.list({ tenantId: input.tenantId, packageId: pkg.id, status: 'frozen', limit: 1 });
    if (existing[0]) return existing[0];

    const estimates = await this.store.listEstimates(input.tenantId, pkg.id);
    const approved = [...estimates].reverse().find((e) => e.status === 'approved');
    if (!approved) throw new Error('an approved estimate revision is required before pricing can be frozen');

    // The sheet is the money the quotation will carry, so the basis under it must be complete: a line
    // with an unknown quantity would freeze a price that silently costs that scope at nothing.
    const basis = (await this.store.listBasis(input.tenantId, pkg.id)).find((b) => b.id === approved.basisRevisionId);
    if (basis) assertBasisQuantitiesKnown(basis, 'freeze pricing');

    const totals = (approved.totals ?? {}) as { totalDirectCost?: number; totalSellingValue?: number; lineCount?: number };
    const totalDirectCost = Number(totals.totalDirectCost) || 0;
    const totalSellingValue = Number(totals.totalSellingValue) || 0;
    const lineCount = Number(totals.lineCount) || 0;
    // Margin computed from cost + sell (not the rounded totals.marginPercent) so the engine reproduces
    // the approved estimate's selling value exactly rather than drifting through a rounded percentage.
    const marginPercent = totalSellingValue > 0 ? (1 - totalDirectCost / totalSellingValue) * 100 : 0;
    // One pricing line carrying the approved estimate's own numbers — cost as an all-in figure, margin
    // reproducing its selling value. The sheet's frozen truth is the approved estimate, by construction.
    const line: EstimationLineInput = {
      ...emptyEstimationInput(),
      description: `Estimate E-${String(approved.revisionNo).padStart(3, '0')} — ${lineCount} line(s)`,
      quantity: 1,
      subcontractUnitCost: totalDirectCost,
      targetMarginPercent: marginPercent,
    };
    let sheet = makePricingSheet({
      tenantId: input.tenantId,
      companyId: input.companyId ?? pkg.companyId ?? null,
      name: `Pre-Award pricing — package ${pkg.id.slice(0, 8)}`,
      opportunityId: input.opportunityId,
      packageId: pkg.id,
      estimateRevisionId: approved.id,
      lines: [line],
      createdBy: input.actorId ?? null,
    });
    await this.pricing.save(sheet);
    sheet = freezeSheet(sheet, input.actorId ?? null);
    await this.pricing.save(sheet);
    this.logger.log(`Pricing frozen for package ${pkg.id} (sheet ${sheet.id}, estimate ${approved.id})`);
    return sheet;
  }

  /**
   * The FROZEN pricing sheet a direct deal's quotation must be generated from. The governed chain owns
   * the quote's numbers, not just the permission to raise one.
   */
  async frozenPricingFor(tenantId: Id, opportunityId: Id): Promise<PricingSheet | null> {
    const pkg = await this.store.getByOpportunity(tenantId, opportunityId);
    if (!pkg) return null;
    const [sheet] = await this.pricing.list({ tenantId, packageId: pkg.id, status: 'frozen', limit: 1 });
    return sheet ?? null;
  }

  /** Record the quotation a frozen sheet produced — closing the P→Q link. */
  async linkQuotationToPricing(sheet: PricingSheet, quotationId: Id): Promise<PricingSheet> {
    const linked = linkQuotation(sheet, quotationId);
    await this.pricing.save(linked);
    return linked;
  }

  /**
   * Governance for a direct deal, composed from the package's revisions + its pricing sheets. Keeping
   * this in the service (not the store) is what lets pricingFrozen reflect a real frozen pricing sheet
   * rather than a flag the store carried.
   */
  async governance(tenantId: Id, opportunityId: Id): Promise<PreAwardGovernance> {
    const pkg = await this.store.getByOpportunity(tenantId, opportunityId);
    if (!pkg) return UNGOVERNED;
    const [basis, estimates, frozenSheets] = await Promise.all([
      this.store.listBasis(tenantId, pkg.id),
      this.store.listEstimates(tenantId, pkg.id),
      this.pricing.list({ tenantId, packageId: pkg.id, status: 'frozen', limit: 1 }),
    ]);
    return packageGovernance(pkg.id, basis, estimates, frozenSheets.length > 0);
  }

  /**
   * The whole Pre-Award aggregate for one deal — package + its scope-basis revisions, estimate
   * revisions, and pricing sheets, plus the derived governance. This is the single read the Commercial
   * UI renders; the UI holds NO readiness state of its own — every gate comes from `governance` here.
   */
  async readAggregate(tenantId: Id, opportunityId: Id): Promise<PreAwardAggregate> {
    const pkg = await this.store.getByOpportunity(tenantId, opportunityId);
    if (!pkg) return { package: null, basis: [], estimates: [], pricing: [], governance: UNGOVERNED };
    const [basis, estimates, pricing] = await Promise.all([
      this.store.listBasis(tenantId, pkg.id),
      this.store.listEstimates(tenantId, pkg.id),
      this.pricing.list({ tenantId, packageId: pkg.id, limit: 50 }),
    ]);
    const governance = packageGovernance(pkg.id, basis, estimates, pricing.some((s) => s.status === 'frozen'));
    return { package: pkg, basis, estimates, pricing, governance };
  }
}

export interface PreAwardAggregate {
  package: PreAwardPackage | null;
  basis: EstimationBasisRevision[];
  estimates: EstimateRevision[];
  pricing: PricingSheet[];
  governance: PreAwardGovernance;
}
