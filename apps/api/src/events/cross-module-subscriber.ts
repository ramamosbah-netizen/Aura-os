import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus, TenantContext } from '@aura/core';
import { ContractService } from '@aura/contracts';
import { ProjectService, WbsService, CbsService, CostLedgerService, QuantityLedgerService, VariationService } from '@aura/projects';
import { PurchaseOrderService, PurchaseRequestService } from '@aura/procurement';
import { TenderService, EstimateSourcingService } from '@aura/tendering';
import { AccountService, OpportunityService, QuotationService, SignalService, isQuotationCommitted } from '@aura/crm';
import { CustomerInvoiceService, InvoiceService, AccountService as FinanceAccountService, JournalService, type AccountType } from '@aura/finance';
import { HseService } from '@aura/hse';
import { AmcService } from '@aura/amc';
import { type DomainEvent, projectCompletionSignal, contractCompletionSignal } from '@aura/shared';

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
  private async closeSourceOpportunity(tenderId: string, outcome: 'won' | 'lost'): Promise<void> {
    const tender = await this.tenders.get(tenderId);
    if (!tender?.sourceOpportunityId) return; // a tender with no CRM deal behind it
    const opp = await this.opportunities.get(tender.sourceOpportunityId);
    if (!opp || opp.stage === 'won' || opp.stage === 'lost') return; // gone, or already closed
    const ref = tender.reference ?? tender.id;
    const reason = outcome === 'won' ? `Won on tender ${ref}` : `Lost on tender ${ref}`;
    await this.opportunities.update(
      tender.sourceOpportunityId,
      outcome === 'won'
        // The won gate needs the win explained AND a non-zero value — carry the tender's if the deal has none.
        ? { stage: 'won', winReason: reason, ...(opp.value > 0 ? {} : { value: tender.value }) }
        : { stage: 'lost', lossReason: reason },
      null,
    );
    this.logger.log(`⚡ tender.${outcome} → Opportunity "${opp.title}" (${opp.id}) closed ${outcome} (tender ${ref})`);
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
    // Tenders BORN from an opportunity ("Start Tender" / the deal-chain reactor) already carry
    // sourceOpportunityId and are skipped. The guard reads the tender's LIVE link (not the event
    // payload, which predates the back-link stamp), so an at-least-once redelivery never spawns a
    // second opportunity. opportunity.create emits `opportunity.created`, never `stage_changed`, so
    // this cannot loop back into the won→tender reactor above.
    this.bus.subscribe('tendering.tender.created', async (e: DomainEvent) => {
      try {
        const tender = await this.tenders.get(e.aggregateId);
        if (!tender || tender.sourceOpportunityId) return; // born from an opportunity, or already linked
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
        this.logger.log(
          `⚡ tender.created (direct) → auto-created Opportunity "${opp.title}" (${opp.id}) + back-linked tender ${tender.id}`,
        );
      } catch (err) {
        this.logger.error(`Failed to auto-create opportunity from tender.created: ${err}`);
      }
    });

    // ── Field intake: Site survey completed → auto-create linked Opportunity ──
    this.bus.subscribe('site.survey.completed', async (e: DomainEvent) => {
      try {
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
      } catch (err) {
        this.logger.error(`Failed to auto-create opportunity from site.survey.completed: ${err}`);
      }
    });

    // ── Deal chain CLOSE: Project completed → complete the source contract ──
    this.bus.subscribe('projects.project.completed', async (e: DomainEvent) => {
      try {
        const p = e.payload as Record<string, unknown>;
        const contractId = p.contractId as string | null;
        if (!contractId) return;
        const contract = await this.contracts.get(contractId);
        if (!contract || contract.status !== 'active') return; // only close an active contract once
        await this.contracts.changeStatus(contractId, 'completed');
        this.logger.log(`⚡ project.completed → contract "${contract.title}" completed (deal chain closed)`);
      } catch (err) {
        this.logger.error(`Failed to complete contract from project.completed: ${err}`);
      }
    });

    // ── Handover → AMC Draft: Project completed → auto-draft post-warranty AMC ServiceContract ──
        this.logger.log(`⚡ project.completed → auto-drafted AMC contract "${amcContract.contractNumber}" (${amcContract.id}) for ${amcContract.clientName}`);
      } catch (err) {
        this.logger.error(`Failed to auto-draft AMC contract from project.completed: ${err}`);
      }
    });

    // ── Account growth loop (S9): Project completed → growth Signal on the Radar ──
    // Closes the acquisition loop back onto the installed base. A delivered project is the warmest
    // growth pipeline there is — an opening for follow-on scope, cross-sell, or a service attach.
    // We drop an EXPANSION Signal on the Opportunity Radar (S3); SignalService.create is idempotent
    // on dedupeKey, so an outbox retry or re-completion never re-emits.
    this.bus.subscribe('projects.project.completed', async (e: DomainEvent) => {
      try {
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
      } catch (err) {
        this.logger.error(`Failed to raise growth signal from project.completed: ${err}`);
      }
    });

    // ── Account growth loop (S9): Contract completed → renewal Signal on the Radar ──
    // A completed contract is the trigger to pursue renewal / AMC / the next phase before the
    // relationship cools. RENEWAL_DUE Signal, deduped by contract id.
    this.bus.subscribe('contracts.contract.completed', async (e: DomainEvent) => {
      try {
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
      } catch (err) {
        this.logger.error(`Failed to raise renewal signal from contract.completed: ${err}`);
      }
    });

    // ── Deal chain: Tender won → auto-create Contract (draft) ──────────
    this.bus.subscribe('tendering.tender.awarded', async (e: DomainEvent) => {
      try {
        const p = e.payload as Record<string, unknown>;
        const account = p.account as { id: string; name: string } | null;
        // R3 parity (gap register G-50). The DIRECT path locks an immutable Commercial Baseline when
        // the quotation is approved, and the contract inherits it — value and all — so the contract
        // is provably tied to what was approved rather than re-invented. The tender path used to
        // skip all of that: it took `p.value`, the tender's own ESTIMATE, and left
        // quotationId/commercialBaselineId null. Same business intent, two levels of governance —
        // the path-asymmetry class. A tender that was priced through a quotation now inherits that
        // quotation's baseline exactly as a direct deal does.
        const priced = await this.findTenderBaseline(e.tenantId, e.aggregateId);
        const contract = await this.contracts.create(
          {
            tenantId: e.tenantId,
            companyId: e.companyId,
            title: `Contract for ${p.title ?? 'Tender'}`,
            tenderId: e.aggregateId,
            tenderTitle: (p.title as string) ?? null,
            accountId: account?.id ?? null,
            accountName: account?.name ?? null,
            // The bid the customer accepted beats the internal estimate. Falls back to the tender
            // value when the tender was awarded without a priced quotation (a legitimate path).
            value: priced?.value ?? (p.value as number) ?? 0,
            commercialBaselineId: priced?.baselineId ?? null,
            status: 'draft',
          },
          // Idempotency: re-awarding the same tender (or an outbox retry) must not
          // create a duplicate contract — keyed by the source tender id.
          `contract-from-tender:${e.aggregateId}`,
        );
        // Close the provenance loop the same way the direct path does, so the quotation remembers
        // the contract it became and the Opportunity 360 progression can find it.
        if (priced) await this.quotations.linkContract(priced.quotationId, contract.id).catch(() => undefined);
        this.logger.log(
          `⚡ tender.awarded → auto-created Contract "${contract.title}" (${contract.id})` +
            (priced
              ? ` — inherited baseline ${priced.baselineId} from quotation ${priced.quotationId} (value ${priced.value})`
              : ' — no priced quotation; value from the tender estimate, no baseline'),
        );
      } catch (err) {
        this.logger.error(`Failed to auto-create contract from tender.awarded: ${err}`);
      }
    });

    // ── Deal chain CLOSE (J3): Tender won → close the source Opportunity as Won ──
    // The tender is the EXECUTION of one opportunity, so winning the bid wins the deal. Sibling to
    // the contract reactor above: the award drives both the contract (delivery side) and the CRM
    // close (pipeline side). No-ops when the tender has no source opportunity or the deal is
    // already closed, so an at-least-once redelivery is safe.
    this.bus.subscribe('tendering.tender.awarded', async (e: DomainEvent) => {
      try {
        await this.closeSourceOpportunity(e.aggregateId, 'won');
      } catch (err) {
        this.logger.error(`Failed to close opportunity Won from tender.awarded: ${err}`);
      }
    });

    // ── Deal chain CLOSE (J3): Tender lost → close the source Opportunity as Lost ──
    this.bus.subscribe('tendering.tender.lost', async (e: DomainEvent) => {
      try {
        await this.closeSourceOpportunity(e.aggregateId, 'lost');
      } catch (err) {
        this.logger.error(`Failed to close opportunity Lost from tender.lost: ${err}`);
      }
    });

    // ── Deal chain: Contract signed → auto-create Project (planned) ────
    this.bus.subscribe('contracts.contract.signed', async (e: DomainEvent) => {
      try {
        const p = e.payload as Record<string, unknown>;
        const account = p.account as { id: string; name: string } | null;
        const tender = p.tender as { id: string; title: string | null } | null;
        const project = await this.projects.create(
          {
            tenantId: e.tenantId,
            companyId: e.companyId,
            title: `Project: ${p.title ?? 'Contract'}`,
            contractId: e.aggregateId,
            contractTitle: (p.title as string) ?? null,
            accountId: account?.id ?? null,
            accountName: account?.name ?? null,
            value: (p.value as number) ?? 0,
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
        try {
          const existingWbs = await this.wbs.list({ projectId: project.id });
          if (existingWbs.length === 0) {
            await this.wbs.create({
              tenantId: e.tenantId,
              projectId: project.id,
              code: '1',
              title: project.title,
              plannedValue: project.value,
            });
            if (tender?.id) {
              const { items } = await this.tenders.getOrCreateBOQ(e.tenantId, e.companyId, tender.id);
              if (items.length > 0) {
                await this.cbs.syncFromBoq(project.id, e.tenantId, items);
                this.logger.log(
                  `⚡ contract.signed → seeded root WBS + ${items.length} CBS node(s) on Project ${project.id} from tender ${tender.id} BOQ`,
                );
              }
            }
          }
        } catch (seedErr) {
          this.logger.error(`Failed to seed WBS/CBS for auto-created project ${project.id}: ${seedErr}`);
        }
      } catch (err) {
        this.logger.error(`Failed to auto-create project from contract.signed: ${err}`);
      }
    });

    // ── Engineering → Commercial: Design change approved → auto-draft Variation ──
    // ADR-0011 in action: Engineering owns the design change; Projects owns the commercial
    // variation. On approval WITH a cost impact, the design change emits an event; here we create
    // a DRAFT variation carrying the value snapshot. QS reviews & approves it, which then rolls
    // into the project's revised contract value. Never a direct cross-module call.
    this.bus.subscribe('engineering.design_change.approved', async (e: DomainEvent) => {
      try {
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
      } catch (err) {
        this.logger.error(`Failed to auto-draft variation from design_change.approved: ${err}`);
      }
    });

    // ── Engineering → HSE: submitted Risk Assessment routed into HSE's queue ──
    // ADR-0011/0012 in action: Engineering *originates* a Risk Assessment (a docType whose
    // drafting it owns) but HSE *owns the process* (ownerModule='hse'). On submit, the
    // engineering document emits an event carrying ownerModule; here we create the HSE Risk
    // Assessment so it lands in HSE's review queue. Engineering never calls HSE directly.
    this.bus.subscribe('engineering.document.submitted', async (e: DomainEvent) => {
      try {
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
      } catch (err) {
        this.logger.error(`Failed to route risk assessment to HSE from engineering.document.submitted: ${err}`);
      }
    });

    // ── Contracting money-flow: IPC certified → auto-draft client AR invoice ──
    // Closes the loop the IPC vertical opened: a certified interim payment certificate is the
    // signal to bill the client. We raise a DRAFT customer (AR) invoice for the net certified
    // this period (+ 5% VAT), carrying the account + contract snapshots — finance reviews & issues.
    this.bus.subscribe('contracts.ipc.certified', async (e: DomainEvent) => {
      try {
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
      } catch (err) {
        this.logger.error(`Failed to auto-draft AR invoice from ipc.certified: ${err}`);
      }
    });

    // ── Subcontracting money-flow: back-charge recovered → auto-draft AP debit note ──
    // The mirror of ipc.certified → AR. A back-charge recovered from a subcontractor is the
    // signal to reduce what we owe them: we raise a DRAFT supplier (AP) invoice with a NEGATIVE
    // value — a debit note — carrying the subcontractor snapshot. Netted against their payables in
    // AP aging; finance reviews & approves. Skips when there's no recovery amount.
    this.bus.subscribe('subcontracts.backcharge.recovered', async (e: DomainEvent) => {
      try {
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
      } catch (err) {
        this.logger.error(`Failed to auto-draft AP debit note from backcharge.recovered: ${err}`);
      }
    });

    // ── Operate: PO created → post a COMMITTED cost transaction to the ledger ───────
    // No module touches the CBS directly. The PO becomes a CostTransaction; the Transaction Engine
    // appends it to the ledger (source of truth + audit trail) and moves the CBS node's balance.
    // Committed cost is tracked only where the PO is coded (cbsNodeId) — never guessed.
    this.bus.subscribe('procurement.po.created', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const cbsNodeId = p.cbsNodeId as string | null;
      const project = p.project as { id: string; name: string } | null;
      const value = Number(p.value) || 0;
      if (cbsNodeId && project?.id && value > 0) {
        try {
          await this.ledger.post({
            tenantId: e.tenantId, companyId: e.companyId ?? null, projectId: project.id,
            cbsNodeId, type: 'committed', amount: value, source: 'po', sourceRef: (p.title as string) ?? null,
            dimensions: { poId: e.aggregateId },
          });
        } catch (err) {
          this.logger.error(`Failed to post committed cost txn for CBS node ${cbsNodeId}: ${err}`);
        }
      }
    });

    // ── Committed-cost lifecycle: PO cancelled → REVERSE its committed cost (a NEGATIVE entry) ──
    // The ledger is append-only, so un-committing a cancelled PO is a negative posting, never a
    // mutation — the CBS balance drops by exactly what the PO put on it, and the drill-down keeps
    // both the +commit and the −reversal. Idempotent: guarded on an existing reversal for this PO,
    // so an at-least-once redelivery cannot double-reverse and corrupt the balance.
    this.bus.subscribe('procurement.po.updated', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      if (p.status !== 'cancelled') return;
      const cbsNodeId = p.cbsNodeId as string | null;
      const project = p.project as { id: string; name: string } | null;
      const value = Number(p.value) || 0;
      if (!cbsNodeId || !project?.id || value <= 0) return;
      try {
        const existing = await this.ledger.list({ tenantId: e.tenantId, cbsNodeId });
        if (existing.some((t) => t.source === 'reversal' && t.dimensions?.poId === e.aggregateId)) return; // already reversed
        await this.ledger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId: project.id,
          cbsNodeId, type: 'committed', amount: -value, source: 'reversal',
          sourceRef: `${(p.title as string) ?? 'PO'} — cancelled`, dimensions: { poId: e.aggregateId, reverses: 'po' },
        });
        this.logger.log(`↩ po.cancelled → reversed committed ${value} on CBS ${cbsNodeId} (PO ${e.aggregateId})`);
      } catch (err) {
        this.logger.error(`Failed to reverse committed cost for cancelled PO ${e.aggregateId}: ${err}`);
      }
    });

    // ── Quantity Ledger (Phase 2): PO created → post ORDERED quantity on the BOQ item ──
    // The physical twin of the committed-cost reactor above. A PO coded to a BOQ item (boqItemId +
    // orderedQuantity) accrues the ordered quantity so the item's Ordered position = SUM(this).
    this.bus.subscribe('procurement.po.created', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const boqItemId = p.boqItemId as string | null;
      const project = p.project as { id: string; name: string } | null;
      const qty = Number(p.orderedQuantity) || 0;
      if (!boqItemId || !project?.id || qty <= 0) return;
      try {
        await this.quantityLedger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId: project.id,
          boqItemId, cbsNodeId: (p.cbsNodeId as string | null) ?? null,
          type: 'ordered', quantity: qty, unit: (p.unit as string | null) ?? null,
          source: 'po', sourceRef: (p.title as string) ?? null, dimensions: { poId: e.aggregateId },
        });
        this.logger.log(`📏 po.created → posted ordered ${qty} on BOQ ${boqItemId} (PO ${e.aggregateId})`);
      } catch (err) {
        this.logger.error(`Failed to post ordered quantity for PO ${e.aggregateId}: ${err}`);
      }
    });

    // ── Quantity Ledger: PO cancelled → REVERSE the ordered quantity (a negative entry) ──
    // Append-only + idempotent (guarded on an existing reversal for this PO), mirroring the committed-
    // cost reversal so the Ordered position drops by exactly what the PO put on it.
    this.bus.subscribe('procurement.po.updated', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      if (p.status !== 'cancelled') return;
      const boqItemId = p.boqItemId as string | null;
      const project = p.project as { id: string; name: string } | null;
      const qty = Number(p.orderedQuantity) || 0;
      if (!boqItemId || !project?.id || qty <= 0) return;
      try {
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
      } catch (err) {
        this.logger.error(`Failed to reverse ordered quantity for cancelled PO ${e.aggregateId}: ${err}`);
      }
    });

    // ── Quantity Ledger (Phase 2): GRN created → post RECEIVED quantity on the BOQ item ──
    // A goods receipt coded to a BOQ item (boqItemId + receivedQuantity) accrues the received quantity
    // so the item's Received position = SUM(this). The gap Ordered − Received is what is still in transit.
    this.bus.subscribe('inventory.grn.created', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const boqItemId = p.boqItemId as string | null;
      const project = p.project as { id: string; name: string } | null;
      const qty = Number(p.receivedQuantity) || 0;
      if (!boqItemId || !project?.id || qty <= 0) return;
      try {
        await this.quantityLedger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId: project.id,
          boqItemId, type: 'received', quantity: qty, unit: (p.unit as string | null) ?? null,
          source: 'grn', sourceRef: (p.title as string) ?? null, dimensions: { grnId: e.aggregateId },
        });
        this.logger.log(`📏 grn.created → posted received ${qty} on BOQ ${boqItemId} (GRN ${e.aggregateId})`);
      } catch (err) {
        this.logger.error(`Failed to post received quantity for GRN ${e.aggregateId}: ${err}`);
      }
    });

    // ── Subcontract strand (mirrors the PO): active → COMMITTED cost on the CBS line ──
    // A subcontract is a commitment like a PO. When it goes 'active' (awarded), the engine posts a
    // committed CostTransaction for its value. Idempotent: guarded on an existing committed entry for
    // this subcontract, so re-activation (or a redelivered event) cannot double-commit.
    this.bus.subscribe('subcontracts.subcontract.statusChanged', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      if (p.status !== 'active') return;
      const cbsNodeId = p.cbsNodeId as string | null;
      const projectId = p.projectId as string | null;
      const value = Number(p.value) || 0;
      if (!cbsNodeId || !projectId || value <= 0) return;
      try {
        const existing = await this.ledger.list({ tenantId: e.tenantId, cbsNodeId });
        if (existing.some((t) => t.source === 'subcontract' && t.dimensions?.subcontractId === e.aggregateId)) return;
        await this.ledger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          cbsNodeId, type: 'committed', amount: value, source: 'subcontract',
          sourceRef: `${(p.title as string) ?? 'Subcontract'} — awarded`, dimensions: { subcontractId: e.aggregateId },
        });
        this.logger.log(`⚡ subcontract active → committed ${value} on CBS ${cbsNodeId} (SC ${e.aggregateId})`);
      } catch (err) {
        this.logger.error(`Failed to post committed cost for subcontract ${e.aggregateId}: ${err}`);
      }
    });

    // ── Subcontract strand: claim (IPC) certified → ACTUAL cost = gross work done this period ──
    // Each certified interim claim recognises the gross value of work put in place this period as
    // actual cost on the CBS line (retention is withheld payment, not a cost reduction). Append-only,
    // so Subcontract actual = SUM(certified gross). Idempotent: guarded on an existing actual for this
    // claim. Retention-release claims have thisPeriodGrossValue=0 → skipped (handled by the AP reactor).
    this.bus.subscribe('subcontracts.claim.statusChanged', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      if (p.status !== 'certified') return;
      const cbsNodeId = p.cbsNodeId as string | null;
      const projectId = p.projectId as string | null;
      const gross = Number(p.thisPeriodGrossValue) || 0;
      if (!cbsNodeId || !projectId || gross <= 0) return;
      try {
        const existing = await this.ledger.list({ tenantId: e.tenantId, cbsNodeId });
        if (existing.some((t) => t.source === 'subcontract_claim' && t.dimensions?.claimId === e.aggregateId)) return;
        await this.ledger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          cbsNodeId, type: 'actual', amount: gross, source: 'subcontract_claim',
          sourceRef: `${(p.subcontractTitle as string) ?? 'Subcontract'} — claim #${p.claimNumber ?? ''}`.trim(),
          dimensions: { claimId: e.aggregateId, subcontractId: (p.subcontractId as string) ?? '' },
        });
        this.logger.log(`⚡ subcontract claim certified → actual ${gross} on CBS ${cbsNodeId} (claim ${e.aggregateId})`);
      } catch (err) {
        this.logger.error(`Failed to post actual cost for certified claim ${e.aggregateId}: ${err}`);
      }
    });

    // ── Variation strand (the BUDGET side): approved change order → adjust the cost line's budget ──
    // A variation is not a spend — it moves the approved budget baseline (BAC). On approval, the
    // engine posts a `budget` CostTransaction of the signed amount (addition +, omission −) so the
    // line's budget = opening estimate + SUM(approved variations). Append-only + idempotent
    // (guarded per variationId), so a redelivered approval cannot double-adjust the budget.
    this.bus.subscribe('projects.variation.approved', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const cbsNodeId = p.cbsNodeId as string | null;
      const projectId = p.projectId as string | null;
      const signedAmount = Number(p.signedAmount) || 0;
      if (!cbsNodeId || !projectId || signedAmount === 0) return;
      try {
        const existing = await this.ledger.list({ tenantId: e.tenantId, cbsNodeId });
        if (existing.some((t) => t.source === 'variation' && t.dimensions?.variationId === e.aggregateId)) return;
        await this.ledger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          cbsNodeId, type: 'budget', amount: signedAmount, source: 'variation',
          sourceRef: `${(p.title as string) ?? 'Variation'} — approved`, dimensions: { variationId: e.aggregateId },
        });
        this.logger.log(`⚡ variation approved → budget ${signedAmount >= 0 ? '+' : ''}${signedAmount} on CBS ${cbsNodeId} (VO ${e.aggregateId})`);
      } catch (err) {
        this.logger.error(`Failed to post budget change for approved variation ${e.aggregateId}: ${err}`);
      }
    });

    // ── Operate: GRN created → auto-transition PO to 'received' & suggest AP invoice ─────
    this.bus.subscribe('inventory.grn.created', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const po = p.po as { id: string; title: string } | null;
      this.logger.log(
        `💡 grn.created → suggest AP invoice for "${p.title}" (PO: ${po ? po.id : 'none'}, value: ${p.value})`,
      );
      if (po?.id) {
        try {
          await this.pos.changeStatus(po.id, 'received');
          this.logger.log(`⚡ grn.created → auto-transitioned PO ${po.id} to 'received' status`);
        } catch (err) {
          this.logger.error(`Failed to auto-transition PO status on grn.created: ${err}`);
        }
      }
    });

    // ── Operate: stock issued past reorder level → auto-draft a replenishment PR ──
    // Closes the loop the reorder-levels vertical opened. When an *issue* drops on-hand from
    // above the reorder level to at/below it (the crossing only — not every subsequent issue
    // while already low), we auto-draft a DRAFT purchase request for the suggested quantity
    // (the configured reorderQty, else enough to top back up to the level), valued at the item's
    // running WAC. Procurement reviews & sources it — exactly one PR per dip below the line.
    this.bus.subscribe('inventory.stock.movement_recorded', async (e: DomainEvent) => {
      try {
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
          value: Math.round(suggestedQty * avgCost * 100) / 100,
          status: 'draft',
        });
        this.logger.log(
          `⚡ stock low → auto-drafted replenishment PR "${pr.reference}" for ${suggestedQty} ${unit} of ${code} (value ${pr.value})`,
        );
      } catch (err) {
        this.logger.error(`Failed to auto-draft replenishment PR from stock.movement_recorded: ${err}`);
      }
    });

    // ── Operate: stock movement → perpetual-inventory GL posting ──────
    // Makes inventory a real accounting subledger. Each costed movement posts a balanced journal
    // at the movement's unit cost (receipt price for `in`; the WAC/COGS rate for `out`):
    //   receipt → Dr Inventory (1300)        / Cr GRNI (2150, goods-received-not-invoiced)
    //   issue   → Dr COGS (5010, expense)     / Cr Inventory (1300)
    // Accounts are created on first use (mirrors payment.service). Skips zero-cost movements.
    this.bus.subscribe('inventory.stock.movement_recorded', async (e: DomainEvent) => {
      try {
        const p = e.payload as Record<string, unknown>;
        const direction = p.direction as string;
        const quantity = Number(p.quantity) || 0;
        const unitCost = Number(p.unitCost) || 0;
        const amount = Math.round(quantity * unitCost * 100) / 100;
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
      } catch (err) {
        this.logger.error(`Failed to post inventory GL from stock.movement_recorded: ${err}`);
      }
    });

    // ── Material cost strand: stock issued to / returned from a project → ACTUAL cost on the CBS line ──
    // No module touches the CBS directly. A coded stock movement (cbsNodeId set) becomes a CostTransaction:
    //   issue  (out) → ACTUAL  +qty, amount = qty × unitCost (the WAC/COGS rate), source 'material_issue'
    //   return (in)  → NEGATIVE actual −qty, −amount,                             source 'material_return'
    // So Material cost on a line = SUM(issues) − SUM(returns), append-only. The txn also carries the
    // signed `quantity`, which seeds the Quantity Ledger (issued/returned) with no extra plumbing.
    // Uncoded moves (plain warehouse receipts/GRNs) have no cbsNodeId → skipped; their cost lives on the PO.
    this.bus.subscribe('inventory.stock.movement_recorded', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const cbsNodeId = p.cbsNodeId as string | null;
      const projectId = p.projectId as string | null;
      if (!cbsNodeId || !projectId) return; // only project-coded movements post material cost
      const direction = p.direction as string;
      const quantity = Number(p.quantity) || 0;
      const unitCost = Number(p.unitCost) || 0;
      const cost = Math.round(quantity * unitCost * 100) / 100;
      if (quantity <= 0) return;
      const sign = direction === 'out' ? 1 : -1; // issue adds cost/qty; return reverses both
      const code = (p.code as string) ?? '';
      const boqItemId = (p.boqItemId as string | null) ?? null;
      try {
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
      } catch (err) {
        this.logger.error(`Failed to post material cost txn for CBS node ${cbsNodeId}: ${err}`);
      }
    });

    // ── Quantity Ledger (Phase 2): material moved against a BOQ item → post to the ISSUED position ──
    // The physical twin of the material cost reactor above. Keyed on boqItemId (the measured line),
    // independent of cost coding: an issue is +issued, a return is −issued, so net issued to site =
    // SUM(type='issued'). A movement can be coded to a BOQ item, a CBS node, both, or neither — this
    // fires whenever a boqItemId is present. Uncoded warehouse moves post nothing here.
    this.bus.subscribe('inventory.stock.movement_recorded', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const boqItemId = p.boqItemId as string | null;
      const projectId = p.projectId as string | null;
      if (!boqItemId || !projectId) return; // only BOQ-coded movements move the quantity ledger
      const direction = p.direction as string;
      const quantity = Number(p.quantity) || 0;
      if (quantity <= 0) return;
      const sign = direction === 'out' ? 1 : -1; // issue adds to issued; return reverses it
      const code = (p.code as string) ?? '';
      try {
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
      } catch (err) {
        this.logger.error(`Failed to post material quantity txn for BOQ item ${boqItemId}: ${err}`);
      }
    });

    // ── Quantity Ledger (Phase 2): work installed on site → post INSTALLED quantity on the BOQ item ──
    // Physical work fixed in place is the production measure behind progress. The item's Installed
    // position = SUM(this). The gap Issued − Installed is wastage/WIP; Installed − Approved is the
    // inspection backlog. (This same signal feeds the Phase-3 Progress Engine → WBS %.)
    this.bus.subscribe('site.installation.recorded', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const boqItemId = p.boqItemId as string | null;
      const projectId = p.projectId as string | null;
      const quantity = Number(p.quantity) || 0;
      if (!boqItemId || !projectId || quantity <= 0) return;
      try {
        await this.quantityLedger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          boqItemId, cbsNodeId: (p.cbsNodeId as string | null) ?? null,
          type: 'installed', quantity, unit: (p.unit as string | null) ?? null,
          source: 'installation', sourceRef: (p.description as string) ?? null,
          dimensions: { installationId: e.aggregateId },
        });
        this.logger.log(`📏 installation → posted installed ${quantity} on BOQ ${boqItemId}`);
        // Progress Engine (Phase 3): installed quantity is physical progress — sync any WBS work
        // package linked to this BOQ item so its progress + earned value update automatically.
        await this.wbs.syncProgressFromQuantity(e.tenantId, boqItemId);
      } catch (err) {
        this.logger.error(`Failed to post installed quantity for BOQ item ${boqItemId}: ${err}`);
      }
    });

    // ── Quantity Ledger (Phase 2): inspection approved → post APPROVED quantity on the BOQ item ──
    // Quality-accepted work. The item's Approved position = SUM(this). The gap Installed − Approved is
    // the inspection backlog; Approved − Invoiced is what is billable but not yet certified.
    this.bus.subscribe('quality.ir.approved', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const boqItemId = p.boqItemId as string | null;
      const projectId = p.projectId as string | null;
      const qty = Number(p.approvedQuantity) || 0;
      if (!boqItemId || !projectId || qty <= 0) return;
      try {
        await this.quantityLedger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          boqItemId, type: 'approved', quantity: qty, unit: (p.unit as string | null) ?? null,
          source: 'inspection', sourceRef: `IR ${(p.irNumber as string) ?? ''}`.trim(),
          dimensions: { irId: e.aggregateId },
        });
        this.logger.log(`📏 ir.approved → posted approved ${qty} on BOQ ${boqItemId} (IR ${e.aggregateId})`);
      } catch (err) {
        this.logger.error(`Failed to post approved quantity for IR ${e.aggregateId}: ${err}`);
      }
    });

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
        try {
          await this.quantityLedger.post({
            tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
            boqItemId, type: 'invoiced', quantity: qty, unit: line.unit ?? null,
            source: 'ipc', sourceRef: `${(p.reference as string) ?? 'IPC'} — ${line.description ?? ''}`.trim(),
            dimensions: { ipcId: e.aggregateId },
          });
          this.logger.log(`📏 ipc.certified → posted invoiced ${qty} on BOQ ${boqItemId} (IPC ${e.aggregateId})`);
        } catch (err) {
          this.logger.error(`Failed to post invoiced quantity for IPC ${e.aggregateId} BOQ ${boqItemId}: ${err}`);
        }
      }
    });

    // ── Labour strand: daily labour logged to a project cost line → ACTUAL cost = man-hours × rate ──
    // No module touches the CBS directly. A coded, rated labour allocation becomes an actual
    // CostTransaction (source 'labour_timesheet'), with man-hours as the signed quantity — seeding
    // both the Cost Ledger and the Quantity Ledger (man-hours). Unrated/uncoded logs post nothing.
    this.bus.subscribe('site.labour.logged', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const cbsNodeId = p.cbsNodeId as string | null;
      const projectId = p.projectId as string | null;
      const labourCost = Number(p.labourCost) || 0;
      const manHours = Number(p.manHours) || 0;
      if (!cbsNodeId || !projectId || labourCost <= 0) return;
      try {
        await this.ledger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          cbsNodeId, type: 'actual', amount: labourCost, quantity: manHours, source: 'labour_timesheet',
          sourceRef: `${(p.trade as string) ?? 'Labour'} — ${manHours}mh`,
          dimensions: { labourId: e.aggregateId, trade: (p.trade as string) ?? '' },
        });
        this.logger.log(`⚡ labour logged → posted actual ${labourCost} (${manHours}mh) on CBS ${cbsNodeId}`);
      } catch (err) {
        this.logger.error(`Failed to post labour cost txn for CBS node ${cbsNodeId}: ${err}`);
      }
    });

    // ── Plant strand: plant/equipment usage logged to a project cost line → ACTUAL = hours × rate ──
    // No module touches the CBS directly. A coded, rated plant-usage record becomes an actual
    // CostTransaction (source 'plant_usage'), with hours as the signed quantity — seeding both the
    // Cost Ledger and the Quantity Ledger (plant-hours). Unrated/uncoded records post nothing.
    this.bus.subscribe('site.plant.logged', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const cbsNodeId = p.cbsNodeId as string | null;
      const projectId = p.projectId as string | null;
      const cost = Number(p.cost) || 0;
      const hours = Number(p.hours) || 0;
      if (!cbsNodeId || !projectId || cost <= 0) return;
      try {
        await this.ledger.post({
          tenantId: e.tenantId, companyId: e.companyId ?? null, projectId,
          cbsNodeId, type: 'actual', amount: cost, quantity: hours, source: 'plant_usage',
          sourceRef: `${(p.equipment as string) ?? 'Plant'} — ${hours}h`,
          dimensions: { plantId: e.aggregateId, equipment: (p.equipment as string) ?? '' },
        });
        this.logger.log(`⚡ plant logged → posted actual ${cost} (${hours}h) on CBS ${cbsNodeId}`);
      } catch (err) {
        this.logger.error(`Failed to post plant cost txn for CBS node ${cbsNodeId}: ${err}`);
      }
    });

    // ── Subcontract: certified retention-release claim → auto-draft AP invoice ──
    // A certified retention-release claim is the signal to pay the subcontractor the retention we
    // held back — a positive supplier (AP) invoice for the released amount, carrying the
    // subcontractor snapshot. Skips normal (non-release) claims and zero releases.
    this.bus.subscribe('subcontracts.claim.statusChanged', async (e: DomainEvent) => {
      try {
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
      } catch (err) {
        this.logger.error(`Failed to auto-draft AP invoice from retention-release claim: ${err}`);
      }
    });

    // ── Service: AMC work-order completed → auto-draft client AR invoice ──
    // Closes the AMC money-loop (mirror of ipc.certified → AR): a completed, costed service
    // visit is the signal to bill the client. Raises a DRAFT customer (AR) invoice for the
    // work-order cost (+5% VAT), carrying the contract client snapshot. Skips zero-cost visits.
    this.bus.subscribe('amc.workorder.completed', async (e: DomainEvent) => {
      try {
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
      } catch (err) {
        this.logger.error(`Failed to auto-draft AR invoice from amc.workorder.completed: ${err}`);
      }
    });

    // ── Operate: Invoice paid → accrue actual cost against the CBS cost line ────────
    // Actual cost is money truly spent. Accrued to the CBS node it's coded to (source of truth,
    // rolls up to the project summary), AND to the WBS node for earned-value. Both are optional
    // codings — actual cost lands where the invoice is coded, never smeared across the project.
    this.bus.subscribe('finance.invoice.paid', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const value = Number(p.value) || 0;

      const cbsNodeId = p.cbsNodeId as string | null;
      const project = p.project as { id: string; name: string } | null;
      if (cbsNodeId && project?.id && value > 0) {
        try {
          await this.ledger.post({
            tenantId: e.tenantId, companyId: e.companyId ?? null, projectId: project.id,
            cbsNodeId, type: 'actual', amount: value, source: 'invoice', sourceRef: (p.reference as string) ?? null,
          });
        } catch (err) {
          this.logger.error(`Failed to post actual cost txn for CBS node ${cbsNodeId}: ${err}`);
        }
      }

      const wbsNodeId = p.wbsNodeId as string | null;
      if (wbsNodeId) {
        try {
          await this.wbs.recordActualSpend(wbsNodeId, (p.value as number) ?? 0);
          this.logger.log(`⚡ Rolled up spend +$${p.value} against WBS Node ${wbsNodeId}`);
        } catch (err) {
          this.logger.error(`Failed to record spend against WBS Node ${wbsNodeId}: ${err}`);
        }
      }
    });

    // ── BOQ Cost Recalculation Engine: Tender BOQ updated → auto-update Project CBS totals ──
    this.bus.subscribe('tendering.tender.updated', async (e: DomainEvent) => {
      try {
        const tenderId = e.aggregateId;
        const contractsList = await this.contracts.list({ tenderId });
        for (const contract of contractsList) {
          const projectsList = await this.projects.list({ contractId: contract.id });
          for (const proj of projectsList) {
            const { items } = await this.tenders.getOrCreateBOQ(e.tenantId, e.companyId, tenderId);
            if (items && items.length > 0) {
              await this.cbs.syncFromBoq(proj.id, e.tenantId, items);
              this.logger.log(`⚡ BOQ updated for Tender ${tenderId} → auto-synced ${items.length} CBS nodes on Project ${proj.id}`);
            }
          }
        }
      } catch (err) {
        this.logger.error(`Failed to auto-update project CBS totals from tender.updated event: ${err}`);
      }
    });

    // ── Subcontract: claim certified → auto-draft AP invoice ─────────────
    this.bus.subscribe('subcontracts.claim.statusChanged', async (e: DomainEvent) => {
      try {
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
      } catch (err) {
        this.logger.error(`Failed to auto-draft AP invoice from claim.certified: ${err}`);
      }
    });

    // ── Asset: asset disposed → post disposal entry to General Ledger ─────
    this.bus.subscribe('assets.asset.disposed', async (e: DomainEvent) => {
      try {
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
      } catch (err) {
        this.logger.error(`Failed to post asset disposal GL from asset.disposed: ${err}`);
      }
    });

    // ── Bid-time sourcing (R5): RFQ awarded → restamp sourced estimate components ──
    // A build-up component sourced from this RFQ is repriced to the awarded quote's amount, so the
    // tender estimate stays consistent with the real supplier price. EstimateSourcingService owns
    // the link + recompute; it no-ops when nothing was sourced from the RFQ.
    this.bus.subscribe('procurement.rfq.awarded', async (e: DomainEvent) => {
      try {
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
      } catch (err) {
        this.logger.error(`Failed to restamp sourced estimates from rfq.awarded: ${err}`);
      }
    });

    this.logger.log('Cross-module event subscribers registered (CRM → Tender → Contract → Project deal chain + operate loop)');
  }
}

