import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus, TenantContext } from '@aura/core';
import { ContractService } from '@aura/contracts';
import { ProjectService, WbsService, CbsService, VariationService } from '@aura/projects';
import { PurchaseOrderService, PurchaseRequestService } from '@aura/procurement';
import { TenderService } from '@aura/tendering';
import { AccountService } from '@aura/crm';
import { CustomerInvoiceService, InvoiceService, AccountService as FinanceAccountService, JournalService, type AccountType } from '@aura/finance';
import { HseService } from '@aura/hse';
import type { DomainEvent } from '@aura/shared';

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
    private readonly variations: VariationService,
    private readonly tenant: TenantContext,
    private readonly pos: PurchaseOrderService,
    private readonly purchaseRequests: PurchaseRequestService,
    private readonly tenders: TenderService,
    private readonly accounts: AccountService,
    private readonly customerInvoices: CustomerInvoiceService,
    private readonly supplierInvoices: InvoiceService,
    private readonly financeAccounts: FinanceAccountService,
    private readonly journals: JournalService,
    private readonly hse: HseService,
  ) {}

  /** Resolve a GL account by well-known code, creating it on first use (mirrors payment.service). */
  private async ensureAccount(tenantId: string, code: string, name: string, type: AccountType) {
    const existing = await this.financeAccounts.getByCode(tenantId, code);
    if (existing) return existing;
    return this.financeAccounts.create({ tenantId, code, name, type });
  }

  onModuleInit(): void {
    // ── Deal chain: Opportunity won → auto-create Tender (draft) ───────
    this.bus.subscribe('crm.opportunity.stage_changed', async (e: DomainEvent) => {
      try {
        const p = e.payload as Record<string, unknown>;
        if (p.stage !== 'won') return; // Only react on won stage
        const tender = await this.tenders.create(
          {
            tenantId: e.tenantId,
            companyId: e.companyId,
            title: `Tender: ${p.title ?? 'Opportunity'}`,
            accountId: (p.accountId as string) ?? null,
            accountName: (p.accountName as string) ?? null,
            value: (p.value as number) ?? 0,
            status: 'draft',
          },
          // Idempotency: the outbox is at-least-once, so a re-delivered (or re-won)
          // opportunity event must not spawn a second tender. Keyed by the source
          // opportunity id, a retry returns the same tender from the command cache.
          `tender-from-opportunity:${e.aggregateId}`,
        );
        this.logger.log(
          `⚡ opportunity.won → auto-created Tender "${tender.title}" (${tender.id})`,
        );
      } catch (err) {
        this.logger.error(`Failed to auto-create tender from opportunity.won: ${err}`);
      }
    });

    // ── Deal chain: Tender won → auto-create Contract (draft) ──────────
    this.bus.subscribe('tendering.tender.awarded', async (e: DomainEvent) => {
      try {
        const p = e.payload as Record<string, unknown>;
        const account = p.account as { id: string; name: string } | null;
        const contract = await this.contracts.create(
          {
            tenantId: e.tenantId,
            companyId: e.companyId,
            title: `Contract for ${p.title ?? 'Tender'}`,
            tenderId: e.aggregateId,
            tenderTitle: (p.title as string) ?? null,
            accountId: account?.id ?? null,
            accountName: account?.name ?? null,
            value: (p.value as number) ?? 0,
            status: 'draft',
          },
          // Idempotency: re-awarding the same tender (or an outbox retry) must not
          // create a duplicate contract — keyed by the source tender id.
          `contract-from-tender:${e.aggregateId}`,
        );
        this.logger.log(
          `⚡ tender.awarded → auto-created Contract "${contract.title}" (${contract.id})`,
        );
      } catch (err) {
        this.logger.error(`Failed to auto-create contract from tender.awarded: ${err}`);
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

    // ── Operate: PO created → log committed cost against project ───────
    this.bus.subscribe('procurement.po.created', (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const project = p.project as { id: string; name: string } | null;
      if (project) {
        this.logger.log(
          `📊 po.created → committed cost +${p.value} against project "${project.name}" (${project.id})`,
        );
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

    // ── Operate: Invoice paid → log actual cost against project ────────
    this.bus.subscribe('finance.invoice.paid', async (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      const project = p.project as { id: string; name: string } | null;
      if (project) {
        this.logger.log(
          `📊 invoice.paid → actual cost +${p.value} against project "${project.name}" (${project.id})`,
        );
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

    this.logger.log('Cross-module event subscribers registered (CRM → Tender → Contract → Project deal chain + operate loop)');
  }
}

