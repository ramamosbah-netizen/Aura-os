import { Injectable } from '@nestjs/common';
import { AccountService, OpportunityService, QuotationService } from '@aura/crm';
import { TenderService } from '@aura/tendering';
import { ContractService } from '@aura/contracts';
import { ProjectService } from '@aura/projects';
import { PurchaseOrderService, SupplierService } from '@aura/procurement';
import { InvoiceService } from '@aura/finance';
import { SubcontractsService } from '@aura/subcontracts';
import { HrService } from '@aura/hr';
import { AssetsService } from '@aura/assets';

export interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * Global search — a thin cross-module aggregator (Constitution Law #1 honored: it composes
 * the modules' service APIs in the host, never joins their tables). v1 lists each spine
 * entity and matches title/name/reference in memory; a search projection can replace the
 * fan-out later without changing callers. Spine entities deep-link to their record page;
 * the rest link to the module page that owns them.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly accounts: AccountService,
    private readonly tenders: TenderService,
    private readonly contracts: ContractService,
    private readonly projects: ProjectService,
    private readonly pos: PurchaseOrderService,
    private readonly invoices: InvoiceService,
    private readonly opportunities: OpportunityService,
    private readonly quotations: QuotationService,
    private readonly suppliers: SupplierService,
    private readonly subcontracts: SubcontractsService,
    private readonly hr: HrService,
    private readonly assets: AssetsService,
  ) {}

  async search(tenantId: string, q: string, limit = 20): Promise<SearchHit[]> {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const has = (...vals: Array<string | null | undefined>): boolean =>
      vals.some((v) => typeof v === 'string' && v.toLowerCase().includes(needle));

    const [
      accounts,
      tenders,
      contracts,
      projects,
      pos,
      invoices,
      opportunities,
      quotations,
      suppliers,
      subcontracts,
      employees,
      assets,
    ] = await Promise.all([
      this.accounts.list({ tenantId, limit: 50 }),
      this.tenders.list({ tenantId, limit: 50 }),
      this.contracts.list({ tenantId, limit: 50 }),
      this.projects.list({ tenantId, limit: 50 }),
      this.pos.list({ tenantId, limit: 50 }),
      this.invoices.list({ tenantId, limit: 50 }),
      this.opportunities.list({ tenantId, limit: 50 }),
      this.quotations.list({ tenantId, limit: 50 }),
      this.suppliers.list({ tenantId, limit: 50 }),
      this.subcontracts.listSubcontracts({ tenantId }),
      this.hr.listEmployees(tenantId),
      this.assets.listAssets(tenantId),
    ]);

    const hits: SearchHit[] = [];
    for (const a of accounts)
      if (has(a.name)) hits.push({ type: 'Account', id: a.id, title: a.name, subtitle: a.status, href: `/crm/accounts/${a.id}` });
    for (const t of tenders)
      if (has(t.title, t.reference)) hits.push({ type: 'Tender', id: t.id, title: t.title, subtitle: t.reference ?? t.status, href: `/tendering/tenders/${t.id}` });
    for (const c of contracts)
      if (has(c.title, c.reference)) hits.push({ type: 'Contract', id: c.id, title: c.title, subtitle: c.reference ?? c.status, href: `/contracts/contracts/${c.id}` });
    for (const p of projects)
      if (has(p.title, p.reference)) hits.push({ type: 'Project', id: p.id, title: p.title, subtitle: p.reference ?? p.status, href: `/projects/projects/${p.id}` });
    for (const o of pos)
      if (has(o.title, o.reference, o.supplierName)) hits.push({ type: 'Purchase Order', id: o.id, title: o.title, subtitle: o.reference ?? o.supplierName ?? o.status, href: `/procurement/purchase-orders/${o.id}` });
    for (const i of invoices)
      if (has(i.title, i.reference, i.supplierName)) hits.push({ type: 'Invoice', id: i.id, title: i.title, subtitle: i.reference ?? i.supplierName ?? i.status, href: `/finance/invoices/${i.id}` });
    for (const o of opportunities)
      if (has(o.title, o.accountName)) hits.push({ type: 'Opportunity', id: o.id, title: o.title, subtitle: o.accountName ?? o.stage, href: '/crm/leads' });
    for (const qu of quotations)
      if (has(qu.quoteNumber, qu.customerName)) hits.push({ type: 'Quotation', id: qu.id, title: qu.quoteNumber, subtitle: qu.customerName, href: '/crm/quotations' });
    for (const s of suppliers)
      if (has(s.name, s.code)) hits.push({ type: 'Supplier', id: s.id, title: s.name, subtitle: s.code, href: '/procurement/suppliers' });
    for (const s of subcontracts)
      if (has(s.title, s.subcontractorName)) hits.push({ type: 'Subcontract', id: s.id, title: s.title, subtitle: s.subcontractorName, href: '/subcontracts/subcontracts' });
    for (const e of employees) {
      const fullName = `${e.firstName} ${e.lastName}`;
      if (has(fullName, e.email)) hits.push({ type: 'Employee', id: e.id, title: fullName, subtitle: e.department ?? e.role, href: '/hr/control' });
    }
    for (const a of assets)
      if (has(a.name, a.serialNumber)) hits.push({ type: 'Asset', id: a.id, title: a.name, subtitle: a.serialNumber, href: '/assets/control' });

    return hits.slice(0, limit);
  }
}
