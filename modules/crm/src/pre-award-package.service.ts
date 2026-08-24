import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type Id, newId, moneyNumber, computeCostBuildUp, computeCommercialPricing, compileResourceBreakdown,
  type CostComponent, type ResourceBreakdown, type PricingPolicy, type PricingDiscount, type SellingFigures,
  type EstimationLineInput, emptyEstimationInput,
} from '@aura/shared';
import { CRM_PRE_AWARD_PACKAGE_STORE, type PreAwardGovernance, type PreAwardPackageStore, UNGOVERNED } from './pre-award-package-store';
import { CRM_PRICING_SHEET_STORE, type PricingSheetStore } from './pricing-sheet-store';
import {
  type PricingSheet, makePricingSheet, freezeSheet, linkQuotation,
  openCommercialPricing, applyPricingPolicy, previewCommercialPricing,
} from './domain/pricing-sheet';
import {
  type PreAwardPackage, type EstimationBasisRevision, type EstimateRevision, type EstimateBuildUp, type BasisLine,
  makePreAwardPackage, makeBasisRevision, approveBasis, updateBasisLines, assertBasisQuantitiesKnown,
  makeEstimateRevision, freezeEstimate, approveEstimate, packageGovernance,
} from './domain/pre-award-package';

/**
 * One line's cost build-up. Note there is NO profit/margin here: a Direct estimate answers "what will
 * it cost us?" and stops. The commercial decision is made once, later, in freezePricing (Slice 6A).
 * `profitPercent` is accepted-and-ignored so the transitional UI's request shape does not break.
 */
type BuildUpInput = {
  basisLineId: Id;
  /** Raw components — used only when no structured `resources` sheet is given. */
  components?: Array<Pick<CostComponent, 'costType' | 'description' | 'quantity' | 'unitCost'>>;
  /** Structured Materials/Labour/Plant/Subcontract/Other sheet; the engine compiles it to components. */
  resources?: Partial<ResourceBreakdown>;
  indirectPercent?: number; overheadPercent?: number; riskPercent?: number;
  profitPercent?: number; // accepted, ignored — an estimate makes no selling decision
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

  /**
   * Cost one line — from a structured ResourceBreakdown when given (Materials/Labour/Plant/… entered
   * in the Estimation Workspace), else from raw components. Either way the ENGINE computes the money;
   * the UI never sends a total. `compileResourceBreakdown` needs the line quantity because per-line
   * resource figures (man-hours, transport…) are line totals it divides down to a per-unit rate.
   */
  private buildCostLine(b: BuildUpInput, qty: number): EstimateBuildUp {
    let resources: EstimateBuildUp['resources'] = null;
    let rawComponents: Array<Pick<CostComponent, 'costType' | 'description' | 'quantity' | 'unitCost'>>;
    if (b.resources) {
      const compiled = compileResourceBreakdown(b.resources, qty);
      resources = compiled.resources;
      rawComponents = compiled.components;
    } else {
      rawComponents = b.components ?? [];
    }
    const components: CostComponent[] = rawComponents.map((c) => ({ id: newId(), costType: c.costType, description: c.description, quantity: Number(c.quantity) || 0, unitCost: Number(c.unitCost) || 0, amount: moneyNumber((Number(c.quantity) || 0) * (Number(c.unitCost) || 0)) }));
    const cost = computeCostBuildUp(components, { indirectPercent: Number(b.indirectPercent) || 0, overheadPercent: Number(b.overheadPercent) || 0, riskPercent: Number(b.riskPercent) || 0 });
    return {
      id: newId(), basisLineId: b.basisLineId, components, resources,
      indirectPercent: Number(b.indirectPercent) || 0, overheadPercent: Number(b.overheadPercent) || 0, riskPercent: Number(b.riskPercent) || 0,
      // No commercial decision at estimate time: profit is zero, and the "rate" a cost-only line
      // carries is its per-unit ESTIMATED COST — never a selling price.
      profitPercent: 0, profitAmount: 0,
      directCost: cost.directCost, indirectAmount: cost.indirectAmount, overheadAmount: cost.overheadAmount, riskAmount: cost.riskAmount,
      sellingRate: cost.estimatedCost,
      notes: b.notes ?? null,
    };
  }

  /**
   * The estimate's totals — DERIVED from the saved build-ups, never taken from the caller.
   * `estimatedCost` is the sum of each line's per-unit (direct + indirect + overhead + risk) × qty, so
   * the headline figure is always reproducible from the resource data underneath it, never a typed-in
   * number sitting on top of an un-auditable UI.
   */
  private estimateTotals(buildUps: EstimateBuildUp[], qtyByLine: Map<Id, number>): { totalDirectCost: number; estimatedCost: number; lineCount: number } {
    const perUnitEstimatedCost = (b: EstimateBuildUp) => b.directCost + b.indirectAmount + b.overheadAmount + b.riskAmount;
    const totalDirectCost = moneyNumber(buildUps.reduce((s, b) => s + b.directCost * (qtyByLine.get(b.basisLineId) ?? 0), 0));
    const estimatedCost = moneyNumber(buildUps.reduce((s, b) => s + perUnitEstimatedCost(b) * (qtyByLine.get(b.basisLineId) ?? 0), 0));
    return { totalDirectCost, estimatedCost, lineCount: buildUps.length };
  }

  /** Every basis line must carry a real quantity before it can be costed (unknown is not zero). */
  private assertLinesCostable(lines: BasisLine[]): Map<Id, number> {
    const unknown = lines.filter((l) => l.quantity === null || l.quantity === undefined).map((l) => l.lineId);
    if (unknown.length > 0) {
      throw new Error(`cannot build an estimate: ${unknown.length} basis line(s) still have an unknown quantity — supply a quantity for every line first (unknown is not zero)`);
    }
    return new Map(lines.map((l) => [l.lineId, l.quantity ?? 0]));
  }

  /**
   * Build an estimate revision (draft) on a basis — COST ONLY (Slice 6A/6B). Each line is costed from a
   * structured resource breakdown (or raw components) by the engine; no profit, margin or selling number
   * is decided here. `totals.estimatedCost` is the canonical output. When no build-ups are supplied the
   * revision is SEEDED with one zero-cost line per basis line, so the Estimation Workspace opens with the
   * approved scope laid out and ready to fill. The selling decision is made later, in `freezePricing`.
   */
  async addEstimate(input: { tenantId: Id; companyId?: Id | null; packageId: Id; basisRevisionId: Id; lines: BasisLine[]; buildUps: BuildUpInput[]; createdBy?: Id | null }): Promise<{ estimate: EstimateRevision; buildUps: EstimateBuildUp[] }> {
    const qtyByLine = this.assertLinesCostable(input.lines);
    // Open Estimation with no build-ups yet ⇒ seed a zero-cost row per basis line, preserving basisLineId.
    const seed: BuildUpInput[] = input.buildUps.length > 0
      ? input.buildUps
      : input.lines.map((l) => ({ basisLineId: l.lineId, components: [] }));
    const buildUps = seed.map((b) => this.buildCostLine(b, qtyByLine.get(b.basisLineId) ?? 0));
    const totals = this.estimateTotals(buildUps, qtyByLine);

    const revisionNo = (await this.store.listEstimates(input.tenantId, input.packageId)).length + 1;
    const estimate = makeEstimateRevision({ tenantId: input.tenantId, companyId: input.companyId ?? null, packageId: input.packageId, basisRevisionId: input.basisRevisionId, revisionNo, totals, createdBy: input.createdBy ?? null });
    await this.store.saveEstimate(estimate);
    await this.store.saveBuildUps(input.tenantId, input.companyId ?? null, estimate.id, buildUps);
    return { estimate, buildUps };
  }

  /**
   * Edit the per-line resource build-ups of a DRAFT estimate — the "edit freely" half of the estimate
   * lifecycle. Only a draft may change: once frozen or approved the revision is the immutable thing a
   * price was (or will be) committed against, and a change must create the next revision. Totals are
   * recomputed from the saved build-ups, so `estimatedCost` can never drift from the resource data.
   */
  async updateEstimateBuildUps(input: { tenantId: Id; companyId?: Id | null; packageId: Id; estimateId: Id; buildUps: BuildUpInput[]; actorId?: Id | null }): Promise<{ estimate: EstimateRevision; buildUps: EstimateBuildUp[] }> {
    const estimate = (await this.store.listEstimates(input.tenantId, input.packageId)).find((e) => e.id === input.estimateId);
    if (!estimate) throw new Error(`estimate revision ${input.estimateId} not found`);
    if (estimate.status !== 'draft') {
      throw new Error(`only a draft estimate revision can be edited — E-${String(estimate.revisionNo).padStart(3, '0')} is already ${estimate.status}`);
    }
    const basis = (await this.store.listBasis(input.tenantId, input.packageId)).find((b) => b.id === estimate.basisRevisionId);
    const qtyByLine = this.assertLinesCostable(basis?.lines ?? []);
    // A build-up may only cost a line that exists in the approved basis — no smuggling scope in here.
    const allowed = new Set((basis?.lines ?? []).map((l) => l.lineId));
    const foreign = input.buildUps.filter((b) => !allowed.has(b.basisLineId)).map((b) => b.basisLineId);
    if (foreign.length > 0) throw new Error(`cannot cost lines that are not in the approved basis: ${foreign.join(', ')}`);

    const buildUps = input.buildUps.map((b) => this.buildCostLine(b, qtyByLine.get(b.basisLineId) ?? 0));
    const totals = this.estimateTotals(buildUps, qtyByLine);
    const updated: EstimateRevision = { ...estimate, totals };
    await this.store.saveEstimate(updated);
    await this.store.saveBuildUps(input.tenantId, input.companyId ?? estimate.companyId ?? null, estimate.id, buildUps);
    return { estimate: updated, buildUps };
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
   * Recompute a legacy estimate's `estimatedCost` from its build-up rows — the cost base a pre-6A
   * estimate never stored separately. Used only by the legacy freeze path.
   */
  private async legacyEstimatedCost(tenantId: Id, packageId: Id, estimate: EstimateRevision): Promise<number> {
    const buildUps = await this.store.listBuildUps(tenantId, estimate.id);
    const basis = (await this.store.listBasis(tenantId, packageId)).find((b) => b.id === estimate.basisRevisionId);
    const qtyByLine = new Map((basis?.lines ?? []).map((l) => [l.lineId, l.quantity ?? 0]));
    return moneyNumber(buildUps.reduce(
      (s, b) => s + (b.directCost + b.indirectAmount + b.overheadAmount + b.riskAmount) * (qtyByLine.get(b.basisLineId) ?? 0), 0));
  }

  /**
   * Freeze pricing — the ONE place a Direct deal's selling price is decided (Slice 6A).
   *
   * The estimate is cost-only, so a NEW estimate REQUIRES an explicit PricingPolicy (target margin or
   * markup): there is no silent default, because a 0% default would quote at cost. A LEGACY estimate
   * (created before the boundary, still carrying its own selling decision) is honoured by a tagged
   * compatibility policy that reproduces its historical selling value to the cent — never silently
   * re-priced. The selling price is computed FORWARD from the policy; the sheet then carries that
   * number by construction, so nothing is reverse-engineered.
   *
   * Idempotent: a package that already has a frozen sheet returns it (the policy is not re-applied).
   */
  async freezePricing(input: { tenantId: Id; companyId?: Id | null; opportunityId: Id; policy?: PricingPolicy; actorId?: Id | null }): Promise<PricingSheet> {
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

    const totals = (approved.totals ?? {}) as { totalDirectCost?: number; estimatedCost?: number; totalSellingValue?: number; lineCount?: number };
    const lineCount = Number(totals.lineCount) || 0;
    const isCostOnly = totals.estimatedCost !== undefined; // post-6A estimate

    // ── decide estimatedCost, selling price and how it was decided ──
    let estimatedCost: number;
    let sellingPrice: number;
    let policySource: 'explicit' | 'legacy_estimate_profit';
    let policyLabel: string;

    if (input.policy) {
      // NEW path — forward from an explicit commercial decision. Works for legacy too if the caller
      // chooses to re-price it deliberately.
      estimatedCost = isCostOnly ? Number(totals.estimatedCost) : await this.legacyEstimatedCost(input.tenantId, pkg.id, approved);
      const s = computeCommercialPricing(estimatedCost, input.policy);
      sellingPrice = s.sellingPrice;
      policySource = 'explicit';
      policyLabel = input.policy.method === 'markup' ? `${input.policy.percent}% markup` : `${input.policy.percent}% target margin`;
    } else if (!isCostOnly) {
      // LEGACY compatibility — no policy given, but the estimate already made the decision. Reproduce
      // its historical selling value EXACTLY; the price is not recomputed, only re-homed onto a sheet.
      sellingPrice = moneyNumber(Number(totals.totalSellingValue) || 0);
      estimatedCost = await this.legacyEstimatedCost(input.tenantId, pkg.id, approved);
      policySource = 'legacy_estimate_profit';
      const impliedMarkup = estimatedCost > 0 ? moneyNumber(((sellingPrice - estimatedCost) / estimatedCost) * 100, 4) : 0;
      policyLabel = `legacy estimate profit (~${impliedMarkup}% markup)`;
    } else {
      // NEW estimate, NO policy — the explicit, honest failure. Pricing is a decision, not a default.
      throw new Error('a pricing policy is required to freeze pricing — choose a target margin or markup for this cost-only estimate (pricing is a decision, not a default)');
    }

    // Build the sheet's line FORWARD: it carries the estimated cost, and a margin chosen so the sheet's
    // own engine reproduces exactly the selling price decided above — no back-solving from a target.
    const marginToReproduce = sellingPrice > 0 ? (1 - estimatedCost / sellingPrice) * 100 : 0;
    const line: EstimationLineInput = {
      ...emptyEstimationInput(),
      description: `Estimate E-${String(approved.revisionNo).padStart(3, '0')} — estimated cost ${estimatedCost} (${lineCount} line(s), ${policyLabel})`,
      quantity: 1,
      subcontractUnitCost: estimatedCost,
      targetMarginPercent: marginToReproduce,
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
    // Guard: the sheet must carry exactly the decided price. If the two engines disagree by a cent,
    // stop — do not freeze a number nobody chose.
    if (sheet.totals.totalSell !== sellingPrice) {
      throw new Error(`pricing sheet total ${sheet.totals.totalSell} does not reproduce the decided selling price ${sellingPrice}`);
    }
    await this.pricing.save(sheet);
    sheet = freezeSheet(sheet, input.actorId ?? null);
    await this.pricing.save(sheet);
    this.logger.log(`Pricing frozen for package ${pkg.id} (sheet ${sheet.id}, estimate ${approved.id}, ${policySource}: ${policyLabel}, cost ${estimatedCost} → sell ${sellingPrice})`);
    return sheet;
  }

  /**
   * The FROZEN pricing sheet a direct deal's quotation must be generated from. The governed chain owns
   * the quote's numbers, not just the permission to raise one.
   */
  async frozenPricingFor(tenantId: Id, opportunityId: Id): Promise<PricingSheet | null> {
    const pkg = await this.store.getByOpportunity(tenantId, opportunityId);
    if (!pkg) return null;
    // Effectivity (Slice 8): the CURRENT frozen sheet — never a superseded historical revision. With
    // one current frozen per package this is deterministic; `limit:1` no longer picks arbitrarily.
    const [sheet] = await this.pricing.list({ tenantId, packageId: pkg.id, status: 'frozen', currentOnly: true, limit: 1 });
    return sheet ?? null;
  }

  /** Record the quotation a frozen sheet produced — closing the P→Q link. */
  async linkQuotationToPricing(sheet: PricingSheet, quotationId: Id): Promise<PricingSheet> {
    const linked = linkQuotation(sheet, quotationId);
    await this.pricing.save(linked);
    return linked;
  }

  // ══ Pricing Workspace (Slice 7) — the commercial decision, as a draft→frozen lifecycle ═══════════
  //
  //   Approved Estimate (cost, read-only) → open draft → set policy → freeze → quotation
  //
  // The cost baseline is the approved estimate's estimatedCost, snapshotted at open. The only decision
  // here is the selling price; it is computed by computeCommercialPricing (one engine), never by the UI.

  /** The approved estimate's cost baseline for a deal — the read-only starting point of pricing. */
  private async pricingBaseline(tenantId: Id, opportunityId: Id): Promise<{ pkg: { id: Id; companyId: Id | null }; estimateId: Id; baselineCost: number }> {
    const pkg = await this.store.getByOpportunity(tenantId, opportunityId);
    if (!pkg) throw new Error('a pre-award package is required before pricing can start');
    const estimates = await this.store.listEstimates(tenantId, pkg.id);
    const approved = [...estimates].reverse().find((e) => e.status === 'approved');
    if (!approved) throw new Error('an approved estimate revision is required before pricing can start');
    const basis = (await this.store.listBasis(tenantId, pkg.id)).find((b) => b.id === approved.basisRevisionId);
    if (basis) assertBasisQuantitiesKnown(basis, 'start pricing');
    const totals = (approved.totals ?? {}) as { estimatedCost?: number };
    const baselineCost = totals.estimatedCost !== undefined
      ? moneyNumber(Number(totals.estimatedCost) || 0)
      : await this.legacyEstimatedCost(tenantId, pkg.id, approved);
    return { pkg: { id: pkg.id, companyId: pkg.companyId }, estimateId: approved.id, baselineCost };
  }

  /**
   * Open the Pricing Workspace for a deal. Returns the sheet to work on: an existing draft if one is
   * open, else the current frozen sheet (read-only — the UI offers a new revision), else a fresh v1
   * draft on the approved estimate's cost. Never creates a second draft.
   */
  async openPricing(input: { tenantId: Id; companyId?: Id | null; opportunityId: Id; actorId?: Id | null }): Promise<PricingSheet> {
    const { pkg, estimateId, baselineCost } = await this.pricingBaseline(input.tenantId, input.opportunityId);
    const sheets = await this.pricing.list({ tenantId: input.tenantId, packageId: pkg.id, limit: 50 });
    const draft = sheets.find((s) => s.status === 'draft');
    if (draft) return draft;
    const frozen = sheets.find((s) => s.status === 'frozen');
    if (frozen) return frozen; // read-only current price; caller may open a new revision explicitly
    const sheet = openCommercialPricing({
      tenantId: input.tenantId, companyId: input.companyId ?? pkg.companyId, name: `Pre-Award pricing — package ${pkg.id.slice(0, 8)}`,
      opportunityId: input.opportunityId, packageId: pkg.id, estimateRevisionId: estimateId, baselineCost, createdBy: input.actorId,
    });
    await this.pricing.save(sheet);
    this.logger.log(`Pricing draft P-${String(sheet.version).padStart(3, '0')} opened for opportunity ${input.opportunityId} (baseline ${baselineCost})`);
    return sheet;
  }

  /** Explicitly open the NEXT pricing revision from the current frozen sheet (re-pricing). */
  async openPricingRevision(input: { tenantId: Id; companyId?: Id | null; opportunityId: Id; actorId?: Id | null }): Promise<PricingSheet> {
    const { pkg, estimateId, baselineCost } = await this.pricingBaseline(input.tenantId, input.opportunityId);
    const sheets = await this.pricing.list({ tenantId: input.tenantId, packageId: pkg.id, limit: 50 });
    if (sheets.some((s) => s.status === 'draft')) throw new Error('a pricing draft is already open — freeze or edit it before opening a new revision');
    const frozen = [...sheets].sort((a, b) => b.version - a.version)[0];
    if (!frozen || frozen.status !== 'frozen') throw new Error('cannot open a pricing revision: there is no frozen pricing yet');
    const sheet = openCommercialPricing({
      tenantId: input.tenantId, companyId: input.companyId ?? pkg.companyId, name: frozen.name,
      opportunityId: input.opportunityId, packageId: pkg.id, estimateRevisionId: estimateId, baselineCost,
      version: frozen.version + 1, parentSheetId: frozen.id, createdBy: input.actorId,
    });
    await this.pricing.save(sheet);
    return sheet;
  }

  /** Live preview — the selling figures for a policy on the current cost baseline. Pure, no persistence. */
  async previewPricing(input: { tenantId: Id; opportunityId: Id; policy: PricingPolicy; discount?: PricingDiscount | null }): Promise<{ baselineCost: number; figures: SellingFigures }> {
    const { baselineCost } = await this.pricingBaseline(input.tenantId, input.opportunityId);
    return { baselineCost, figures: previewCommercialPricing(baselineCost, input.policy, input.discount ?? null) };
  }

  /** Set the commercial policy on a DRAFT pricing sheet. The engine recomputes; the UI sends no total. */
  async setPricingPolicy(input: { tenantId: Id; opportunityId: Id; sheetId: Id; policy: PricingPolicy; discount?: PricingDiscount | null }): Promise<PricingSheet> {
    const sheet = await this.pricing.get(input.sheetId);
    if (!sheet || sheet.tenantId !== input.tenantId) throw new Error(`pricing sheet ${input.sheetId} not found`);
    const priced = applyPricingPolicy(sheet, input.policy, input.discount ?? null);
    await this.pricing.save(priced);
    return priced;
  }

  /** Freeze a DRAFT pricing sheet — the commercial commitment. Refuses without a policy. */
  async freezePricingSheetById(input: { tenantId: Id; opportunityId: Id; sheetId: Id; actorId?: Id | null }): Promise<PricingSheet> {
    const sheet = await this.pricing.get(input.sheetId);
    if (!sheet || sheet.tenantId !== input.tenantId) throw new Error(`pricing sheet ${input.sheetId} not found`);
    const frozen = freezeSheet(sheet, input.actorId ?? null);
    await this.pricing.save(frozen);
    this.logger.log(`Pricing P-${String(frozen.version).padStart(3, '0')} frozen for opportunity ${input.opportunityId} (sell ${frozen.totals.totalSell})`);
    return frozen;
  }

  /** The Pricing Workspace read — the sheet + its cost baseline + whether it is still editable. */
  async readPricingWorkspace(tenantId: Id, opportunityId: Id, sheetId: Id): Promise<PricingWorkspaceView | null> {
    const sheet = await this.pricing.get(sheetId);
    if (!sheet || sheet.tenantId !== tenantId) return null;
    return { sheet, baselineCost: sheet.commercial?.baselineCost ?? sheet.totals.totalCost, editable: sheet.status === 'draft' };
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
      // pricingFrozen means a CURRENT committed price exists — a superseded historical revision does not count.
      this.pricing.list({ tenantId, packageId: pkg.id, status: 'frozen', currentOnly: true, limit: 1 }),
    ]);
    return packageGovernance(pkg.id, basis, estimates, frozenSheets.length > 0);
  }

  /**
   * The whole Pre-Award aggregate for one deal — package + its scope-basis revisions, estimate
   * revisions, and pricing sheets, plus the derived governance. This is the single read the Commercial
   * UI renders; the UI holds NO readiness state of its own — every gate comes from `governance` here.
   */
  /**
   * The Estimation Workspace read: one estimate revision, its per-line build-ups, and the basis lines
   * they cost (with quantity + provenance). Everything the workspace lays out, in one call.
   */
  async readEstimateWorkspace(tenantId: Id, opportunityId: Id, estimateId: Id): Promise<EstimateWorkspaceView | null> {
    const pkg = await this.store.getByOpportunity(tenantId, opportunityId);
    if (!pkg) return null;
    const estimate = (await this.store.listEstimates(tenantId, pkg.id)).find((e) => e.id === estimateId);
    if (!estimate) return null;
    const [buildUps, basisList] = await Promise.all([
      this.store.listBuildUps(tenantId, estimateId),
      this.store.listBasis(tenantId, pkg.id),
    ]);
    const basis = basisList.find((b) => b.id === estimate.basisRevisionId) ?? null;
    return { packageId: pkg.id, estimate, buildUps, basisLines: basis?.lines ?? [], editable: estimate.status === 'draft' };
  }

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

export interface EstimateWorkspaceView {
  packageId: Id;
  estimate: EstimateRevision;
  buildUps: EstimateBuildUp[];
  basisLines: BasisLine[];
  /** True only while the estimate is a draft — the workspace is read-only otherwise. */
  editable: boolean;
}

export interface PricingWorkspaceView {
  sheet: PricingSheet;
  /** The approved estimate's cost — the read-only baseline the selling price is built on. */
  baselineCost: number;
  /** True only while the sheet is a draft. */
  editable: boolean;
}
