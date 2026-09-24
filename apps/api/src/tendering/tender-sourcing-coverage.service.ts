import { ConflictException, Controller, Get, Injectable, NotFoundException, Param, Query, type OnModuleInit } from '@nestjs/common';
import {
  DerivedEvidenceRegistry, ParseUuidOr404Pipe, Permissions, SettingsService, TenantContext,
  type DerivedEvidenceProvider, type DerivedEvidenceVerdict,
} from '@aura/core';
import { admitCurrency, type DocumentEvidence } from '@aura/shared';
import { EstimateService, TenderService } from '@aura/tendering';
import { QuotationService } from '@aura/crm';
import {
  CommercialComparisonService, PurchaseRequestLineService, PurchaseRequestService, QuotationLineEvaluationService,
} from '@aura/procurement';

/** One supplier whose answer on one requirement COUNTS — and everything that made it count. */
export interface QualifyingOffer {
  supplierKey: string;
  supplierId: string | null;
  supplierName: string;
  revisionId: string;
  quotationLineId: string;
  unitValue: number;
  currency: string;
}

/** One supplier whose answer does NOT count, and the reason in words. */
export interface ExcludedOffer {
  supplierName: string;
  reason: string;
}

export interface RequirementCoverage {
  prLineId: string;
  materialCode: string;
  qualifying: QualifyingOffer[];
  excluded: ExcludedOffer[];
  covered: boolean;
}

export interface SupplyItemCoverage {
  boqItemId: string;
  itemCode: string;
  description: string;
  /** Why this item needs supplier prices: it is priced with material, or nobody has built it up. */
  requiredBecause: 'priced_with_material' | 'not_built_up';
  requirements: RequirementCoverage[];
  covered: boolean;
  /** When uncovered, the first reason — for a reader who needs one sentence. */
  gap: string | null;
}

export interface TenderSupplyCoverage {
  tenderId: string;
  comparisonDate: string;
  baseCurrency: string;
  independentSuppliersRequired: number;
  items: SupplyItemCoverage[];
  covered: boolean;
}

/** Three, by the programme owner's rule — and three INDEPENDENT suppliers, not three answers. */
const INDEPENDENT_SUPPLIERS_REQUIRED = 3;

/** The statuses in which the offer's evidence is still being assembled and decided on. */
const OPEN_FOR_DECISION: ReadonlySet<string> = new Set(['draft', 'internal_review']);

/**
 * IS A BID'S SUPPLY SCOPE GENUINELY MARKET-TESTED?
 *
 * The programme owner's six conditions, each answered by procurement's own authorities and none
 * re-implemented here:
 *
 *   SUPPLIER    three INDEPENDENT suppliers — counted by supplier-master identity, never by answers
 *   OFFER       a CONFIRMED revision, live on the comparison date — the governed comparison's
 *               `provenance` and `commercialStatus`, not a quote header or a cancelled offer
 *   LINK        quotation lines that answer requisition lines of THIS tender's pricing requisition,
 *               each mapped by a person to a BOQ item and a material-master record
 *   TECHNICAL   a current, ELIGIBLE verdict on the line — procurement's `eligibilityFor`
 *   COMMERCIAL  the line normalised to COMPARABLE by the governed commercial comparison
 *   READINESS   the REQUIRED SCOPE covered — every BOQ item priced with material, and every item
 *               nobody has built up yet, since its supply content is unknown. Three quotes on one
 *               camera do not stand in for a CCTV system.
 *
 * It computes; it never writes. Registered as the provider for a tender offer's VENDOR_QUOTE, so the
 * checklist and the approval gate both read the answer as it is at that moment.
 */
@Injectable()
export class TenderSourcingCoverageService implements DerivedEvidenceProvider, OnModuleInit {
  readonly entityType = 'crm.quotation';
  readonly requirementType = 'VENDOR_QUOTE' as const;

  constructor(
    private readonly registry: DerivedEvidenceRegistry,
    private readonly quotations: QuotationService,
    private readonly tenders: TenderService,
    private readonly estimates: EstimateService,
    private readonly prs: PurchaseRequestService,
    private readonly prLines: PurchaseRequestLineService,
    private readonly comparison: CommercialComparisonService,
    private readonly evaluations: QuotationLineEvaluationService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  /** VENDOR_QUOTE on a tender offer. A quotation not raised from a tender keeps attached evidence. */
  async derive(tenantId: string, quotationId: string): Promise<DerivedEvidenceVerdict> {
    const quotation = await this.quotations.get(quotationId);
    if (!quotation || quotation.tenantId !== tenantId || !quotation.sourceTenderId) {
      return { applies: false, satisfied: false, requiredCount: 0, evidence: [] };
    }
    // Once the offer has left review, the decision has been taken on what the approval recorded.
    if (!OPEN_FOR_DECISION.has(quotation.status)) {
      return { applies: true, frozen: true, satisfied: false, requiredCount: 0, evidence: [] };
    }
    const coverage = await this.forTender(tenantId, quotation.sourceTenderId);
    const evaluatedAt = new Date().toISOString();
    const evidence: DocumentEvidence[] = coverage.items.filter((item) => item.covered).map((item) => ({
      type: 'EXTERNAL_REFERENCE',
      reference: `supply item ${item.itemCode} — ` + item.requirements
        .map((r) => `${r.materialCode}: ${r.qualifying.map((q) => `${q.supplierName} (revision ${q.revisionId}, line ${q.quotationLineId})`).join(', ')}`)
        .join('; ') + ` — compared ${coverage.comparisonDate} in ${coverage.baseCurrency}`,
      checkedBy: null,
      checkedAt: evaluatedAt,
    }));
    return {
      applies: true,
      // Nothing required is not the same as everything covered: a tender with no supply scope at all
      // has had nothing market-tested, and the approver must say so by waiving.
      satisfied: coverage.items.length > 0 && coverage.covered,
      requiredCount: Math.max(1, coverage.items.length),
      evidence,
      detail: coverage,
    };
  }

  async forTender(tenantId: string, tenderId: string, comparisonDate?: string): Promise<TenderSupplyCoverage> {
    const date = (comparisonDate ?? new Date().toISOString().slice(0, 10)).trim();
    const configured = (await this.settings.get(tenantId, 'finance.defaultCurrency').catch(() => null))?.trim() || 'AED';
    const admitted = admitCurrency(configured);
    // A tenant whose base currency cannot be admitted has no comparison to count — say so, never guess.
    if (!admitted.admissible) throw new ConflictException(admitted.detail);
    const baseCurrency = admitted.currency;

    const current = await this.tenders.getBOQByTender(tenantId, tenderId);
    const items = current?.items ?? [];
    const buildUps = new Map((await this.estimates.listByTender(tenantId, tenderId)).map((b) => [b.boqItemId, b]));

    // Every requisition line of THIS tender's pricing requisitions, by the BOQ item it prices.
    const pricing = await this.prs.list({ tenantId, sourceTenderId: tenderId, purpose: 'tender_pricing', limit: 50 });
    const linesByItem = new Map<string, Array<{ id: string; materialCode: string }>>();
    for (const pr of pricing) {
      for (const line of await this.prLines.listLines(pr.id)) {
        if (!line.sourceBoqItemId) continue;
        const list = linesByItem.get(line.sourceBoqItemId) ?? [];
        list.push({ id: line.id, materialCode: line.materialCode });
        linesByItem.set(line.sourceBoqItemId, list);
      }
    }

    const coverage: SupplyItemCoverage[] = [];
    for (const item of items) {
      const buildUp = buildUps.get(item.id);
      const pricesMaterial = buildUp?.components.some((c) => c.costType === 'material' && c.amount > 0) ?? false;
      if (buildUp && !pricesMaterial) continue; // installation-only: no supply to market-test
      const requiredBecause = buildUp ? 'priced_with_material' as const : 'not_built_up' as const;

      const lines = linesByItem.get(item.id) ?? [];
      const requirements: RequirementCoverage[] = [];
      for (const line of lines) requirements.push(await this.requirementCoverage(tenantId, line, { baseCurrency, comparisonDate: date }));

      const covered = requirements.length > 0 && requirements.every((r) => r.covered);
      const gap = covered ? null
        : requirements.length === 0 ? 'not put to suppliers — no pricing requisition line is mapped to this item'
        : (() => {
            const short = requirements.find((r) => !r.covered)!;
            return `${short.materialCode} has ${short.qualifying.length} of ${INDEPENDENT_SUPPLIERS_REQUIRED} independent suppliers that count`;
          })();
      coverage.push({ boqItemId: item.id, itemCode: item.itemCode, description: item.description, requiredBecause, requirements, covered, gap });
    }

    return {
      tenderId, comparisonDate: date, baseCurrency,
      independentSuppliersRequired: INDEPENDENT_SUPPLIERS_REQUIRED,
      items: coverage,
      covered: coverage.length > 0 && coverage.every((c) => c.covered),
    };
  }

  private async requirementCoverage(
    tenantId: string,
    line: { id: string; materialCode: string },
    context: { baseCurrency: string; comparisonDate: string },
  ): Promise<RequirementCoverage> {
    const compared = await this.comparison.compareRequirement(tenantId, line.id, context);
    const qualifying = new Map<string, QualifyingOffer>();
    const excluded: ExcludedOffer[] = [];
    for (const row of compared.offers) {
      const name = row.supplierName;
      if (!row.provenance || !row.quotationLineId) { excluded.push({ supplierName: name, reason: row.notComparableReason ?? 'no confirmed revision answers this requirement' }); continue; }
      if (row.commercialStatus !== 'live') { excluded.push({ supplierName: name, reason: row.commercialStatus === 'expired' ? `offer expired before ${context.comparisonDate}` : 'offer validity unknown' }); continue; }
      if (row.normalisedUnitPrice.status !== 'comparable') { excluded.push({ supplierName: name, reason: 'not commercially comparable' }); continue; }
      const technical = await this.evaluations.eligibilityFor(tenantId, row.quotationLineId);
      if (technical.eligibility !== 'eligible') {
        excluded.push({ supplierName: name, reason: technical.eligibility === 'not_eligible' ? 'judged non-compliant by the Technical Manager' : 'no current technical verdict' });
        continue;
      }
      // INDEPENDENT means distinct suppliers. Two answers from one supplier are one supplier — and the
      // second is shown as excluded, so nobody reads a longer offer list as a wider market.
      const supplierKey = row.supplierId ?? `name:${name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
      if (qualifying.has(supplierKey)) {
        excluded.push({ supplierName: name, reason: 'another offer from a supplier already counted — one supplier counts once, however many offers it makes' });
        continue;
      }
      qualifying.set(supplierKey, {
        supplierKey, supplierId: row.supplierId, supplierName: name,
        revisionId: row.provenance.revisionId, quotationLineId: row.quotationLineId,
        unitValue: row.normalisedUnitPrice.unitValue, currency: row.normalisedUnitPrice.currency,
      });
    }
    const list = [...qualifying.values()];
    return { prLineId: line.id, materialCode: line.materialCode, qualifying: list, excluded, covered: list.length >= INDEPENDENT_SUPPLIERS_REQUIRED };
  }
}

/** The coverage, for the estimator building it and the approver deciding on it. */
@Controller('tendering/tenders')
export class TenderSourcingCoverageController {
  constructor(private readonly coverage: TenderSourcingCoverageService, private readonly tenders: TenderService, private readonly tenant: TenantContext) {}

  @Permissions('tendering.estimate.read')
  @Get(':id/supply-coverage')
  async supplyCoverage(@Param('id', ParseUuidOr404Pipe) id: string, @Query('comparisonDate') comparisonDate?: string): Promise<TenderSupplyCoverage> {
    const tender = await this.tenders.get(id);
    if (!tender || tender.tenantId !== this.tenant.get().tenantId) throw new NotFoundException(`tender ${id} not found`);
    return this.coverage.forTender(tender.tenantId, tender.id, comparisonDate);
  }
}
