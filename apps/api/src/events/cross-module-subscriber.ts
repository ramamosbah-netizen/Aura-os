import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus, TenantContext } from '@aura/core';
import { ContractService } from '@aura/contracts';
import { ProjectService, WbsService, CbsService, CostLedgerService, QuantityLedgerService, VariationService, hashHandoverSnapshot } from '@aura/projects';
import { PurchaseOrderService, PurchaseRequestService } from '@aura/procurement';
import { TenderService, EstimateSourcingService, type Tender } from '@aura/tendering';
import { AccountService, OpportunityService, QuotationService, SignalService, PreAwardPackageService, isQuotationCommitted, computeQuotationPricing, computeEstimationPricing } from '@aura/crm';
import { CustomerInvoiceService, InvoiceService, AccountService as FinanceAccountService, JournalService, type AccountType } from '@aura/finance';
import { HseService } from '@aura/hse';
import { AmcService } from '@aura/amc';
import { type DomainEvent, projectCompletionSignal, contractCompletionSignal, mulMoney, newId } from '@aura/shared';

/**
 * Cross-module event subscriber — the reactor that wires the deal chain.
 *
 * This is the **architectural centerpiece** of AURA OS's event-driven design:
 * modules stay isolated (no cross-imports), but the reactor observes events and
 * triggers downstream actions by calling the owning module's service.
 *
 * Current reactions (full deal chain):
 *   ┌──────────────────────────────┐     ┌─────────────────────────┐     ┌──────────────────────────┐     ┌──────────────────────┐
 *   │ crm.opportunity.stage_changed│ ──► │ tendering.tender.create │ ──► │ contracts.contract.create│ ──► │ projects.project     │
 *   │ (stage = 'won')              │     │ (auto-draft tender)     │     │ (auto-draft contract)    │     │ (auto-create project)│
 *   └──────────────────────────────┘     └─────────────────────────┘     └──────────────────────────┘     └──────────────────────┘
 *
 *   contracts.ipc.certified         ──► (auto-draft client AR invoice for the net certified)
 *   subcontracts.backcharge.recovered ──► (auto-draft a supplier AP debit note — negative invoice — reducing the subcontractor payable)
 *   procurement.po.created  ──► (log committed cost against project)
 *   inventory.grn.created   ──► (auto-transition PO to 'received' & suggest AP invoice)
 *   inventory.stock.movement_recorded ──► (low-stock crossing reorder level → auto-draft a replenishment PR)
 *   inventory.stock.movement_recorded ──► (perpetual-inventory GL: receipt Dr Inventory/Cr GRNI; issue Dr COGS/Cr Inventory)
 *   amc.workorder.completed ──► (auto-draft a client AR invoice for the billable service visit)
 *   finance.invoice.paid    ──► (log actual cost against project)
 */
@Injectable()
export class CrossModuleSubscriber implements OnModuleInit {
  private readonly logger = new Logger('CrossModule');

  constructor(
    private readonly bus: EventBus,
    private readonly contracts: ContractService,
    private readonly projects: ProjectService,
    private readonly wbs: WbsService,
    private readonly cbs: CbsService,
    private readonly ledger: CostLedgerService,
    private readonly quantityLedger: QuantityLedgerService,
    private readonly variations: VariationService,
    private readonly tenant: TenantContext,
    private readonly pos: PurchaseOrderService,
    private readonly purchaseRequests: PurchaseRequestService,
    private readonly tenders: TenderService,
    private readonly estimateSourcing: EstimateSourcingService,
    private readonly accounts: AccountService,
    private readonly opportunities: OpportunityService,
    private readonly signals: SignalService,
    private readonly quotations: QuotationService,
    private readonly preAwardPackages: PreAwardPackageService,
    private readonly customerInvoices: CustomerInvoiceService,
    private readonly supplierInvoices: InvoiceService,
    private readonly financeAccounts: FinanceAccountService,
    private readonly journals: JournalService,
    private readonly hse: HseService,
    private readonly amc: AmcService,
  ) {}

  /** Resolve a GL account by well-known code, creating it on first use (mirrors payment.service). */
  private async ensureAccount(tenantId: string, code: string, name: string, type: AccountType) {
    const existing = await this.financeAccounts.getByCode(tenantId, code);
    if (existing) return existing;
    return this.financeAccounts.create({ tenantId, code, name, type });
  }

  /**
   * J3 — a tender's award/loss IS the outcome of the Opportunity it was started from, so it closes
   * that deal Won/Lost. Supplies the reason (and, for a win, a value) the CRM stage gate requires so
   * the programmatic close passes the same gate a human would. No-ops when the tender has no source
   * opportunity or the deal is already closed — making an at-least-once redelivery idempotent.
   */
  private async closeSourceOpportunity(
    tenderId: string,
    outcome: 'won' | 'lost',
    awardedAt?: string,
  ): Promise<void> {
    const tender = await this.tenders.get(tenderId);
    if (!tender?.sourceOpportunityId) return; // a tender with no CRM deal behind it
    const opp = await this.opportunities.get(tender.sourceOpportunityId);
    if (!opp || opp.stage === 'won' || opp.stage === 'lost') return; // gone, or already closed
    const ref = tender.reference ?? tender.id;
    const reason = outcome === 'won' ? `Won on tender ${ref}` : `Lost on tender ${ref}`;

    // ADR-0021 — AWARD PROVENANCE comes from the CUSTOMER'S AWARD EVIDENCE, and from nothing else.
    //
    // `this.tenders.get()` above is a LIVE re-read of the tender, not the event payload (the Slice 9
    // rule): the bus delivers at-least-once and out of order, so a payload is a snapshot of one past
    // moment while the aggregate is the current truth. The evidence is read from that live record.
    //
    // WHAT IS NOT A CANDIDATE, and why this reactor no longer consults the commercial baseline:
    // ADR-0021 separates two concepts that were previously collapsed into one number. The Approved
    // Commercial Baseline is the OFFER/commercial basis — what we were willing to be paid — and it
    // still governs the CONTRACT created from this same event (see the contract reactor below, which
    // is deliberately unchanged). It is not evidence of what the customer awarded. Nor is
    // `tender.value` (our mutable estimate) or a submitted bid (what we offered).
    //
    // So a tender won with NO captured evidence claims no provenance and the deal reads LEGACY_WON —
    // "won, award not evidenced" — even when a baseline exists. Visible, never papered over.
    const evidence = outcome === 'won' ? tender.awardEvidence : null;
    const award = evidence
      ? {
          contractedValue: evidence.awardedValue,
          // The CUSTOMER's award date, carried from the evidence. Not this reactor's `now()`, which
          // would date the award by however long the bus took, and not `awardedAt` off the event.
          awardedAt: evidence.awardedAt,
          valueSource: 'customer_award_evidence' as const,
          currency: evidence.currency,
          awardReference: evidence.awardReference,
          evidenceDocumentId: evidence.evidenceDocumentId,
        }
      : null;

    // The tender OWNS this deal's outcome — the public update refuses manual won/lost, so the single
    // sanctioned writer is the dedicated internal command. Idempotent (no-op if already closed).
    await this.opportunities.applyTenderOutcome(
      tender.sourceOpportunityId,
      outcome,
      { reason, value: tender.value, award },
    );
    this.logger.log(
      `⚡ tender.${outcome} → Opportunity "${opp.title}" (${opp.id}) closed ${outcome} (tender ${ref})` +
        (outcome === 'won'
          ? award
            ? ` — award evidenced by the customer: ${award.currency} ${award.contractedValue} (excl. VAT) awarded ${award.awardedAt}`
            : ' — no customer award evidence captured on the tender; the win is recorded WITHOUT award provenance (LEGACY_WON)'
          : ''),
    );
  }

  /**
   * Build the Contract from a tender's PINNED commercial basis. The single place a tender-route
   * contract is created, shared by the award path and the deferred baseline-locked path, so both
   * produce the same contract from the same source and the idempotency key is identical.
   *
   * `basis.value` is the ONLY value source. There is deliberately no fallback: if this is reached
   * without a basis it is a caller bug, not a case to paper over with an estimate.
   */
  private async createContractFromBasis(e: DomainEvent, tender: Tender): Promise<void> {
    const basis = tender.commercialBasis;
    if (!basis) return;
    const contract = await this.contracts.create(
      {
        tenantId: tender.tenantId,
        companyId: tender.companyId,
        title: `Contract for ${tender.title}`,
        tenderId: tender.id,
        tenderTitle: tender.title,
        accountId: tender.accountId,
        accountName: tender.accountName,
        // The approved offer, VAT-inclusive (`baseline.total`) — the Contract Value measure, and a
        // different thing from the deal's Award Value (excl. VAT) and the tender's estimate.
        value: basis.value,
        // Carry the award's explicit currency into the contractual commercial snapshot. The
        // baseline stores the amount, while the governed award evidence is the authoritative
        // currency source for a tender-created contract; never leave the handover currency null
        // when the award supplied it.
        currency: tender.awardEvidence?.currency ?? null,
        commercialBaselineId: basis.baselineId,
        sourceOpportunityId: tender.sourceOpportunityId,
        acceptedQuotationId: basis.quotationId,
        // Each quotation revision is a durable row. The basis pins that exact row and therefore
        // supplies both the accepted quotation and accepted revision identity.
        acceptedQuotationRevisionId: basis.quotationId,
        awardAcceptanceType: 'tender_award',
        awardAcceptanceEvidence: {
          award: tender.awardEvidence,
          commercialBasis: basis,
        } as Record<string, unknown>,
        status: 'draft',
      },
      // Same key on both paths: an award and a later baseline link can never both produce a contract.
      `contract-from-tender:${tender.id}`,
    );
    await this.quotations.linkContract(basis.quotationId, contract.id).catch(() => undefined);
    this.logger.log(
      `⚡ ${e.type} → Contract "${contract.title}" (${contract.id}) from ${basis.kind} basis ` +
        `${basis.baselineId} (quotation ${basis.quotationId}, value ${basis.value})`,
    );
  }

  /**
   * The approved commercial baseline behind a tender's bid, if it was priced through a quotation
   * (gap register **G-50**).
   *
   * The tender pricing sheet generates a quotation carrying `sourceTenderId`; approving that
   * quotation locks an immutable baseline (R3). This finds it so a tender-won contract can inherit
   * the same governed number a direct-sale contract does.
   *
   * Prefers the quotation the customer actually accepted, then the approved/sent one — a tender can
   * accumulate revisions, and only a decided quotation should set a contract's value. Returns null
   * when the tender was awarded without a priced quotation, which is legitimate (a bid submitted
   * straight from the estimate) — the caller then falls back to the tender value, as before.
   */
  private async findTenderBaseline(
    tenantId: string,
    tenderId: string,
  ): Promise<{ quotationId: string; baselineId: string; value: number } | null> {
    // Whole-body guard, deliberately. This is an *enrichment* lookup on the deal chain's critical
    // path: if it fails for any reason the contract must still be created from the tender value,
    // exactly as it was before this existed. An award that produces no contract would be a far
    // worse outcome than one that produces an unbaselined contract.
    try {
      const quotes = await this.quotations.list({ tenantId, sourceTenderId: tenderId, limit: 50 });
      if (!quotes?.length) return null;
      const rank = (status: string): number => (status === 'accepted' ? 0 : status === 'approved' ? 1 : status === 'sent' ? 2 : 3);
      const decided = quotes.filter((q) => rank(q.status) < 3).sort((a, b) => rank(a.status) - rank(b.status));
      for (const q of decided) {
        const baseline = await this.quotations.getBaseline(tenantId, q.id);
        if (baseline) return { quotationId: q.id, baselineId: baseline.id, value: baseline.total };
      }
      return null;
    } catch (err) {
      this.logger.warn(`Baseline lookup for tender ${tenderId} failed (${(err as Error).message}) — contract will use the tender value.`);
      return null;
    }
  }

  /**
   * Slice 9 — a customer accepting a quotation IS the award of the direct deal behind it. Closes that
   * opportunity Won with the AUTHORITATIVE value (the accepted quotation's Commercial Baseline, never
   * the salesperson's headline `value`) and the award provenance. Guards, in order:
   *  - the quote must still be `accepted` (re-read live, not the event payload);
   *  - it must be a DIRECT-sale quote (sourceOpportunityId, not a tender-sourced one);
   *  - the deal must not be tender-owned (the tender path closes those);
   *  - LINEAGE (Slice 8): for a governed deal the accepted quote must be the CURRENT authoritative one
   *    — the quote the current frozen pricing sheet points to — so a superseded / stray quote can never
   *    close the deal.
   * The sanctioned `applyAwardOutcome` command then makes it idempotent by IDENTITY: the same award
   * replayed is a no-op; a different quotation's award on an already-won deal is a recorded conflict,
   * never a silent overwrite.
   */
  private async awardOnQuotationAccepted(quotationId: string): Promise<void> {
    const q = await this.quotations.get(quotationId);
    if (!q || q.status !== 'accepted') return;
    const oppId = q.sourceOpportunityId;
    if (!oppId) return; // tender-sourced quote — the tender path owns that deal's outcome
    const opp = await this.opportunities.get(oppId);
    if (!opp || opp.tenderId) return; // gone, or tender-owned (closed by its tender, not a quote)

    // Lineage guard: for a governed deal, only the quote the CURRENT frozen pricing sheet points to is
    // authoritative. A superseded revision or a stray legacy quote sharing the opportunity is refused.
    const currentSheet = await this.preAwardPackages.frozenPricingFor(q.tenantId, oppId);
    if (currentSheet && currentSheet.quotationId !== q.id) {
      this.logger.warn(
        `quotation.accepted ${q.id} is not the current authoritative quote for opportunity ${oppId} ` +
          `(current pricing points to ${currentSheet.quotationId ?? 'none'}) — not closing Won`,
      );
      return;
    }

    // Resolve the ONE authoritative value + its provenance. Baseline (approved-price snapshot) first;
    // a legacy quote with no baseline falls back to its own selling value — recorded, never invisible.
    const baseline = await this.quotations.getBaseline(q.tenantId, q.id);
    const awardedValue = baseline ? baseline.subtotal : q.subtotal;
    const valueSource = baseline ? 'commercial_baseline' : 'legacy_quotation_total';

    const result = await this.opportunities.applyAwardOutcome(oppId, {
      awardedQuotationId: q.id,
      contractedValue: awardedValue,
      valueSource,
      reason: `Customer accepted quotation ${q.quoteNumber} Rev ${q.revision}`,
      source: 'quotation_accepted',
    });
    this.logger.log(
      `⚡ quotation.accepted → Opportunity "${opp.title}" (${oppId}) ${result.outcome}` +
        (result.outcome === 'won' ? ` (contractedValue ${awardedValue}, ${valueSource}, from ${q.quoteNumber} Rev ${q.revision})` : ''),
    );
  }

  // ── Reactor failure policy (see docs: the outbox is the error handler) ────────────────────────
  //
  // `OutboxRelay` decides retry-vs-done purely by whether `bus.publish` REJECTS: on resolve it
  // stamps `processed_at`, on throw it increments `attempts` and retries next tick, dead-lettering
  // after OUTBOX_MAX_ATTEMPTS. Every handler here used to wrap its body in `try/catch` and log, so
  // publish always resolved — the event was marked delivered even when its side effect never
  // happened, and the retry policy was INERT for the whole file.
  //
  // Fixing that by rethrowing everywhere would be worse than the bug. A retry re-runs the handler,
  // and most sinks in this file are NOT idempotent — `CostLedgerService.post` unconditionally
  // appends a transaction and moves the CBS balance, so a retried post double-counts real money.
  //
  // So the choice is made per handler, and stated at the call site rather than left implicit:
  //
  //   retryable(...)  the sink is PROVEN duplicate-safe (a CommandBus idempotency key, or a
  //                   no-op guard that returns early on the second run). Failures propagate so the
  //                   relay retries and eventually dead-letters.
  //
  //   bestEffort(...) the failure must NOT reach the relay — because the sink would double-post on
  //                   retry, or because the work is optional enrichment. Requires a written reason,
  //                   so a swallow can never again look like an oversight.

  /**
   * A business-critical side effect whose sink is proven duplicate-safe. Rethrows, which is what
   * hands the failure to the outbox's retry + dead-letter machinery.
   */
  private async retryable(label: string, e: DomainEvent, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (err) {
      this.logger.error(`${label} failed for ${e.type} ${e.aggregateId} — rethrowing so the outbox retries: ${err}`);
      throw err;
    }
  }

  /**
   * A side effect that must not block the event. `reason` is REQUIRED and is the whole point: it
   * records why this failure is being accepted, so "not idempotent, a retry would double-post" is
   * never confused with "optional enrichment".
   */
  private async bestEffort(label: string, e: DomainEvent, reason: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (err) {
      this.logger.error(
        `${label} failed for ${e.type} ${e.aggregateId} and will NOT be retried (${reason}): ${err}`,
      );
    }
  }

  onModuleInit(): void {
    // ── Causality (J3): winning an Opportunity does NOT create its tender ──────────────
    // Bidding PRECEDES winning. The tender is started from the still-open opportunity ("Start
    // Tender" — crm/opportunities/:id/start-tender, J2), and it is the tender's AWARD that then
    // closes the deal Won (the tender.awarded → close-opportunity reactor below). The old
    // opportunity.won → create-tender reactor had that arrow backwards — a deal cannot be won at the
    // CRM level before the bid it represents has even been submitted — so it was retired here.

    // ── Reverse junction: Tender registered directly → auto-create a linked Opportunity ──
    // The Opportunity is the single source of truth for the sales pipeline/forecast. A tender logged
    // straight into Tendering (an invitation, a portal listing, a walk-in RFQ) must still surface
    // there — so we create ONE Opportunity (executionType 'tender') and back-link the tender to it,
    // which is what lets the Opportunity 360 compose the tender under the deal.
    //
    // Tenders BORN from an opportunity ("Start Tender") already carry sourceOpportunityId. For those
    // we do NOT auto-create — but we DO guarantee the ownership stamp: `start-tender` stamps inline
    // (fast path), and this reactor is the DURABLE COMPENSATION for a partial failure where the
    // tender was created but the inline `markTenderOwned` did not land (the two live in different
    // modules and cannot share one transaction). Both writes are idempotent, so they converge and the
    // window in which the opportunity had a live tender but no `tenderId` (ownership guard off) is
    // closed at-least-once by the outbox. The guard reads the tender's LIVE link, not the event
    // payload, so redelivery never spawns a second opportunity.
    this.bus.subscribe('tendering.tender.created', (e: DomainEvent) =>
      // BEST-EFFORT: the guard against a duplicate opportunity is the tender's LIVE `sourceOpportunityId`,
      // which `linkOpportunity` sets — but `create` and `linkOpportunity` are not one transaction. A
      // failure BETWEEN them (opportunity created, link not yet written) leaves the tender still unlinked,
      // so a retry would create a SECOND opportunity. That makes this not safely retryable; we accept the
      // failure here instead of handing it to the relay.
      this.bestEffort('auto-create opportunity from tender.created', e, 'create→link is not atomic; a retry after a partial failure would spawn a second opportunity', async () => {
        const tender = await this.tenders.get(e.aggregateId);
        if (!tender) return;
        if (tender.sourceOpportunityId) {
          // Born from an opportunity — compensate/confirm the ownership stamp (idempotent no-op if set).
          await this.opportunities.markTenderOwned(tender.sourceOpportunityId, tender.id);
          return;
        }
        const opp = await this.opportunities.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          title: tender.title,
          accountId: tender.accountId,
          accountName: tender.accountName,
          value: tender.value,
          executionType: 'tender',
          source: 'tender',
          actorId: null,
        });
        await this.tenders.linkOpportunity(tender.id, opp.id);
        // Hand commercial ownership to the tender immediately — a directly-registered tender owns its
        // deal's progression just like a Started one, so the opportunity is a projection from birth.
        await this.opportunities.markTenderOwned(opp.id, tender.id);
        this.logger.log(
          `⚡ tender.created (direct) → auto-created Opportunity "${opp.title}" (${opp.id}) + back-linked tender ${tender.id}`,
        );
      }),
    );

    // ── Field intake: Site survey completed → auto-create linked Opportunity ──
    this.bus.subscribe('site.survey.completed', (e: DomainEvent) =>
      // RETRYABLE: an existence check on the survey id / reference runs BEFORE any write and returns
      // early on a second run, so redelivery never creates a duplicate opportunity. Sole subscriber
      // on this event.
      this.retryable('auto-create opportunity from site.survey.completed', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const surveyId = e.aggregateId;
        const reference = (p.reference as string) || `SURV-${surveyId.slice(0, 8)}`;
        const siteAddress = (p.siteAddress as string) || 'Site';
        const accountId = (p.accountId as string | null) ?? null;
        const accountName = (p.accountName as string | null) ?? null;
        const estimatedValue = Number(p.estimatedValue) || 0;
        const scopeNotes = (p.scopeNotes as string) || '';

        // Idempotency: prevent duplicate opportunity creation on outbox retry
        const existingOpps = await this.opportunities.list({ tenantId: e.tenantId });
        const alreadyCreated = existingOpps.find(
          (o) => o.nextAction?.includes(`[Survey ID: ${surveyId}]`) || o.title.includes(reference),
        );
        if (alreadyCreated) {
          this.logger.log(`↩ site.survey.completed → Opportunity already exists for survey ${surveyId}, skipping`);
          return;
        }

        const opp = await this.opportunities.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          title: `Opportunity from Survey ${reference}: ${siteAddress}`,
          accountId,
          accountName,
          value: estimatedValue,
          source: 'site-survey',
          executionType: 'tender',
          nextAction: `Follow up on Site Survey ${reference} [Survey ID: ${surveyId}]`,
          actorId: null,
        });

        this.logger.log(
          `⚡ site.survey.completed → auto-created Opportunity "${opp.title}" (${opp.id}) from survey ${reference} (${surveyId})`,
        );
      }),
    );

    // ── Deal chain CLOSE: Project completed → complete the source contract ──
    this.bus.subscribe('projects.project.completed', (e: DomainEvent) =>
      // RETRYABLE: the `contract.status !== 'active'` guard IS the idempotency — the only write flips
      // active → completed, so a second run returns early. Its co-subscriber on this event (the growth
      // Signal below) is itself idempotent on dedupeKey, so retrying the whole event is safe.
      this.retryable('complete contract', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const contractId = p.contractId as string | null;
        if (!contractId) return;
        const contract = await this.contracts.get(contractId);
        if (!contract || contract.status !== 'active') return; // only close an active contract once
        await this.contracts.changeStatus(contractId, 'completed');
        this.logger.log(`⚡ project.completed → contract "${contract.title}" completed (deal chain closed)`);
      }),
    );

    // ── Account growth loop (S9): Project completed → growth Signal on the Radar ──
    // Closes the acquisition loop back onto the installed base. A delivered project is the warmest
    // growth pipeline there is — an opening for follow-on scope, cross-sell, or a service attach.
    // We drop an EXPANSION Signal on the Opportunity Radar (S3); SignalService.create is idempotent
    // on dedupeKey, so an outbox retry or re-completion never re-emits.
    this.bus.subscribe('projects.project.completed', (e: DomainEvent) =>
      // BEST-EFFORT: a growth Signal is optional enrichment on top of the completion. Losing one must
      // never block a project from completing (nor retry the event and re-run the contract-close
      // sibling). SignalService.create is itself idempotent on dedupeKey, so nothing is duplicated.
      this.bestEffort('raise growth signal', e, 'optional Radar enrichment; must not block completion', async () => {
        const p = e.payload as Record<string, unknown>;
        // The payload lacks the account snapshot — fetch the project for it.
        const project = await this.projects.get(e.aggregateId);
        const signal = projectCompletionSignal({
          tenantId: e.tenantId,
          companyId: e.companyId,
          projectId: e.aggregateId,
          projectTitle: (project?.title as string) ?? (p.title as string) ?? null,
          accountId: project?.accountId ?? null,
          accountName: project?.accountName ?? null,
          value: project?.value ?? (p.value as number) ?? null,
        });
        await this.signals.create({ ...signal, actorId: null });
        this.logger.log(`⚡ project.completed → growth Signal "${signal.title}" on the Radar (account ${signal.accountName ?? 'unknown'})`);
      }),
    );

    // ── Account growth loop (S9): Contract completed → renewal Signal on the Radar ──
    // A completed contract is the trigger to pursue renewal / AMC / the next phase before the
    // relationship cools. RENEWAL_DUE Signal, deduped by contract id.
    this.bus.subscribe('contracts.contract.completed', (e: DomainEvent) =>
      // BEST-EFFORT: like its project sibling, a renewal Signal is optional Radar enrichment — losing
      // one must not block the contract from completing. Idempotent on dedupeKey, so no duplicates.
      this.bestEffort('raise renewal signal', e, 'optional Radar enrichment; must not block completion', async () => {
        const p = e.payload as Record<string, unknown>;
        const account = p.account as { id: string; name: string | null } | null;
        const signal = contractCompletionSignal({
          tenantId: e.tenantId,
          companyId: e.companyId,
          contractId: e.aggregateId,
          contractTitle: (p.title as string) ?? null,
          accountId: account?.id ?? null,
          accountName: account?.name ?? null,
          value: (p.value as number) ?? null,
        });
        await this.signals.create({ ...signal, actorId: null });
        this.logger.log(`⚡ contract.completed → renewal Signal "${signal.title}" on the Radar (account ${signal.accountName ?? 'unknown'})`);
      }),
    );

    // ── Deal chain: Tender won → auto-create Contract (draft), IF a commercial basis exists ──────
    //
    // The contract's value comes from the award's PINNED commercial basis and from nothing else.
    //
    // WHAT CHANGED AND WHY. This used to call `findTenderBaseline` here, at delivery time: it ranked
    // the tender's quotations and took the latest locked baseline. Delivery is not immediate — the
    // outbox polls, retries, and stalls while the API is down — so a quotation accepted in that
    // window silently changed which baseline the contract inherited. And with no baseline at all it
    // fell back to `p.value`, the tender's own ESTIMATE, which then flowed into
    // PaymentCertificateService as `contractValue` and drove IPC maths. An estimate is not a
    // contractual value; that fallback is now gone.
    //
    // NO BASIS => NO CONTRACT. The award itself stays valid and the Opportunity is still
    // GOVERNED_WON on its award evidence — a governed win and a contract are separate facts. The
    // tender reads "awaiting commercial basis" until a baseline locks, and the deferred reactor
    // below builds the contract then.
    //
    // The basis is read from the LIVE tender, not the payload: it is immutable, so live is award-time
    // (re-read what is immutable; trust the payload for what is mutable).
    this.bus.subscribe('tendering.tender.awarded', (e: DomainEvent) =>
      this.retryable('auto-create contract from tender.awarded', e, async () => {
        const tender = await this.tenders.get(e.aggregateId);
        if (!tender) return;
        if (!tender.commercialBasis) {
          this.logger.log(
            `⚡ tender.awarded → NO contract for "${tender.title}" (${tender.id}): awaiting commercial basis. ` +
              'The win stands; the contract waits for an approved baseline rather than banking the estimate.',
          );
          return;
        }
        await this.createContractFromBasis(e, tender);
      }),
    );

    // ── Deferred: a baseline locks AFTER an award → link it, then build the contract ──────────────
    //
    // The other half of "no basis, no contract". Guards, in order, are exactly the invariant table:
    // the baseline must belong to THIS tender, the tender must be won, no basis may be established
    // yet, and no contract may already exist. A basis that fails any guard is ignored, never
    // stretched to fit — in particular a baseline belonging to another tender is never adopted.
    this.bus.subscribe('crm.commercial_baseline.locked', (e: DomainEvent) =>
      this.retryable('link post-award commercial basis', e, async () => {
        // The event NAMES the baseline as its aggregate, so this reads the exact one that locked —
        // not "the latest for that quotation", which could be a different row by now.
        const baseline = await this.quotations.getBaselineById(e.tenantId, e.aggregateId);
        if (!baseline?.sourceTenderId) return; // not a tender-route baseline

        const tender = await this.tenders.get(baseline.sourceTenderId);
        if (!tender || tender.status !== 'won') return;      // not awarded (yet) — nothing to link
        if (tender.commercialBasis) return;                  // already established; never re-based
        const already = await this.contracts.list({ tenantId: e.tenantId, tenderId: tender.id });
        if (already.length > 0) return;                      // a contract exists; never re-valued

        const { linked } = await this.tenders.linkCommercialBasis(tender.id, {
          baselineId: baseline.id,
          quotationId: baseline.quotationId,
          value: baseline.total,
          establishedAt: baseline.lockedAt,
        });
        if (!linked) return; // lost the race; the winner's basis stands

        this.logger.log(
          `⚡ baseline.locked → linked POST-AWARD basis to tender "${tender.title}" (${tender.id}); building the deferred contract`,
        );
        await this.createContractFromBasis(e, { ...tender, commercialBasis: (await this.tenders.get(tender.id))!.commercialBasis });
      }),
    );

    // ── Deal chain CLOSE (J3): Tender won → close the source Opportunity as Won ──
    // The tender is the EXECUTION of one opportunity, so winning the bid wins the deal. Sibling to
    // the contract reactor above: the award drives both the contract (delivery side) and the CRM
    // close (pipeline side). No-ops when the tender has no source opportunity or the deal is
    // already closed, so an at-least-once redelivery is safe.
    this.bus.subscribe('tendering.tender.awarded', (e: DomainEvent) =>
      // RETRYABLE: `closeSourceOpportunity` returns early when the deal is already won/lost, so a
      // second run changes nothing. A lost award-close would otherwise leave the tender won and its
      // opportunity open forever, with only a log line to say so.
      this.retryable('close opportunity Won', e, () => this.closeSourceOpportunity(e.aggregateId, 'won', e.occurredAt)),
    );

    // ── Deal chain CLOSE (J3): Tender lost → close the source Opportunity as Lost ──
    this.bus.subscribe('tendering.tender.lost', (e: DomainEvent) =>
      // RETRYABLE: same early-return guard as the win path.
      this.retryable('close opportunity Lost', e, () => this.closeSourceOpportunity(e.aggregateId, 'lost')),
    );

    // ── Deal chain CLOSE (Slice 9): customer accepted a quotation → close the DIRECT deal Won ──
    // The direct-sale sibling of tender.awarded → won: the accepted quotation IS the award. Authoritative
    // value from the accepted quotation's baseline, lineage-checked, idempotent by award identity.
    this.bus.subscribe('crm.quotation.accepted', (e: DomainEvent) =>
      // RETRYABLE: `awardOnQuotationAccepted` re-reads the quotation, returns unless it is still
      // `accepted`, and treats the same quotation awarding an already-won deal as a no-op replay
      // (a DIFFERENT quotation is a recorded conflict, not a double-award). Safe to run twice.
      this.retryable('award opportunity Won', e, () => this.awardOnQuotationAccepted(e.aggregateId)),
    );

    // ── Deal chain: Contract signed → auto-create Project (planned) ────
    // RETRYABLE: project creation carries the CommandBus idempotency key `project-from-contract:
    // <contractId>`, so a redelivery returns the first project instead of creating a second. Sole
    // subscriber on this event. The WBS/CBS seed below is a SEPARATE best-effort step: it enriches the
    // freshly-created project and must never fail the project's creation, so it swallows its own errors.
    this.bus.subscribe('contracts.contract.signed', (e: DomainEvent) =>
      this.retryable('auto-create project from contract.signed', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const account = p.account as { id: string; name: string } | null;
        const tender = p.tender as { id: string; title: string | null } | null;
        const originalContractValue = typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null;
        // The contract event carries the exact locked baseline identity.  Rehydrate that row once
        // at handover time so the project snapshot can stand alone after Sales records evolve.
        // This is a frozen read, never a "latest" lookup and never a read from live Tender/BOQ state.
        const baseline = (p.commercialBaselineId as string | null)
          ? await this.quotations.getBaselineById(e.tenantId, p.commercialBaselineId as string)
          : null;
        const pricingInput = baseline?.pricing && Array.isArray(baseline.pricing.lines) ? baseline.pricing : null;
        const estimationInput = Array.isArray(baseline?.estimation) ? baseline.estimation : null;
        // Pricing-sheet authored quotations persist both the legacy pricing shape and the
        // canonical estimation build-up.  The estimation projection is the authoritative cost
        // source in that case; choosing `pricingInput` first would silently turn a real frozen
        // cost into zero because the legacy compatibility shape has no cost fields.
        const computedFrozenPricing = baseline?.lines?.length && estimationInput
          ? computeEstimationPricing(baseline.lines, estimationInput)
          : baseline?.lines?.length && pricingInput
            ? computeQuotationPricing(baseline.lines, pricingInput)
            : null;
        // Some current Tender fixtures persist an explicit frozen cost evidence object rather
        // than the unified estimation array.  It is still authoritative evidence when present.
        const explicitFrozenCost = baseline?.estimation && !Array.isArray(baseline.estimation)
          && typeof (baseline.estimation as Record<string, unknown>).cost === 'number'
          ? Number((baseline.estimation as Record<string, unknown>).cost)
          : null;
        const candidateFrozenCost = explicitFrozenCost ?? computedFrozenPricing?.totalCost ?? null;
        // A zero result from an empty/legacy projection is unknown, not a real cost baseline.
        const frozenCost = candidateFrozenCost !== null && Number.isFinite(candidateFrozenCost) && candidateFrozenCost > 0
          ? candidateFrozenCost
          : null;
        const sourceBundle = {
          contractId: e.aggregateId,
          tenantId: e.tenantId,
          sourceOpportunityId: (p.sourceOpportunityId as string | null) ?? null,
          sourceTenderId: (p.sourceTenderId as string | null) ?? tender?.id ?? null,
          commercialScopeRevisionId: (p.commercialScopeRevisionId as string | null) ?? null,
          boqRevisionId: (p.boqRevisionId as string | null) ?? null,
          estimateRevisionId: (p.estimateRevisionId as string | null) ?? null,
          acceptedQuotationId: (p.acceptedQuotationId as string | null) ?? null,
          acceptedQuotationRevisionId: (p.acceptedQuotationRevisionId as string | null) ?? null,
          commercialBaselineId: (p.commercialBaselineId as string | null) ?? null,
          originalContractValue,
          currency: (p.currency as string | null) ?? null,
          awardAcceptanceType: (p.awardAcceptanceType as string | null) ?? null,
          awardAcceptanceEvidence: p.awardAcceptanceEvidence ?? null,
          // Full frozen baseline evidence is intentionally copied by value.  It is optional for
          // legacy/tender paths that have no quotation baseline, and absent cost remains explicit.
          frozenCommercialBaseline: baseline ? {
            id: baseline.id,
            quotationId: baseline.quotationId,
            revision: baseline.revision,
            sourceOpportunityId: baseline.sourceOpportunityId,
            sourceTenderId: baseline.sourceTenderId,
            lines: baseline.lines,
            pricing: baseline.pricing,
            estimation: baseline.estimation,
            subtotal: baseline.subtotal,
            vatTotal: baseline.vatTotal,
            total: baseline.total,
            lockedAt: baseline.lockedAt,
          } : null,
        };
        const handoverId = newId();
        const handoverSnapshotHash = hashHandoverSnapshot(sourceBundle);
        const project = await this.projects.create(
          {
            tenantId: e.tenantId,
            companyId: e.companyId,
            title: `Project: ${p.title ?? 'Contract'}`,
            contractId: e.aggregateId,
            contractTitle: (p.title as string) ?? null,
            accountId: account?.id ?? null,
            accountName: account?.name ?? null,
            value: originalContractValue ?? 0,
            handoverId,
            handoverSnapshotHash,
            handoverSnapshot: sourceBundle,
            handoverLockedAt: new Date().toISOString(),
            origin: 'commercial_handover',
            sourceOpportunityId: sourceBundle.sourceOpportunityId,
            sourceTenderId: sourceBundle.sourceTenderId,
            commercialScopeRevisionId: sourceBundle.commercialScopeRevisionId,
            boqRevisionId: sourceBundle.boqRevisionId,
            estimateRevisionId: sourceBundle.estimateRevisionId,
            acceptedQuotationId: sourceBundle.acceptedQuotationId,
            acceptedQuotationRevisionId: sourceBundle.acceptedQuotationRevisionId,
            commercialBaselineId: sourceBundle.commercialBaselineId,
            originalContractValue,
            currency: sourceBundle.currency,
            awardAcceptanceType: sourceBundle.awardAcceptanceType as 'quotation_acceptance' | 'tender_award' | 'manual' | null,
            awardAcceptanceEvidence: sourceBundle.awardAcceptanceEvidence as Record<string, unknown> | null,
            status: 'planned',
          },
          // Idempotency: re-signing the same contract (or an outbox retry) must not
          // create a duplicate project — keyed by the source contract id.
          `project-from-contract:${e.aggregateId}`,
        );
        this.logger.log(
          `⚡ contract.signed → auto-created Project "${project.title}" (${project.id})`,
        );

        // Seed the breakdown so the auto-created project isn't an empty shell: a root
        // WBS node + CBS nodes mirroring the source tender's BOQ. Guarded on "no WBS yet"
        // so an outbox retry (project create is idempotent above) doesn't double-seed.
        await this.bestEffort(
          'seed WBS/CBS for auto-created project',
          e,
          'enrichment on an already-created project; must not fail (or retry) the project creation',
          async () => {
            const existingWbs = await this.wbs.list({ projectId: project.id });
            if (existingWbs.length === 0) {
              await this.wbs.create({
                tenantId: e.tenantId,
                projectId: project.id,
                code: '1',
                title: project.title,
                plannedValue: project.value,
              });
            }
            const existingCbs = await this.cbs.list({ projectId: project.id });
            // Seed one locked opening CBS node only when a frozen pricing/estimation projection
            // supplied a real cost. Contract/customer value is not a cost proxy; when unavailable,
            // leave CBS unseeded and keep the gap explicit rather than writing zero/default data.
            if (existingCbs.length === 0 && frozenCost !== null && baseline) {
              await this.cbs.createHandoverBaseline({
                tenantId: e.tenantId,
                projectId: project.id,
                code: '1',
                title: `${project.title} — frozen commercial cost baseline`,
                category: 'direct',
                budgetAmount: frozenCost,
                forecastAmount: frozenCost,
                currency: sourceBundle.currency ?? 'AED',
                sourceRevisionId: sourceBundle.estimateRevisionId ?? baseline.id,
                handoverLocked: true,
                notes: JSON.stringify({
                  handoverId: sourceBundle.contractId,
                  commercialBaselineId: baseline.id,
                  source: sourceBundle.estimateRevisionId ? 'estimate_revision' : 'commercial_baseline',
                }),
              });
            }
          },
        );
      }),
    );

    // ── Engineering → Commercial: Design change approved → auto-draft Variation ──
    // ADR-0011 in action: Engineering owns the design change; Projects owns the commercial
    // variation. On approval WITH a cost impact, the design change emits an event; here we create
    // a DRAFT variation carrying the value snapshot. QS reviews & approves it, which then rolls
    // into the project's revised contract value. Never a direct cross-module call.
    this.bus.subscribe('engineering.design_change.approved', (e: DomainEvent) =>
      // RETRYABLE: a `reference` existence check runs before create and returns early on a second run,
      // so redelivery never drafts a duplicate variation. Sole subscriber on this event.
      this.retryable('auto-draft variation from design_change.approved', e, async () => {
        const p = e.payload as Record<string, unknown>;
        if (p.triggersVariation !== true) return; // no cost impact / zero value → nothing commercial
        const amount = Number(p.estimatedValue) || 0;
        if (amount <= 0) return;
        const projectId = p.projectId as string | undefined;
        if (!projectId) return;
        const changeType = p.changeType === 'omission' ? 'omission' : 'addition';
        const code = (p.code as string) ?? 'DC';
        const reference = `VO-DC-${e.aggregateId.slice(0, 8)}`;
        // Idempotency: VariationService.create has no command-bus cache, so guard on the
        // deterministic reference — an outbox retry (or re-approval) of the same design change
        // won't spawn a second variation (mirrors the ipc.certified → AR reactor).
        const existing = await this.variations.list({ tenantId: e.tenantId, projectId });
        if (existing.some((v) => v.reference === reference)) {
          this.logger.log(`↩ design_change.approved → variation ${reference} already exists, skipping`);
          return;
        }
        await this.variations.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          projectId,
          projectTitle: (p.projectName as string) ?? null,
          reference,
          title: `Variation from design change ${code}: ${p.title ?? ''}`.trim(),
          description: `Auto-drafted from approved engineering design change ${code}.`,
          type: changeType,
          amount,
        });
        this.logger.log(
          `⚡ design_change.approved → auto-drafted ${changeType} Variation ${reference} (${amount}) on project ${projectId}`,
        );
      }),
    );

    // ── Engineering → HSE: submitted Risk Assessment routed into HSE's queue ──
    // ADR-0011/0012 in action: Engineering *originates* a Risk Assessment (a docType whose
    // drafting it owns) but HSE *owns the process* (ownerModule='hse'). On submit, the
    // engineering document emits an event carrying ownerModule; here we create the HSE Risk
    // Assessment so it lands in HSE's review queue. Engineering never calls HSE directly.
    this.bus.subscribe('engineering.document.submitted', (e: DomainEvent) =>
      // RETRYABLE: a `reference` existence check runs before create and returns early on a second run,
      // so redelivery never queues a duplicate risk assessment. Sole subscriber on this event.
      this.retryable('route risk assessment to HSE from engineering.document.submitted', e, async () => {
        const p = e.payload as Record<string, unknown>;
        if (p.ownerModule !== 'hse') return; // only HSE-owned docs (risk assessments) hand off
        const projectId = p.projectId as string | undefined;
        if (!projectId) return; //         an HSE risk assessment is scoped to a project
        const code = (p.code as string) ?? 'RA';
        const reference = `RA-${code}`;
        // Idempotency: createRiskAssessment has no command-bus cache, so guard on the
        // deterministic reference — an outbox retry (or re-submit) won't queue a duplicate.
        const existing = await this.hse.listRiskAssessments(e.tenantId);
        if (existing.some((r) => r.reference === reference)) {
          this.logger.log(`↩ engineering.document.submitted → risk assessment ${reference} already in HSE queue, skipping`);
          return;
        }
        await this.hse.createRiskAssessment({
          tenantId: e.tenantId,
          companyId: e.companyId,
          projectId,
          reference,
          activity: `Risk assessment for engineering document ${code}`,
          hazards: [],
        });
        this.logger.log(`⚡ engineering.document.submitted → routed Risk Assessment ${reference} into HSE queue (project ${projectId})`);
      }),
    );

    // ── Contracting money-flow: IPC certified → auto-draft client AR invoice ──
    // Closes the loop the IPC vertical opened: a certified interim payment certificate is the
    // signal to bill the client. We raise a DRAFT customer (AR) invoice for the net certified
    // this period (+ 5% VAT), carrying the account + contract snapshots — finance reviews & issues.
    this.bus.subscribe('contracts.ipc.certified', (e: DomainEvent) =>
      // BEST-EFFORT — and this one is subtle: on its OWN this handler is idempotent (it guards on the
      // deterministic invoiceNumber). But it SHARES `contracts.ipc.certified` with the invoiced-quantity
      // reactor below, which posts to the Quantity Ledger UNCONDITIONALLY. A rethrow here would retry the
      // whole event and double-post those quantities. So the AR-invoice failure is accepted here rather
      // than handed to the relay.
      this.bestEffort('auto-draft AR invoice from ipc.certified', e, 'shares ipc.certified with the non-idempotent invoiced-quantity reactor; a rethrow would retry the event and double-post quantities', async () => {
        const p = e.payload as Record<string, unknown>;
        const account = p.account as { id: string; name: string | null } | null;
        const net = Number(p.netThisCertificate) || 0;
        if (!account || net <= 0) return; // nothing billable (no client snapshot or zero/negative net)
        const reference = (p.reference as string) ?? `IPC-${p.sequence ?? ''}`;
        const contractId = (p.contractId as string) ?? e.aggregateId;
        const invoiceNumber = `AR-${reference}-${contractId.slice(0, 8)}`;
        // Idempotency: customer-invoice create has no command-bus cache, so guard on the
        // deterministic invoice number — an outbox retry of the same IPC won't double-bill.
        const existingAr = await this.customerInvoices.list({ tenantId: e.tenantId });
        if (existingAr.some((inv) => inv.invoiceNumber === invoiceNumber)) {
          this.logger.log(`↩ ipc.certified → AR invoice ${invoiceNumber} already exists, skipping`);
          return;
        }
        const invoice = await this.customerInvoices.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          invoiceNumber,
          customerName: account.name?.trim() || 'Client',
          contractRef: contractId,
          issueDate: new Date().toISOString().slice(0, 10),
          lines: [
            {
              description: `Interim Payment Certificate ${reference} — work certified to date`,
              quantity: 1,
              unitPrice: net,
              vatRate: 5,
            },
          ],
        });
        this.logger.log(
          `⚡ ipc.certified → auto-drafted AR invoice "${invoice.invoiceNumber}" for ${invoice.customerName} (net ${net}, total ${invoice.total})`,
        );
      }),
    );

    // ── Subcontracting money-flow: back-charge recovered → auto-draft AP debit note ──
    // The mirror of ipc.certified → AR. A back-charge recovered from a subcontractor is the
    // signal to reduce what we owe them: we raise a DRAFT supplier (AP) invoice with a NEGATIVE
    // value — a debit note — carrying the subcontractor snapshot. Netted against their payables in
    // AP aging; finance reviews & approves. Skips when there's no recovery amount.
    this.bus.subscribe('subcontracts.backcharge.recovered', (e: DomainEvent) =>
      // RETRYABLE: keyed by `apdn-from-backcharge:<aggregateId>`, so a redelivery returns the first
      // debit note instead of raising a second. Sole subscriber on this event.
      this.retryable('auto-draft AP debit note from backcharge.recovered', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const amount = Number(p.amount) || 0;
        if (amount <= 0) return; // nothing to deduct
        const reference = (p.reference as string) ?? 'BC';
        const subcontractor = (p.subcontractor as string)?.trim() || 'Subcontractor';
        const subcontractId = (p.subcontractId as string) ?? e.aggregateId;
        const invoice = await this.supplierInvoices.create(
          {
            tenantId: e.tenantId,
            companyId: e.companyId,
            reference: `DN-${reference}-${subcontractId.slice(0, 8)}`,
            title: `Back-charge recovery ${reference} — ${subcontractor}`,
            supplierName: subcontractor,
            value: -amount, // negative supplier invoice = debit note reducing the subcontractor payable
            status: 'draft',
          },
          // Idempotency: an outbox retry of the same back-charge must not raise a second
          // debit note — keyed by the source subcontract back-charge aggregate id.
          `apdn-from-backcharge:${e.aggregateId}`,
        );
        this.logger.log(
          `⚡ backcharge.recovered → auto-drafted AP debit note "${invoice.reference}" vs ${subcontractor} (−${amount})`,
        );
      }),
    );

    // ── Operate: PO created → post a COMMITTED cost transaction to the ledger ───────
    // No module touches the CBS directly. The PO becomes a CostTransaction; the Transaction Engine
    // appends it to the ledger (source of truth + audit trail) and moves the CBS node's balance.
    // Committed cost is tracked only where the PO is coded (cbsNodeId) — never guessed.
    this.bus.subscribe('procurement.po.created', (e: DomainEvent) =>
      // RETRYABLE (mig 0254): keyed `po-committed:<poId>` — a replay returns the first transaction and
      // does not re-move the CBS balance. The other subscriber on po.created (ordered quantity) is now
      // keyed too, so replaying the whole event is safe.
      this.retryable('post committed cost txn from po.created', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const cbsNodeId = p.cbsNodeId as string | null;
        const project = p.project as { id: string; name: string } | null;
        const value = Number(p.value) || 0;
        if (cbsNodeId && project?.id && value > 0) {
          await this.ledger.post({
            tenantId: e.tenantId, companyId: e.companyId ?? null, projectId: project.id,
            cbsNodeId, type: 'committed', amount: value, source: 'po', sourceRef: (p.title as string) ?? null,
            dimensions: { poId: e.aggregateId },
            dedupeKey: `po-committed:${e.aggregateId}`,
          });
        }
      }),
    );

    // ── Committed-cost lifecycle: PO cancelled → REVERSE its committed cost (a NEGATIVE entry) ──
    // The ledger is append-only, so un-committing a cancelled PO is a negative posting, never a
    // mutation — the CBS balance drops by exactly what the PO put on it, and the drill-down keeps
    // both the +commit and the −reversal. Idempotent: guarded on an existing reversal for this PO,
    // so an at-least-once redelivery cannot double-reverse and corrupt the balance.
    this.bus.subscribe('procurement.po.updated', (e: DomainEvent) =>
      // RETRYABLE: guarded on an existing reversal for this PO, so a redelivery cannot double-reverse
      // and corrupt the balance. Its co-subscriber on po.updated (the ordered-quantity reversal) is
      // likewise guarded, so retrying the whole event is safe.
      this.retryable('reverse committed cost for cancelled PO', e, async () => {
        const p = e.payload as Record<string, unknown>;
        if (p.status !== 'cancelled') return;
        const cbsNodeId = p.cbsNodeId as string | null;
        const project = p.project as { id: string; name: string } | null;
        const value = Number(p.value) || 0;
        if (!cbsNodeId || !project?.id || value <= 0) return;
        const existing = await this.ledger.list({ tenantId: e.tenantId, cbsNodeId });
        if (existing.some((t) => t.source === 'reversal' && t.dimensions?.poId === e.aggregateId)) return; // already reversed
        await this.ledger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId: project.id,
          cbsNodeId, type: 'committed', amount: -value, source: 'reversal',
          sourceRef: `${(p.title as string) ?? 'PO'} — cancelled`, dimensions: { poId: e.aggregateId, reverses: 'po' },
        });
        this.logger.log(`↩ po.cancelled → reversed committed ${value} on CBS ${cbsNodeId} (PO ${e.aggregateId})`);
      }),
    );

    // ── Quantity Ledger (Phase 2): PO created → post ORDERED quantity on the BOQ item ──
    // The physical twin of the committed-cost reactor above. A PO coded to a BOQ item (boqItemId +
    // orderedQuantity) accrues the ordered quantity so the item's Ordered position = SUM(this).
    this.bus.subscribe('procurement.po.created', (e: DomainEvent) =>
      // RETRYABLE (mig 0255): keyed `po-ordered:<poId>` — a replay returns the first transaction and
      // does not re-count the ordered position. Its sibling (committed cost) is keyed too.
      this.retryable('post ordered quantity from po.created', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const boqItemId = p.boqItemId as string | null;
        const project = p.project as { id: string; name: string } | null;
        const qty = Number(p.orderedQuantity) || 0;
        if (!boqItemId || !project?.id || qty <= 0) return;
        await this.quantityLedger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId: project.id,
          boqItemId, cbsNodeId: (p.cbsNodeId as string | null) ?? null,
          type: 'ordered', quantity: qty, unit: (p.unit as string | null) ?? null,
          source: 'po', sourceRef: (p.title as string) ?? null, dimensions: { poId: e.aggregateId },
          dedupeKey: `po-ordered:${e.aggregateId}`,
        });
        this.logger.log(`📏 po.created → posted ordered ${qty} on BOQ ${boqItemId} (PO ${e.aggregateId})`);
      }),
    );

    // ── Quantity Ledger: PO cancelled → REVERSE the ordered quantity (a negative entry) ──
    // Append-only + idempotent (guarded on an existing reversal for this PO), mirroring the committed-
    // cost reversal so the Ordered position drops by exactly what the PO put on it.
    this.bus.subscribe('procurement.po.updated', (e: DomainEvent) =>
      // RETRYABLE: guarded on an existing reversal for this PO (mirrors the committed-cost reversal), so
      // a redelivery cannot double-reverse the ordered position.
      this.retryable('reverse ordered quantity for cancelled PO', e, async () => {
        const p = e.payload as Record<string, unknown>;
        if (p.status !== 'cancelled') return;
        const boqItemId = p.boqItemId as string | null;
        const project = p.project as { id: string; name: string } | null;
        const qty = Number(p.orderedQuantity) || 0;
        if (!boqItemId || !project?.id || qty <= 0) return;
        const existing = await this.quantityLedger.list({ tenantId: e.tenantId, boqItemId });
        if (existing.some((t) => t.source === 'reversal' && t.dimensions?.poId === e.aggregateId)) return;
        await this.quantityLedger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId: project.id,
          boqItemId, cbsNodeId: (p.cbsNodeId as string | null) ?? null,
          type: 'ordered', quantity: -qty, unit: (p.unit as string | null) ?? null,
          source: 'reversal', sourceRef: `${(p.title as string) ?? 'PO'} — cancelled`,
          dimensions: { poId: e.aggregateId, reverses: 'po' },
        });
        this.logger.log(`↩ po.cancelled → reversed ordered ${qty} on BOQ ${boqItemId} (PO ${e.aggregateId})`);
      }),
    );

    // ── Quantity Ledger (Phase 2): GRN created → post RECEIVED quantity on the BOQ item ──
    // A goods receipt coded to a BOQ item (boqItemId + receivedQuantity) accrues the received quantity
    // so the item's Received position = SUM(this). The gap Ordered − Received is what is still in transit.
    this.bus.subscribe('inventory.grn.created', (e: DomainEvent) =>
      // BEST-EFFORT: `quantityLedger.post` appends unconditionally, so a retry would double-count the
      // received position. Accepted here, never retried.
      this.bestEffort('post received quantity from grn.created', e, 'quantityLedger.post is not idempotent; a retry would double-count the received position', async () => {
        const p = e.payload as Record<string, unknown>;
        const boqItemId = p.boqItemId as string | null;
        const project = p.project as { id: string; name: string } | null;
        const qty = Number(p.receivedQuantity) || 0;
        if (!boqItemId || !project?.id || qty <= 0) return;
        await this.quantityLedger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId: project.id,
          boqItemId, type: 'received', quantity: qty, unit: (p.unit as string | null) ?? null,
          source: 'grn', sourceRef: (p.title as string) ?? null, dimensions: { grnId: e.aggregateId },
        });
        this.logger.log(`📏 grn.created → posted received ${qty} on BOQ ${boqItemId} (GRN ${e.aggregateId})`);
      }),
    );

    // ── Subcontract strand (mirrors the PO): active → COMMITTED cost on the CBS line ──
    // A subcontract is a commitment like a PO. When it goes 'active' (awarded), the engine posts a
    // committed CostTransaction for its value. Idempotent: guarded on an existing committed entry for
    // this subcontract, so re-activation (or a redelivered event) cannot double-commit.
    this.bus.subscribe('subcontracts.subcontract.statusChanged', (e: DomainEvent) =>
      // RETRYABLE: guarded on an existing committed entry for this subcontract, so re-activation (or a
      // redelivered event) cannot double-commit. Sole subscriber on this event.
      this.retryable('post committed cost for subcontract', e, async () => {
        const p = e.payload as Record<string, unknown>;
        if (p.status !== 'active') return;
        const cbsNodeId = p.cbsNodeId as string | null;
        const projectId = p.projectId as string | null;
        const value = Number(p.value) || 0;
        if (!cbsNodeId || !projectId || value <= 0) return;
        const existing = await this.ledger.list({ tenantId: e.tenantId, cbsNodeId });
        if (existing.some((t) => t.source === 'subcontract' && t.dimensions?.subcontractId === e.aggregateId)) return;
        await this.ledger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          cbsNodeId, type: 'committed', amount: value, source: 'subcontract',
          sourceRef: `${(p.title as string) ?? 'Subcontract'} — awarded`, dimensions: { subcontractId: e.aggregateId },
        });
        this.logger.log(`⚡ subcontract active → committed ${value} on CBS ${cbsNodeId} (SC ${e.aggregateId})`);
      }),
    );

    // ── Subcontract strand: claim (IPC) certified → ACTUAL cost = gross work done this period ──
    // Each certified interim claim recognises the gross value of work put in place this period as
    // actual cost on the CBS line (retention is withheld payment, not a cost reduction). Append-only,
    // so Subcontract actual = SUM(certified gross). Idempotent: guarded on an existing actual for this
    // claim. Retention-release claims have thisPeriodGrossValue=0 → skipped (handled by the AP reactor).
    this.bus.subscribe('subcontracts.claim.statusChanged', (e: DomainEvent) =>
      // RETRYABLE: guarded on an existing actual for this claim, so a redelivery cannot double-post. The
      // other two subscribers on claim.statusChanged (retention-release AP, certified AP invoice) are
      // both idempotency-keyed, so retrying the whole event is safe.
      this.retryable('post actual cost for certified claim', e, async () => {
        const p = e.payload as Record<string, unknown>;
        if (p.status !== 'certified') return;
        const cbsNodeId = p.cbsNodeId as string | null;
        const projectId = p.projectId as string | null;
        const gross = Number(p.thisPeriodGrossValue) || 0;
        if (!cbsNodeId || !projectId || gross <= 0) return;
        const existing = await this.ledger.list({ tenantId: e.tenantId, cbsNodeId });
        if (existing.some((t) => t.source === 'subcontract_claim' && t.dimensions?.claimId === e.aggregateId)) return;
        await this.ledger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          cbsNodeId, type: 'actual', amount: gross, source: 'subcontract_claim',
          sourceRef: `${(p.subcontractTitle as string) ?? 'Subcontract'} — claim #${p.claimNumber ?? ''}`.trim(),
          dimensions: { claimId: e.aggregateId, subcontractId: (p.subcontractId as string) ?? '' },
        });
        this.logger.log(`⚡ subcontract claim certified → actual ${gross} on CBS ${cbsNodeId} (claim ${e.aggregateId})`);
      }),
    );

    // ── Variation strand (the BUDGET side): approved change order → adjust the cost line's budget ──
    // A variation is not a spend — it moves the approved budget baseline (BAC). On approval, the
    // engine posts a `budget` CostTransaction of the signed amount (addition +, omission −) so the
    // line's budget = opening estimate + SUM(approved variations). Append-only + idempotent
    // (guarded per variationId), so a redelivered approval cannot double-adjust the budget.
    this.bus.subscribe('projects.variation.approved', (e: DomainEvent) =>
      // RETRYABLE: guarded per variationId, so a redelivered approval cannot double-adjust the budget.
      // Sole subscriber on this event.
      this.retryable('post budget change for approved variation', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const cbsNodeId = p.cbsNodeId as string | null;
        const projectId = p.projectId as string | null;
        const signedAmount = Number(p.signedAmount) || 0;
        if (!cbsNodeId || !projectId || signedAmount === 0) return;
        const existing = await this.ledger.list({ tenantId: e.tenantId, cbsNodeId });
        if (existing.some((t) => t.source === 'variation' && t.dimensions?.variationId === e.aggregateId)) return;
        await this.ledger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          cbsNodeId, type: 'budget', amount: signedAmount, source: 'variation',
          sourceRef: `${(p.title as string) ?? 'Variation'} — approved`, dimensions: { variationId: e.aggregateId },
        });
        this.logger.log(`⚡ variation approved → budget ${signedAmount >= 0 ? '+' : ''}${signedAmount} on CBS ${cbsNodeId} (VO ${e.aggregateId})`);
      }),
    );

    // ── Operate: GRN created → auto-transition PO to 'received' & suggest AP invoice ─────
    this.bus.subscribe('inventory.grn.created', (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const po = p.po as { id: string; title: string } | null;
      this.logger.log(
        `💡 grn.created → suggest AP invoice for "${p.title}" (PO: ${po ? po.id : 'none'}, value: ${p.value})`,
      );
      if (!po?.id) return Promise.resolve();
      // BEST-EFFORT: the PO status transition is not guarded for replay, and this shares grn.created with
      // the non-idempotent received-quantity reactor — so a rethrow would retry the event and double-post
      // quantities. The transition failure is accepted here instead.
      return this.bestEffort('auto-transition PO status on grn.created', e, 'PO transition is not replay-guarded and shares grn.created with the non-idempotent received-quantity reactor', async () => {
        await this.pos.changeStatus(po.id, 'received');
        this.logger.log(`⚡ grn.created → auto-transitioned PO ${po.id} to 'received' status`);
      });
    });

    // ── Operate: stock issued past reorder level → auto-draft a replenishment PR ──
    // Closes the loop the reorder-levels vertical opened. When an *issue* drops on-hand from
    // above the reorder level to at/below it (the crossing only — not every subsequent issue
    // while already low), we auto-draft a DRAFT purchase request for the suggested quantity
    // (the configured reorderQty, else enough to top back up to the level), valued at the item's
    // running WAC. Procurement reviews & sources it — exactly one PR per dip below the line.
    this.bus.subscribe('inventory.stock.movement_recorded', (e: DomainEvent) =>
      // BEST-EFFORT: `purchaseRequests.create` has no idempotency key or guard, so a retry would draft a
      // second replenishment PR. It also shares stock.movement_recorded with several non-idempotent
      // ledger reactors, so a rethrow would double-post those too. Accepted here, never retried.
      this.bestEffort('auto-draft replenishment PR from stock.movement_recorded', e, 'PR create is not idempotent and the event has non-idempotent co-subscribers; a retry would double-post', async () => {
        const p = e.payload as Record<string, unknown>;
        if (p.direction !== 'out') return; // only issues draw stock down
        const reorderLevel = Number(p.reorderLevel) || 0;
        if (reorderLevel <= 0) return; // no replenishment policy
        const balanceAfter = Number(p.balanceAfter) || 0;
        const quantity = Number(p.quantity) || 0;
        const before = balanceAfter + quantity;
        // fire only on the threshold crossing (was above, now at/below)
        if (!(before > reorderLevel && balanceAfter <= reorderLevel)) return;
        const reorderQty = Number(p.reorderQty) || 0;
        const suggestedQty = reorderQty > 0 ? reorderQty : Math.max(0, reorderLevel - balanceAfter);
        if (suggestedQty <= 0) return;
        const avgCost = Number(p.avgCost) || 0;
        const code = (p.code as string) ?? '';
        const name = (p.name as string) ?? code;
        const unit = (p.unit as string) ?? 'pcs';
        const pr = await this.purchaseRequests.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          reference: `PR-RO-${code}`,
          title: `Replenish ${name} (${code}) — ${suggestedQty} ${unit} (on-hand ${balanceAfter} ≤ reorder ${reorderLevel})`,
          value: Number(mulMoney(suggestedQty, avgCost)),
          status: 'draft',
        });
        this.logger.log(
          `⚡ stock low → auto-drafted replenishment PR "${pr.reference}" for ${suggestedQty} ${unit} of ${code} (value ${pr.value})`,
        );
      }),
    );

    // ── Operate: stock movement → perpetual-inventory GL posting ──────
    // Makes inventory a real accounting subledger. Each costed movement posts a balanced journal
    // at the movement's unit cost (receipt price for `in`; the WAC/COGS rate for `out`):
    //   receipt → Dr Inventory (1300)        / Cr GRNI (2150, goods-received-not-invoiced)
    //   issue   → Dr COGS (5010, expense)     / Cr Inventory (1300)
    // Accounts are created on first use (mirrors payment.service). Skips zero-cost movements.
    this.bus.subscribe('inventory.stock.movement_recorded', (e: DomainEvent) =>
      // BEST-EFFORT: `journals.post` writes an unguarded GL entry, so a retry would post the journal
      // twice. Accepted here, never retried.
      this.bestEffort('post inventory GL from stock.movement_recorded', e, 'journals.post is not idempotent; a retry would double-post the GL entry', async () => {
        const p = e.payload as Record<string, unknown>;
        const direction = p.direction as string;
        const quantity = Number(p.quantity) || 0;
        const unitCost = Number(p.unitCost) || 0;
        const amount = Number(mulMoney(quantity, unitCost));
        if (amount <= 0) return; // nothing to value (no cost captured)
        const code = (p.code as string) ?? '';
        const unit = (p.unit as string) ?? 'pcs';

        const inventory = await this.ensureAccount(e.tenantId, '1300', 'Inventory', 'asset');
        const ref = `INV-${code}`;
        if (direction === 'in') {
          const grni = await this.ensureAccount(e.tenantId, '2150', 'Goods Received Not Invoiced', 'liability');
          await this.journals.post({
            tenantId: e.tenantId,
            reference: ref,
            description: `Inventory receipt: ${quantity} ${unit} ${code} @ ${unitCost}`,
            lines: [
              { accountId: inventory.id, accountCode: inventory.code, accountName: inventory.name, debit: amount, credit: 0 },
              { accountId: grni.id, accountCode: grni.code, accountName: grni.name, debit: 0, credit: amount },
            ],
          });
        } else {
          const cogs = await this.ensureAccount(e.tenantId, '5010', 'Cost of Goods Sold', 'expense');
          await this.journals.post({
            tenantId: e.tenantId,
            reference: ref,
            description: `Inventory issue (COGS): ${quantity} ${unit} ${code} @ ${unitCost}`,
            lines: [
              { accountId: cogs.id, accountCode: cogs.code, accountName: cogs.name, debit: amount, credit: 0 },
              { accountId: inventory.id, accountCode: inventory.code, accountName: inventory.name, debit: 0, credit: amount },
            ],
          });
        }
        this.logger.log(`⚡ stock.${direction} → posted GL ${ref} for ${code} (${amount})`);
      }),
    );

    // ── Material cost strand: stock issued to / returned from a project → ACTUAL cost on the CBS line ──
    // No module touches the CBS directly. A coded stock movement (cbsNodeId set) becomes a CostTransaction:
    //   issue  (out) → ACTUAL  +qty, amount = qty × unitCost (the WAC/COGS rate), source 'material_issue'
    //   return (in)  → NEGATIVE actual −qty, −amount,                             source 'material_return'
    // So Material cost on a line = SUM(issues) − SUM(returns), append-only. The txn also carries the
    // signed `quantity`, which seeds the Quantity Ledger (issued/returned) with no extra plumbing.
    // Uncoded moves (plain warehouse receipts/GRNs) have no cbsNodeId → skipped; their cost lives on the PO.
    this.bus.subscribe('inventory.stock.movement_recorded', (e: DomainEvent) =>
      // BEST-EFFORT: `ledger.post` appends unconditionally, so a retry would double-count material cost.
      // Accepted here, never retried.
      this.bestEffort('post material cost txn from stock.movement_recorded', e, 'ledger.post is not idempotent; a retry would double-count material cost', async () => {
        const p = e.payload as Record<string, unknown>;
        const cbsNodeId = p.cbsNodeId as string | null;
        const projectId = p.projectId as string | null;
        if (!cbsNodeId || !projectId) return; // only project-coded movements post material cost
        const direction = p.direction as string;
        const quantity = Number(p.quantity) || 0;
        const unitCost = Number(p.unitCost) || 0;
        const cost = Number(mulMoney(quantity, unitCost));
        if (quantity <= 0) return;
        const sign = direction === 'out' ? 1 : -1; // issue adds cost/qty; return reverses both
        const code = (p.code as string) ?? '';
        const boqItemId = (p.boqItemId as string | null) ?? null;
        await this.ledger.post({
          tenantId: e.tenantId,
          companyId: e.companyId ?? null,
          projectId,
          cbsNodeId,
          type: 'actual',
          amount: sign * cost,
          quantity: sign * quantity,
          source: direction === 'out' ? 'material_issue' : 'material_return',
          sourceRef: `${code} — material ${direction === 'out' ? 'issue' : 'return'}`,
          dimensions: { movementId: e.aggregateId, itemCode: code, ...(boqItemId ? { boqItemId } : {}) },
        });
        this.logger.log(`⚡ material ${direction === 'out' ? 'issue' : 'return'} → posted actual ${sign * cost} (qty ${sign * quantity}) on CBS ${cbsNodeId} for ${code}`);
      }),
    );

    // ── Quantity Ledger (Phase 2): material moved against a BOQ item → post to the ISSUED position ──
    // The physical twin of the material cost reactor above. Keyed on boqItemId (the measured line),
    // independent of cost coding: an issue is +issued, a return is −issued, so net issued to site =
    // SUM(type='issued'). A movement can be coded to a BOQ item, a CBS node, both, or neither — this
    // fires whenever a boqItemId is present. Uncoded warehouse moves post nothing here.
    this.bus.subscribe('inventory.stock.movement_recorded', (e: DomainEvent) =>
      // BEST-EFFORT: `quantityLedger.post` appends unconditionally, so a retry would double-count the
      // issued position. Accepted here, never retried.
      this.bestEffort('post material quantity txn from stock.movement_recorded', e, 'quantityLedger.post is not idempotent; a retry would double-count the issued position', async () => {
        const p = e.payload as Record<string, unknown>;
        const boqItemId = p.boqItemId as string | null;
        const projectId = p.projectId as string | null;
        if (!boqItemId || !projectId) return; // only BOQ-coded movements move the quantity ledger
        const direction = p.direction as string;
        const quantity = Number(p.quantity) || 0;
        if (quantity <= 0) return;
        const sign = direction === 'out' ? 1 : -1; // issue adds to issued; return reverses it
        const code = (p.code as string) ?? '';
        await this.quantityLedger.post({
          tenantId: e.tenantId,
          companyId: e.companyId ?? null,
          projectId,
          boqItemId,
          cbsNodeId: (p.cbsNodeId as string | null) ?? null,
          type: 'issued',
          quantity: sign * quantity,
          unit: (p.unit as string | null) ?? null,
          source: direction === 'out' ? 'material_issue' : 'material_return',
          sourceRef: `${code} — material ${direction === 'out' ? 'issue' : 'return'}`,
          dimensions: { movementId: e.aggregateId, itemCode: code },
        });
        this.logger.log(`📏 material ${direction === 'out' ? 'issue' : 'return'} → posted issued ${sign * quantity} on BOQ ${boqItemId}`);
      }),
    );

    // ── Quantity Ledger (Phase 2): work installed on site → post INSTALLED quantity on the BOQ item ──
    // Physical work fixed in place is the production measure behind progress. The item's Installed
    // position = SUM(this). The gap Issued − Installed is wastage/WIP; Installed − Approved is the
    // inspection backlog. (This same signal feeds the Phase-3 Progress Engine → WBS %.)
    this.bus.subscribe('site.installation.recorded', (e: DomainEvent) =>
      // RETRYABLE (mig 0255): keyed `installed:<installationId>` — a replay returns the first
      // transaction and does not re-count the installed position. The follow-on
      // `wbs.syncProgressFromQuantity` RECOMPUTES progress from the (now-idempotent) ledger sum, so it
      // converges to the same value on replay. Sole subscriber on the event.
      this.retryable('post installed quantity from site.installation.recorded', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const boqItemId = p.boqItemId as string | null;
        const projectId = p.projectId as string | null;
        const quantity = Number(p.quantity) || 0;
        if (!boqItemId || !projectId || quantity <= 0) return;
        await this.quantityLedger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          boqItemId, cbsNodeId: (p.cbsNodeId as string | null) ?? null,
          type: 'installed', quantity, unit: (p.unit as string | null) ?? null,
          source: 'installation', sourceRef: (p.description as string) ?? null,
          dimensions: { installationId: e.aggregateId },
          dedupeKey: `installed:${e.aggregateId}`,
        });
        this.logger.log(`📏 installation → posted installed ${quantity} on BOQ ${boqItemId}`);
        // Progress Engine (Phase 3): installed quantity is physical progress — sync any WBS work
        // package linked to this BOQ item so its progress + earned value update automatically.
        await this.wbs.syncProgressFromQuantity(e.tenantId, boqItemId);
      }),
    );

    // ── Quantity Ledger (Phase 2): inspection approved → post APPROVED quantity on the BOQ item ──
    // Quality-accepted work. The item's Approved position = SUM(this). The gap Installed − Approved is
    // the inspection backlog; Approved − Invoiced is what is billable but not yet certified.
    this.bus.subscribe('quality.ir.approved', (e: DomainEvent) =>
      // RETRYABLE (mig 0255): keyed `ir-approved:<irId>` — a replay returns the first transaction and
      // does not re-count the approved position. Sole subscriber on the event.
      this.retryable('post approved quantity from quality.ir.approved', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const boqItemId = p.boqItemId as string | null;
        const projectId = p.projectId as string | null;
        const qty = Number(p.approvedQuantity) || 0;
        if (!boqItemId || !projectId || qty <= 0) return;
        await this.quantityLedger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          boqItemId, type: 'approved', quantity: qty, unit: (p.unit as string | null) ?? null,
          source: 'inspection', sourceRef: `IR ${(p.irNumber as string) ?? ''}`.trim(),
          dimensions: { irId: e.aggregateId },
          dedupeKey: `ir-approved:${e.aggregateId}`,
        });
        this.logger.log(`📏 ir.approved → posted approved ${qty} on BOQ ${boqItemId} (IR ${e.aggregateId})`);
      }),
    );

    // ── Quantity Ledger (Phase 2): IPC certified → post INVOICED quantity per valuation line ──
    // The last link in the delivery chain. A remeasurement IPC certifies work per BOQ item; each
    // valuation line's certified quantity becomes the item's Invoiced position. The gap Approved −
    // Invoiced is work that is billable but not yet certified to the client.
    this.bus.subscribe('contracts.ipc.certified', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const lines = (p.lines as Array<{ projectId?: string; boqItemId?: string; quantity?: number; unit?: string | null; description?: string }> | undefined) ?? [];
      for (const line of lines) {
        const boqItemId = line.boqItemId;
        const projectId = line.projectId;
        const qty = Number(line.quantity) || 0;
        if (!boqItemId || !projectId || qty <= 0) continue;
        // BEST-EFFORT PER LINE: `quantityLedger.post` appends unconditionally, so a retry would
        // double-count the invoiced position — and this event's AR-invoice sibling is guarded but would
        // be re-run by a retry. Each line is accepted independently so one bad line never aborts the rest.
        await this.bestEffort('post invoiced quantity from ipc.certified', e, 'quantityLedger.post is not idempotent; a retry would double-count the invoiced position', async () => {
          await this.quantityLedger.post({
            tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
            boqItemId, type: 'invoiced', quantity: qty, unit: line.unit ?? null,
            source: 'ipc', sourceRef: `${(p.reference as string) ?? 'IPC'} — ${line.description ?? ''}`.trim(),
            dimensions: { ipcId: e.aggregateId },
          });
          this.logger.log(`📏 ipc.certified → posted invoiced ${qty} on BOQ ${boqItemId} (IPC ${e.aggregateId})`);
        });
      }
    });

    // ── Labour strand: daily labour logged to a project cost line → ACTUAL cost = man-hours × rate ──
    // No module touches the CBS directly. A coded, rated labour allocation becomes an actual
    // CostTransaction (source 'labour_timesheet'), with man-hours as the signed quantity — seeding
    // both the Cost Ledger and the Quantity Ledger (man-hours). Unrated/uncoded logs post nothing.
    this.bus.subscribe('site.labour.logged', (e: DomainEvent) =>
      // RETRYABLE (mig 0254): `ledger.post` is now idempotent on `dedupeKey` — a replay of this event
      // returns the first transaction and does NOT move the CBS balance again. Sole subscriber on the
      // event, so nothing else is re-run. Failures now reach the outbox instead of being swallowed.
      this.retryable('post labour cost txn from site.labour.logged', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const cbsNodeId = p.cbsNodeId as string | null;
        const projectId = p.projectId as string | null;
        const labourCost = Number(p.labourCost) || 0;
        const manHours = Number(p.manHours) || 0;
        if (!cbsNodeId || !projectId || labourCost <= 0) return;
        await this.ledger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          cbsNodeId, type: 'actual', amount: labourCost, quantity: manHours, source: 'labour_timesheet',
          sourceRef: `${(p.trade as string) ?? 'Labour'} — ${manHours}mh`,
          dimensions: { labourId: e.aggregateId, trade: (p.trade as string) ?? '' },
          dedupeKey: `labour:${e.aggregateId}`,
        });
        this.logger.log(`⚡ labour logged → posted actual ${labourCost} (${manHours}mh) on CBS ${cbsNodeId}`);
      }),
    );

    // ── Plant strand: plant/equipment usage logged to a project cost line → ACTUAL = hours × rate ──
    // No module touches the CBS directly. A coded, rated plant-usage record becomes an actual
    // CostTransaction (source 'plant_usage'), with hours as the signed quantity — seeding both the
    // Cost Ledger and the Quantity Ledger (plant-hours). Unrated/uncoded records post nothing.
    this.bus.subscribe('site.plant.logged', (e: DomainEvent) =>
      // RETRYABLE (mig 0254): `ledger.post` is now idempotent on `dedupeKey`, so a replay does not
      // double-count plant cost or re-move the CBS balance. Sole subscriber on the event.
      this.retryable('post plant cost txn from site.plant.logged', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const cbsNodeId = p.cbsNodeId as string | null;
        const projectId = p.projectId as string | null;
        const cost = Number(p.cost) || 0;
        const hours = Number(p.hours) || 0;
        if (!cbsNodeId || !projectId || cost <= 0) return;
        await this.ledger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          cbsNodeId, type: 'actual', amount: cost, quantity: hours, source: 'plant_usage',
          sourceRef: `${(p.equipment as string) ?? 'Plant'} — ${hours}h`,
          dimensions: { plantId: e.aggregateId, equipment: (p.equipment as string) ?? '' },
          dedupeKey: `plant:${e.aggregateId}`,
        });
        this.logger.log(`⚡ plant logged → posted actual ${cost} (${hours}h) on CBS ${cbsNodeId}`);
      }),
    );

    // ── Subcontract: certified retention-release claim → auto-draft AP invoice ──
    // A certified retention-release claim is the signal to pay the subcontractor the retention we
    // held back — a positive supplier (AP) invoice for the released amount, carrying the
    // subcontractor snapshot. Skips normal (non-release) claims and zero releases.
    this.bus.subscribe('subcontracts.claim.statusChanged', (e: DomainEvent) =>
      // RETRYABLE: keyed by `ap-from-retention-release:<aggregateId>`, so a redelivery returns the first
      // invoice. The other two subscribers on claim.statusChanged (actual cost, certified AP invoice) are
      // likewise idempotent, so retrying the whole event is safe.
      this.retryable('auto-draft AP invoice from retention-release claim', e, async () => {
        const p = e.payload as Record<string, unknown>;
        if (p.status !== 'certified' || !p.isRetentionRelease) return;
        const amount = Number(p.retentionReleased) || 0;
        if (amount <= 0) return;
        const claimNumber = (p.claimNumber as string) ?? 'RET';
        const subcontractor = (p.subcontractor as string)?.trim() || 'Subcontractor';
        const subcontractId = (p.subcontractId as string) ?? e.aggregateId;
        const invoice = await this.supplierInvoices.create(
          {
            tenantId: e.tenantId,
            companyId: e.companyId,
            reference: `RET-${claimNumber}-${subcontractId.slice(0, 8)}`,
            title: `Retention release ${claimNumber} — ${subcontractor}`,
            supplierName: subcontractor,
            value: amount, // positive AP invoice = retention now payable to the subcontractor
            status: 'draft',
          },
          `ap-from-retention-release:${e.aggregateId}`,
        );
        this.logger.log(
          `⚡ claim.certified (retention release) → auto-drafted AP invoice "${invoice.reference}" vs ${subcontractor} (${amount})`,
        );
      }),
    );

    // ── Service: AMC work-order completed → auto-draft client AR invoice ──
    // Closes the AMC money-loop (mirror of ipc.certified → AR): a completed, costed service
    // visit is the signal to bill the client. Raises a DRAFT customer (AR) invoice for the
    // work-order cost (+5% VAT), carrying the contract client snapshot. Skips zero-cost visits.
    this.bus.subscribe('amc.workorder.completed', (e: DomainEvent) =>
      // BEST-EFFORT: the AR invoice number is deterministic, but `customerInvoices.create` is NOT guarded
      // by an existence check or idempotency key here, so a retry would raise a second invoice. Accepted
      // here, never retried. (Adding a guard/key would make this safely retryable — tracked separately.)
      this.bestEffort('auto-draft AR invoice from amc.workorder.completed', e, 'customer-invoice create is not guarded here; a retry would double-bill the client', async () => {
        const p = e.payload as Record<string, unknown>;
        const cost = Number(p.cost) || 0;
        if (cost <= 0) return; // nothing billable
        const orderNumber = (p.orderNumber as string) ?? 'WO';
        const clientName = (p.clientName as string)?.trim() || 'Client';
        const contractId = (p.contractId as string) ?? null;
        const invoice = await this.customerInvoices.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          invoiceNumber: `AR-AMC-${orderNumber}-${e.aggregateId.slice(0, 8)}`,
          customerName: clientName,
          contractRef: contractId,
          issueDate: new Date().toISOString().slice(0, 10),
          lines: [
            { description: `AMC service visit ${orderNumber}`, quantity: 1, unitPrice: cost, vatRate: 5 },
          ],
        });
        this.logger.log(
          `⚡ amc.workorder.completed → auto-drafted AR invoice "${invoice.invoiceNumber}" for ${clientName} (cost ${cost}, total ${invoice.total})`,
        );
      }),
    );

    // ── Operate: Invoice paid → accrue actual cost against the CBS cost line ────────
    // Actual cost is money truly spent. Accrued to the CBS node it's coded to (source of truth,
    // rolls up to the project summary), AND to the WBS node for earned-value. Both are optional
    // codings — actual cost lands where the invoice is coded, never smeared across the project.
    this.bus.subscribe('finance.invoice.paid', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const value = Number(p.value) || 0;

      // BEST-EFFORT (two independent posts): both `ledger.post` and `wbs.recordActualSpend` accrue
      // unconditionally, so a retry would double-count the actual spend. Each is accepted on its own so
      // one failing coding never blocks the other, and neither is handed to the relay.
      const cbsNodeId = p.cbsNodeId as string | null;
      const project = p.project as { id: string; name: string } | null;
      if (cbsNodeId && project?.id && value > 0) {
        await this.bestEffort('post actual cost txn from finance.invoice.paid', e, 'ledger.post is not idempotent; a retry would double-count actual cost', async () => {
          await this.ledger.post({
            tenantId: e.tenantId, companyId: e.companyId ?? null, projectId: project.id,
            cbsNodeId, type: 'actual', amount: value, source: 'invoice', sourceRef: (p.reference as string) ?? null,
          });
        });
      }

      const wbsNodeId = p.wbsNodeId as string | null;
      if (wbsNodeId) {
        await this.bestEffort('record spend against WBS node from finance.invoice.paid', e, 'recordActualSpend accrues unconditionally; a retry would double-count spend', async () => {
          await this.wbs.recordActualSpend(wbsNodeId, (p.value as number) ?? 0);
          this.logger.log(`⚡ Rolled up spend +$${p.value} against WBS Node ${wbsNodeId}`);
        });
      }
    });

    // ── BOQ Cost Recalculation Engine: Tender BOQ updated → auto-update Project CBS totals ──
    this.bus.subscribe('tendering.tender.updated', (e: DomainEvent) =>
      // RETRYABLE: `cbs.syncFromBoq` is a REPLACE (converges CBS to the current BOQ), so re-running it
      // yields the same state — a redelivery cannot drift the totals. Sole subscriber on this event.
      this.retryable('auto-update project CBS totals from tender.updated', e, async () => {
        const tenderId = e.aggregateId;
        const contractsList = await this.contracts.list({ tenderId });
        for (const contract of contractsList) {
          const projectsList = await this.projects.list({ contractId: contract.id });
          for (const proj of projectsList) {
            // Handover-locked Projects are intentionally not resynchronised from live Tender BOQ.
            // Legacy projects without a handover identity remain untouched until an explicit,
            // governed rebaseline path is designed.
            if (proj.handoverLockedAt) continue;
          }
        }
      }),
    );

    // ── Subcontract: claim certified → auto-draft AP invoice ─────────────
    this.bus.subscribe('subcontracts.claim.statusChanged', (e: DomainEvent) =>
      // RETRYABLE: keyed by `ap-subcon-claim:<aggregateId>`, so a redelivery returns the first invoice.
      // Its co-subscribers on claim.statusChanged (actual cost, retention-release AP) are also idempotent,
      // so retrying the whole event is safe.
      this.retryable('auto-draft AP invoice from claim.certified', e, async () => {
        const p = e.payload as Record<string, unknown>;
        if (p.status !== 'certified') return;

        const subcontractor = (p.subcontractor as string) ?? 'Subcontractor';
        const claimNumber = p.claimNumber as number;
        const netCertifiedValue = Number(p.netCertifiedValue) || 0;
        const subcontractId = p.subcontractId as string;
        const subcontractTitle = (p.subcontractTitle as string) ?? null;
        const projectId = (p.projectId as string) ?? null;
        const projectName = (p.projectName as string) ?? null;

        if (netCertifiedValue <= 0) {
          this.logger.log(`↩ claim.certified → net value is ${netCertifiedValue}, skipping AP invoice`);
          return;
        }

        const idempotencyKey = `ap-subcon-claim:${e.aggregateId}`;

        await this.supplierInvoices.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          title: `Subcontractor Claim #${claimNumber} — ${subcontractor}${subcontractTitle ? ` (${subcontractTitle})` : ''}`,
          supplierName: subcontractor,
          projectId,
          projectName,
          value: netCertifiedValue,
        }, idempotencyKey);

        this.logger.log(`⚡ claim.certified → auto-drafted AP invoice for ${subcontractor} claim #${claimNumber}: $${netCertifiedValue}`);
      }),
    );

    // ── Asset: asset disposed → post disposal entry to General Ledger ─────
    this.bus.subscribe('assets.asset.disposed', (e: DomainEvent) =>
      // RETRYABLE: guarded on the deterministic `DISP-<id>` reference — an existing journal short-circuits
      // before any post, so a redelivery cannot double-post the disposal. Sole subscriber on this event.
      this.retryable('post asset disposal GL from asset.disposed', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const proceeds = Number(p.proceeds) || 0;
        const bookValue = Number(p.bookValue) || 0;
        const gainLoss = Number(p.gainLoss) || 0;
        const assetName = (p.assetName as string) ?? 'Asset';

        const fixedAssets = await this.ensureAccount(e.tenantId, '1500', 'Fixed Assets', 'asset');
        const lossAcc = await this.ensureAccount(e.tenantId, '5920', 'Loss on Asset Disposal', 'expense');
        const gainAcc = await this.ensureAccount(e.tenantId, '4920', 'Gain on Asset Disposal', 'revenue');

        const ref = `DISP-${e.aggregateId.slice(0, 8)}`;
        const existing = await this.journals.list({ tenantId: e.tenantId, reference: ref });
        if (existing.length > 0) {
          this.logger.log(`↩ asset.disposed → GL journal ${ref} already exists, skipping`);
          return;
        }

        const lines: any[] = [];

        // 1. Credit Fixed Assets for the bookValue (writing off the remaining book value)
        lines.push({
          accountId: fixedAssets.id,
          accountCode: fixedAssets.code,
          accountName: fixedAssets.name,
          debit: 0,
          credit: bookValue,
        });

        // 2. Debit Bank/Cash if there are proceeds
        if (proceeds > 0) {
          const bank = await this.ensureAccount(e.tenantId, '1010', 'Main Bank Account', 'asset');
          lines.push({
            accountId: bank.id,
            accountCode: bank.code,
            accountName: bank.name,
            debit: proceeds,
            credit: 0,
          });
        }

        // 3. Debit Loss or Credit Gain
        if (gainLoss < 0) {
          lines.push({
            accountId: lossAcc.id,
            accountCode: lossAcc.code,
            accountName: lossAcc.name,
            debit: Math.abs(gainLoss),
            credit: 0,
          });
        } else if (gainLoss > 0) {
          lines.push({
            accountId: gainAcc.id,
            accountCode: gainAcc.code,
            accountName: gainAcc.name,
            debit: 0,
            credit: gainLoss,
          });
        }

        await this.journals.post({
          tenantId: e.tenantId,
          companyId: e.companyId,
          reference: ref,
          description: `Asset disposal: ${assetName} via ${p.method ?? 'Disposal'}`,
          lines,
        });

        this.logger.log(`⚡ asset.disposed → posted GL ${ref} for ${assetName} (proceeds: ${proceeds}, bookValue: ${bookValue}, gainLoss: ${gainLoss})`);
      }),
    );

    // ── Bid-time sourcing (R5): RFQ awarded → restamp sourced estimate components ──
    // A build-up component sourced from this RFQ is repriced to the awarded quote's amount, so the
    // tender estimate stays consistent with the real supplier price. EstimateSourcingService owns
    // the link + recompute; it no-ops when nothing was sourced from the RFQ.
    this.bus.subscribe('procurement.rfq.awarded', (e: DomainEvent) =>
      // RETRYABLE: `restampFromAward` sets sourced components to the awarded amount (a fixed target) and
      // no-ops when nothing was sourced, so re-running it converges to the same prices. Sole subscriber.
      this.retryable('restamp sourced estimates from rfq.awarded', e, async () => {
        const p = e.payload as Record<string, unknown>;
        const quoteId = p.quoteId as string | undefined;
        const amount = Number(p.amount) || 0;
        if (!quoteId || amount <= 0) return;
        const n = await this.estimateSourcing.restampFromAward({
          tenantId: e.tenantId,
          rfqId: e.aggregateId,
          quoteId,
          supplierName: (p.supplier as string) ?? 'Supplier',
          amount,
          actorId: e.actorId,
          // Governance: never restamp the costing behind a quotation already committed to the
          // client — an award must not silently rewrite a price we are standing behind. CRM owns
          // this rule; tendering has it passed in (ADR-0011).
          isTenderCommitted: async (tenderId) => {
            const generated = await this.quotations.listBySourceTender(e.tenantId, tenderId);
            const committed = generated.filter((q) => isQuotationCommitted(q));
            if (committed.length > 0) {
              this.logger.log(
                `⚡ rfq.awarded → estimate for tender ${tenderId} left frozen: ` +
                  `${committed.map((q) => `${q.quoteNumber} (${q.status})`).join(', ')} committed`,
              );
            }
            return committed.length > 0;
          },
        });
        if (n > 0) this.logger.log(`⚡ rfq.awarded → restamped ${n} sourced estimate component(s) to ${amount}`);
      }),
    );

    this.logger.log('Cross-module event subscribers registered (CRM → Tender → Contract → Project deal chain + operate loop)');
  }
}
