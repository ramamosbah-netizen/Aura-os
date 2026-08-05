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
import { StockService } from '@aura/inventory';

const TENANT = 'dev-tenant';

/**
 * The ELV catalogue (gap register **G-24**).
 *
 * The demo previously shipped no stock items at all, so the platform's own flagship lookup —
 * search a manufacturer and model, find the SKU and every installed unit with its site and
 * warranty — returned a purchase order and nothing else. The search *capability* was closed and
 * unit-tested; the *demonstration* was not, because the seeded catalogue had no manufacturer or
 * model anywhere in it.
 *
 * These are real ELV part numbers across the four subsystems an ELV contractor actually installs
 * (CCTV · access control · fire · networking), so `?q=Hikvision`, `?q=DS-2CD2143G2-I` and
 * `?q=Dahua` all resolve to something a demo audience recognises.
 */
const ELV_CATALOGUE: ReadonlyArray<{ code: string; name: string; barcode: string; unit: string; reorderLevel: number; qty: number; cost: number }> = [
  { code: 'HIK-DS-2CD2143G2-I', name: 'Hikvision DS-2CD2143G2-I 4MP Dome Camera', barcode: '6954273659745', unit: 'ea', reorderLevel: 20, qty: 120, cost: 385 },
  { code: 'HIK-DS-2CD2087G2-L', name: 'Hikvision DS-2CD2087G2-L 8MP ColorVu Bullet', barcode: '6954273661229', unit: 'ea', reorderLevel: 12, qty: 60, cost: 690 },
  { code: 'HIK-DS-7716NI-K4', name: 'Hikvision DS-7716NI-K4 16-Ch NVR', barcode: '6954273649128', unit: 'ea', reorderLevel: 2, qty: 8, cost: 2_450 },
  { code: 'DAH-IPC-HDBW3441R', name: 'Dahua IPC-HDBW3441R-ZS 4MP IR Dome', barcode: '6923172504418', unit: 'ea', reorderLevel: 15, qty: 45, cost: 410 },
  { code: 'HID-R40-ICLASS', name: 'HID iCLASS SE R40 Smart Card Reader', barcode: '0088341021009', unit: 'ea', reorderLevel: 10, qty: 36, cost: 520 },
  { code: 'ZKT-INBIO460', name: 'ZKTeco inBIO460 4-Door Access Controller', barcode: '6936284403109', unit: 'ea', reorderLevel: 4, qty: 12, cost: 1_180 },
  { code: 'BOS-FAP-425', name: 'Bosch FAP-425-DOTC-R Multi-Sensor Detector', barcode: '4047024325074', unit: 'ea', reorderLevel: 25, qty: 200, cost: 240 },
  { code: 'BOS-FPA-5000', name: 'Bosch FPA-5000 Modular Fire Panel', barcode: '4047024118836', unit: 'ea', reorderLevel: 1, qty: 3, cost: 8_900 },
  { code: 'CMS-CAT6A-UFTP', name: 'Commscope Cat-6A U/FTP LSZH Cable (305m box)', barcode: '0732458761203', unit: 'box', reorderLevel: 8, qty: 40, cost: 1_150 },
  { code: 'CIS-C9200L-24P', name: 'Cisco Catalyst C9200L-24P-4G 24-Port PoE+ Switch', barcode: '0889728175302', unit: 'ea', reorderLevel: 2, qty: 6, cost: 4_300 },
];

/**
 * First-run demo data — opt-in via DEMO_SEED=true, so tests and production stay
 * untouched. Seeds a believable slice of the whole platform THROUGH the module
 * services (never the stores), so every record emits its real spine events and the
 * Workspace, Inbox, global search and dashboards light up on first sign-in.
 *
 * **Idempotency (gap register G-11), stated precisely so nobody over-trusts it:**
 * - The seed as a whole is guarded by `runIfEmpty` — it skips when the tenant already has any CRM
 *   account, so a clean re-run cannot duplicate.
 * - **Accounts** are additionally idempotent *per record* (get-or-create by name). Accounts are the
 *   register other paths also write to — a journey run, a Radar promote whose identity resolution
 *   misses, a partially-failed seed — and the one that had actually accumulated duplicates in the
 *   long-lived dev database.
 * - The **ELV catalogue** is master data, seeded by `seedCatalogue()` **outside** the once-only
 *   guard and idempotent by item code, so it tops up an existing database instead of being skipped.
 * - The rest (tenders, contracts, POs, HR, quality) is **not** per-record idempotent and relies on
 *   the outer guard. Re-seeding a tenant that already has data is still a no-op, not a merge.
 *
 * Duplicates that already exist are a data-cleanup job, not something this seeder repairs.
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
    private readonly stock: StockService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Get-or-create by name (gap register **G-11**).
   *
   * The seed as a whole was guarded by "skip if the tenant has any account", which prevents a
   * *clean* re-run duplicating — but it is all-or-nothing: a seed that failed halfway could never
   * be completed, and any other path that creates an account (a journey run, a Radar promote whose
   * identity resolution misses) leaves the register with two of the same customer and no way for
   * the seeder to converge it. The live dev database accumulated **five triplicated accounts**
   * that way. Making each record individually idempotent means the seed can be re-run at any time,
   * from any state, and converges instead of multiplying.
   */
  private async ensureAccount(name: string, attrs: { status: string; industry: string }) {
    const existing = await this.accounts.list({ tenantId: TENANT, limit: 500 });
    const match = existing.find((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (match) return match;
    return this.accounts.create({ tenantId: TENANT, name, ...attrs } as Parameters<AccountService['create']>[0]);
  }

  async onModuleInit(): Promise<void> {
    if (process.env.DEMO_SEED !== 'true') return;
    // Master data first, and OUTSIDE the once-only guard. The ELV catalogue is reference data, not
    // part of the transactional demo slice: a database that already has a deal chain still needs
    // the catalogue, and an all-or-nothing guard is why the flagship brand/model search demo kept
    // returning nothing on the long-lived dev database. Idempotent by item code, so it tops up.
    await this.seedCatalogue();
    await this.runIfEmpty();
  }

  /**
   * The ELV catalogue (G-24) — idempotent by item code, safe on every boot. Non-fatal: a catalogue
   * that fails to load must never cost the demo its deal chain.
   */
  async seedCatalogue(): Promise<{ added: number }> {
    return this.tenant.run({ tenantId: TENANT, companyId: null, actorId: null }, async () => {
      try {
        const already = new Set((await this.stock.listItems({ tenantId: TENANT, limit: 500 })).map((i) => i.code));
        let added = 0;
        for (const item of ELV_CATALOGUE) {
          if (already.has(item.code)) continue;
          await this.stock.createItem({
            tenantId: TENANT,
            code: item.code,
            name: item.name,
            barcode: item.barcode,
            unit: item.unit,
            warehouse: 'Main Store',
            reorderLevel: item.reorderLevel,
            reorderQty: item.reorderLevel * 2,
            openingQty: item.qty,
            openingCost: item.cost,
          });
          added++;
        }
        if (added) this.logger.log(`Seeded ${added} ELV catalogue item(s) — brand/model search now resolves.`);
        return { added };
      } catch (e) {
        this.logger.warn(`ELV catalogue seed skipped: ${(e as Error).message}`);
        return { added: 0 };
      }
    });
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
    const emaar = await this.ensureAccount('Emaar Properties', { status: 'active_customer', industry: 'Real Estate' });
    const dewa = await this.ensureAccount('DEWA', { status: 'active_customer', industry: 'Utilities' });
    await this.ensureAccount('Nakheel Marinas', { status: 'prospect', industry: 'Marine & Leisure' });

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
