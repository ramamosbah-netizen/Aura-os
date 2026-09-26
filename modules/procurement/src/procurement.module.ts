import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { PURCHASE_ORDER_STORE } from './purchase-order-store';
import { InMemoryPurchaseOrderStore } from './in-memory-purchase-order-store';
import { PostgresPurchaseOrderStore } from './postgres-purchase-order-store';
import { PurchaseOrderService } from './purchase-order.service';

import { PURCHASE_REQUEST_STORE } from './purchase-request-store';
import { InMemoryPurchaseRequestStore } from './in-memory-purchase-request-store';
import { PostgresPurchaseRequestStore } from './postgres-purchase-request-store';
import { PurchaseRequestService } from './purchase-request.service';

import { PR_LINE_STORE } from './purchase-request-line-store';
import { QUOTATION_LINE_STORE } from './quotation-line.store';
import { QUOTATION_LINE_EVALUATION_STORE } from './quotation-line-evaluation.store';
import { QuotationLineEvaluationService } from './quotation-line-evaluation.service';
import { InMemoryQuotationLineEvaluationStore } from './in-memory-quotation-line-evaluation-store';
import { PostgresQuotationLineEvaluationStore } from './postgres-quotation-line-evaluation-store';
import { QuotationLineService } from './quotation-line.service';
import { CommercialComparisonService } from './commercial-comparison.service';
import { TechnicalComplianceService } from './technical-compliance.service';
import { QuotationCaptureService } from './quotation-capture.service';
import { SourcingRecommendationService } from './sourcing-recommendation.service';
import { TenderPricingBoundary } from './tender-pricing-boundary.service';
import { SourcingAwardService } from './sourcing-award.service';
import { SOURCING_RECOMMENDATION_STORE } from './sourcing-recommendation.store';
import { InMemorySourcingRecommendationStore } from './in-memory-sourcing-recommendation-store';
import { PostgresSourcingRecommendationStore } from './postgres-sourcing-recommendation-store';
import { QUOTATION_FAMILY_STORE } from './quotation-family.store';
import { InMemoryQuotationFamilyStore } from './in-memory-quotation-family-store';
import { PostgresQuotationFamilyStore } from './postgres-quotation-family-store';
import { InMemoryQuotationLineStore } from './in-memory-quotation-line-store';
import { PostgresQuotationLineStore } from './postgres-quotation-line-store';
import { InMemoryPurchaseRequestLineStore } from './in-memory-purchase-request-line-store';
import { PostgresPurchaseRequestLineStore } from './postgres-purchase-request-line-store';
import { PurchaseRequestLineService } from './purchase-request-line.service';

import { PO_LINE_STORE } from './purchase-order-line-store';
import { InMemoryPurchaseOrderLineStore } from './in-memory-purchase-order-line-store';
import { PostgresPurchaseOrderLineStore } from './postgres-purchase-order-line-store';
import { PurchaseOrderLineService } from './purchase-order-line.service';

import { RFQ_STORE } from './rfq-store';
import { InMemoryRfqStore } from './in-memory-rfq-store';
import { PostgresRfqStore } from './postgres-rfq-store';
import { RfqService } from './rfq.service';

import { SUPPLIER_STORE } from './supplier-store';
import { InMemorySupplierStore } from './in-memory-supplier-store';
import { PostgresSupplierStore } from './postgres-supplier-store';
import { SupplierService } from './supplier.service';

import { FRAMEWORK_AGREEMENT_STORE } from './framework-agreement-store';
import { InMemoryFrameworkAgreementStore } from './in-memory-framework-agreement-store';
import { PostgresFrameworkAgreementStore } from './postgres-framework-agreement-store';
import { FrameworkAgreementService } from './framework-agreement.service';

/** The Procurement business module — same shape as the deal-chain modules. */
@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: PURCHASE_ORDER_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPurchaseOrderStore(pool) : new InMemoryPurchaseOrderStore(),
    },
    {
      provide: PURCHASE_REQUEST_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPurchaseRequestStore(pool) : new InMemoryPurchaseRequestStore(),
    },
    {
      provide: RFQ_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresRfqStore(pool) : new InMemoryRfqStore(),
    },
    {
      provide: SUPPLIER_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSupplierStore(pool) : new InMemorySupplierStore(),
    },
    {
      provide: FRAMEWORK_AGREEMENT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresFrameworkAgreementStore(pool) : new InMemoryFrameworkAgreementStore(),
    },
    {
      provide: PR_LINE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPurchaseRequestLineStore(pool) : new InMemoryPurchaseRequestLineStore(),
    },
    {
      // What a supplier offered, item by item. Declarations only — no verdicts, no comparable value.
      provide: QUOTATION_LINE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresQuotationLineStore(pool) : new InMemoryQuotationLineStore(),
    },
    QuotationLineService,
    CommercialComparisonService,
    TechnicalComplianceService,
    {
      // QC-01 — the supplier quotation as an immutable family of offers and revisions. The in-memory
      // store enforces the same invariants the Postgres indexes do, so a violation cannot be a
      // surprise that only production sees.
      provide: QUOTATION_FAMILY_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresQuotationFamilyStore(pool) : new InMemoryQuotationFamilyStore(),
    },
    QuotationCaptureService,
    {
      // SUP-13 — the governed sourcing recommendation. A decision record, never a computed winner.
      provide: SOURCING_RECOMMENDATION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSourcingRecommendationStore(pool) : new InMemorySourcingRecommendationStore(),
    },
    SourcingRecommendationService,
    TenderPricingBoundary,
    // SUP-14 — the award. Turns an APPROVED recommendation into purchase orders that carry each
    // supplier's own currency and terms. It binds no store of its own: an award writes purchase
    // orders and their lines, and reads the offers the decision was made on.
    SourcingAwardService,
    {
      // SUP-01 — the internal technical verdict. A different authority from the supplier's claim.
      provide: QUOTATION_LINE_EVALUATION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresQuotationLineEvaluationStore(pool) : new InMemoryQuotationLineEvaluationStore(),
    },
    QuotationLineEvaluationService,
    {
      provide: PO_LINE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPurchaseOrderLineStore(pool) : new InMemoryPurchaseOrderLineStore(),
    },
    PurchaseOrderService,
    PurchaseRequestService,
    PurchaseRequestLineService,
    PurchaseOrderLineService,
    RfqService,
    SupplierService,
    FrameworkAgreementService,
  ],
  exports: [TenderPricingBoundary, CommercialComparisonService, TechnicalComplianceService, QuotationCaptureService, SourcingRecommendationService, SourcingAwardService, PurchaseOrderService, PurchaseRequestService, PurchaseRequestLineService, PurchaseOrderLineService, QuotationLineService, QuotationLineEvaluationService, RfqService, SupplierService, FrameworkAgreementService],
})
export class ProcurementModule {}
