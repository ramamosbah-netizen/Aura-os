import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { AccountService } from '@aura/crm';
import { TenderService } from '@aura/tendering';
import { ContractService } from '@aura/contracts';
import { ProjectService, VariationService } from '@aura/projects';
import { PurchaseOrderService, PurchaseRequestService, SupplierService } from '@aura/procurement';
import { InvoiceService } from '@aura/finance';
import { SubcontractsService } from '@aura/subcontracts';
import { HrService } from '@aura/hr';
import { QualityService } from '@aura/quality';

const TENANT = 'dev-tenant';

/**
 * First-run demo data — opt-in via DEMO_SEED=true, so tests and production stay
 * untouched. Seeds a believable slice of the whole platform THROUGH the module
 * services (never the stores), so every record emits its real spine events and the
 * Workspace, Inbox, global search and dashboards light up on first sign-in.
 * Idempotent: skips when the tenant already has any CRM account.
 */
@Injectable()
export class DemoSeeder implements OnModuleInit {
  private readonly logger = new Logger('DemoSeeder');

  constructor(
    private readonly accounts: AccountService,
    private readonly tenders: TenderService,
    private readonly contracts: ContractService,
    private readonly projects: ProjectService,
    private readonly variations: VariationService,
    private readonly prs: PurchaseRequestService,
    private readonly pos: PurchaseOrderService,
    private readonly suppliers: SupplierService,
    private readonly invoices: InvoiceService,
    private readonly subcontracts: SubcontractsService,
    private readonly hr: HrService,
    private readonly quality: QualityService,
    private readonly tenant: TenantContext,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.DEMO_SEED !== 'true') return;
    await this.runIfEmpty();
  }

  /** Idempotent demo seed — used by DEMO_SEED boot and the admin data page (§2.9). */
  async runIfEmpty(): Promise<{ seeded: boolean; reason?: string }> {
    // Bind the demo tenant for the whole operation: boot (onModuleInit) runs outside any request,
    // so without this the existence-check reads and the seed writes would carry no tenant context
    // and fail closed under the enforced `aura_app` role. The admin-endpoint path already has a
    // request tenant, but binding TENANT here keeps the seed writing to 'dev-tenant' consistently.
    return this.tenant.run({ tenantId: TENANT, companyId: null, actorId: null }, async () => {
      try {
        const existing = await this.accounts.list({ tenantId: TENANT, limit: 1 });
        if (existing.length > 0) {
          this.logger.log('Demo seed skipped — tenant already has data.');
          return { seeded: false, reason: 'tenant already has data' };
        }
        await this.seed();
        this.logger.log('Demo company seeded (accounts → tenders → contract → project → operate loop + HR/Quality inbox items).');
        return { seeded: true };
      } catch (e) {
        this.logger.warn(`Demo seed failed (continuing without it): ${(e as Error).message}`);
        return { seeded: false, reason: (e as Error).message };
      }
    });
  }

  private async seed(): Promise<void> {
    // ── Deal chain ──────────────────────────────────────────────────────────
    const emaar = await this.accounts.create({ tenantId: TENANT, name: 'Emaar Properties', status: 'active_customer', industry: 'Real Estate' });
    const dewa = await this.accounts.create({ tenantId: TENANT, name: 'DEWA', status: 'active_customer', industry: 'Utilities' });
    await this.accounts.create({ tenantId: TENANT, name: 'Nakheel Marinas', status: 'prospect', industry: 'Marine & Leisure' });

    const wonTender = await this.tenders.create({
      tenantId: TENANT, title: 'Marina Tower — ELV & Security Package', reference: 'TND-2026-014',
      accountId: emaar.id, accountName: emaar.name, status: 'won', value: 4_800_000,
    });
    await this.tenders.create({
      tenantId: TENANT, title: 'Substation SCADA Upgrade — Phase 2', reference: 'TND-2026-021',
      accountId: dewa.id, accountName: dewa.name, status: 'submitted', value: 2_150_000,
    });

    const contract = await this.contracts.create({
      tenantId: TENANT, title: 'Marina Tower ELV Contract', reference: 'CNT-2026-009',
      tenderId: wonTender.id, tenderTitle: wonTender.title,
      accountId: emaar.id, accountName: emaar.name, status: 'active', value: 4_800_000,
    });

    const project = await this.projects.create({
      tenantId: TENANT, title: 'Marina Tower ELV Delivery', reference: 'PRJ-2026-005',
      contractId: contract.id, contractTitle: contract.title,
      accountId: emaar.id, accountName: emaar.name, status: 'active', value: 4_800_000,
    });

    const variation = await this.variations.create({
      tenantId: TENANT, projectId: project.id, projectTitle: project.title,
      title: 'Additional CCTV coverage — basement levels', type: 'addition', amount: 145_000,
    });
    await this.variations.changeStatus(variation.id, 'submitted');

    // ── Operate loop ────────────────────────────────────────────────────────
    await this.suppliers.create({ tenantId: TENANT, code: 'SUP-001', name: 'Gulf Cables & Electrical', category: 'materials' });

    await this.prs.create({
      tenantId: TENANT, title: 'Cat-6A structured cabling — Tower floors 1–20', reference: 'PR-2026-031',
      projectId: project.id, projectName: project.title, status: 'draft', value: 320_000,
    });

    const issuedPo = await this.pos.create({
      tenantId: TENANT, title: 'CCTV cameras & NVRs — main supply', reference: 'PO-2026-044',
      supplierName: 'Gulf Cables & Electrical', projectId: project.id, projectName: project.title,
      status: 'issued', value: 860_000,
    });
    await this.pos.create({
      tenantId: TENANT, title: 'Access-control controllers & readers', reference: 'PO-2026-045',
      supplierName: 'Gulf Cables & Electrical', projectId: project.id, projectName: project.title,
      status: 'pending_approval', value: 240_000,
    });

    await this.invoices.create({
      tenantId: TENANT, title: 'CCTV supply — 1st delivery', reference: 'INV-8871',
      poId: issuedPo.id, poTitle: issuedPo.title, supplierName: 'Gulf Cables & Electrical',
      projectId: project.id, projectName: project.title, status: 'draft', value: 430_000,
    });
    await this.invoices.create({
      tenantId: TENANT, title: 'Mobilization — site setup', reference: 'INV-8842',
      supplierName: 'Gulf Cables & Electrical',
      projectId: project.id, projectName: project.title, status: 'approved', value: 95_000,
    });

    const activeSub = await this.subcontracts.createSubcontract({
      tenantId: TENANT, projectId: project.id, projectName: project.title,
      title: 'Containment & cable-tray installation', subcontractorName: 'Al Futtaim Engineering', value: 540_000,
    });
    await this.subcontracts.changeSubcontractStatus(activeSub.id, 'active');
    await this.subcontracts.createClaim({ tenantId: TENANT, subcontractId: activeSub.id, workCompletedValue: 180_000 });
    await this.subcontracts.createSubcontract({
      tenantId: TENANT, projectId: project.id, projectName: project.title,
      title: 'Fire-alarm devices installation', subcontractorName: 'Transguard Systems', value: 310_000,
    });

    // ── People ──────────────────────────────────────────────────────────────
    const ahmed = await this.hr.createEmployee(null, {
      tenantId: TENANT, firstName: 'Ahmed', lastName: 'Al Mansouri', role: 'Project Engineer',
      department: 'Projects', joinedDate: '2024-03-01', email: 'ahmed@demo.aura',
    });
    const sara = await this.hr.createEmployee(null, {
      tenantId: TENANT, firstName: 'Sara', lastName: 'Hassan', role: 'Accountant',
      department: 'Finance', joinedDate: '2023-08-15', email: 'sara@demo.aura',
    });
    await this.hr.createEmployee(null, {
      tenantId: TENANT, firstName: 'Rajesh', lastName: 'Kumar', role: 'Site Supervisor',
      department: 'Site', joinedDate: '2022-11-20',
    });

    await this.hr.requestLeave(null, {
      tenantId: TENANT, employeeId: ahmed.id, leaveType: 'annual',
      startDate: nextDate(14), endDate: nextDate(21), reason: 'Family visit',
    });
    const ts = await this.hr.createTimesheetEntry({
      tenantId: TENANT, employeeId: ahmed.id, projectId: project.id,
      date: nextDate(-1), hours: 8, overtime: 2, description: 'CCTV riser installation supervision',
    });
    await this.hr.submitTimesheetEntry(TENANT, ts.id);
    const claim = await this.hr.createExpenseClaim({
      tenantId: TENANT, employeeId: sara.id, category: 'fuel',
      amount: 240, expenseDate: nextDate(-3), description: 'Site visits — client meetings',
    });
    await this.hr.submitExpenseClaim(TENANT, claim.id);

    // ── Quality ─────────────────────────────────────────────────────────────
    const mar = await this.quality.createMaterialApproval({
      tenantId: TENANT, projectId: project.id, projectName: project.title,
      reference: 'MAR-0007', materialName: 'Cat-6A U/FTP cable', manufacturer: 'Belden', supplier: 'Gulf Cables & Electrical',
    });
    await this.quality.submitMaterialApproval(TENANT, mar.id);
  }
}

/** YYYY-MM-DD, `days` from today (negative = past). */
function nextDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
