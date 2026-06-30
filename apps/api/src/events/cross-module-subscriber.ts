import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus, TenantContext } from '@aura/core';
import { ContractService } from '@aura/contracts';
import { ProjectService, WbsService, CbsService } from '@aura/projects';
import { PurchaseOrderService, PurchaseRequestService } from '@aura/procurement';
import { TenderService } from '@aura/tendering';
import { AccountService } from '@aura/crm';
import { CustomerInvoiceService, InvoiceService, AccountService as FinanceAccountService, JournalService, type AccountType } from '@aura/finance';
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
    private readonly tenant: TenantContext,
    private readonly pos: PurchaseOrderService,
    private readonly purchaseRequests: PurchaseRequestService,
    private readonly tenders: TenderService,
    private readonly accounts: AccountService,
    private readonly customerInvoices: CustomerInvoiceService,
    private readonly supplierInvoices: InvoiceService,
    private readonly financeAccounts: FinanceAccountService,
    private readonly journals: JournalService,
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
        const tender = await this.tenders.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          title: `Tender: ${p.title ?? 'Opportunity'}`,
          accountId: (p.accountId as string) ?? null,
          accountName: (p.accountName as string) ?? null,
          value: (p.value as number) ?? 0,
          status: 'draft',
        });
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
        const contract = await this.contracts.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          title: `Contract for ${p.title ?? 'Tender'}`,
          tenderId: e.aggregateId,
          tenderTitle: (p.title as string) ?? null,
          accountId: account?.id ?? null,
          accountName: account?.name ?? null,
          value: (p.value as number) ?? 0,
          status: 'draft',
        });
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
        const project = await this.projects.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          title: `Project: ${p.title ?? 'Contract'}`,
          contractId: e.aggregateId,
          contractTitle: (p.title as string) ?? null,
          accountId: account?.id ?? null,
          accountName: account?.name ?? null,
          value: (p.value as number) ?? 0,
          status: 'planned',
        });
        this.logger.log(
          `⚡ contract.signed → auto-created Project "${project.title}" (${project.id})`,
        );
      } catch (err) {
        this.logger.error(`Failed to auto-create project from contract.signed: ${err}`);
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
        const invoice = await this.customerInvoices.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          invoiceNumber: `AR-${reference}-${contractId.slice(0, 8)}`,
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
        const invoice = await this.supplierInvoices.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          reference: `DN-${reference}-${subcontractId.slice(0, 8)}`,
          title: `Back-charge recovery ${reference} — ${subcontractor}`,
          supplierName: subcontractor,
          value: -amount, // negative supplier invoice = debit note reducing the subcontractor payable
          status: 'draft',
        });
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
            description: `Inventory issue (COGS): ${quantity} ${unit} ${code} @ WAC ${unitCost}`,
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

    this.logger.log('Cross-module event subscribers registered (CRM → Tender → Contract → Project deal chain + operate loop)');
  }
}
