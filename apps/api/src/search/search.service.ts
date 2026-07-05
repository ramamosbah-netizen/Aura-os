import { Injectable } from '@nestjs/common';
import { AccountService, LeadService, OpportunityService } from '@aura/crm';
import { TenderService } from '@aura/tendering';
import { ContractService } from '@aura/contracts';
import { ProjectService } from '@aura/projects';
import { PurchaseOrderService } from '@aura/procurement';
import { InvoiceService } from '@aura/finance';
import { HrService } from '@aura/hr';

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
 * fan-out later without changing callers.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly accounts: AccountService,
    private readonly leads: LeadService,
    private readonly opportunities: OpportunityService,
    private readonly tenders: TenderService,
    private readonly contracts: ContractService,
    private readonly projects: ProjectService,
    private readonly pos: PurchaseOrderService,
    private readonly invoices: InvoiceService,
    private readonly hr: HrService,
  ) {}

  async search(tenantId: string, q: string, limit = 20): Promise<SearchHit[]> {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const has = (...vals: Array<string | null | undefined>): boolean =>
      vals.some((v) => typeof v === 'string' && v.toLowerCase().includes(needle));

    // Each fan-out is defensive: a module that errors or is empty must not sink the
    // whole search. Compose the modules' service APIs in the host (Constitution Law #1).
    const safe = <T>(p: Promise<T[]>): Promise<T[]> => p.catch(() => [] as T[]);
    const [accounts, leads, opportunities, tenders, contracts, projects, pos, invoices, employees] =
      await Promise.all([
        safe(this.accounts.list({ tenantId, limit: 50 })),
        safe(this.leads.list({ tenantId, limit: 50 })),
        safe(this.opportunities.list({ tenantId, limit: 50 })),
        safe(this.tenders.list({ tenantId, limit: 50 })),
        safe(this.contracts.list({ tenantId, limit: 50 })),
        safe(this.projects.list({ tenantId, limit: 50 })),
        safe(this.pos.list({ tenantId, limit: 50 })),
        safe(this.invoices.list({ tenantId, limit: 50 })),
        safe(this.hr.listEmployees(tenantId)),
      ]);

    const hits: SearchHit[] = [];
    for (const a of accounts)
      if (has(a.name)) hits.push({ type: 'Account', id: a.id, title: a.name, subtitle: a.status, href: '/crm/accounts' });
    for (const l of leads)
      if (has(l.name, l.companyName, l.email)) hits.push({ type: 'Lead', id: l.id, title: l.name, subtitle: l.companyName ?? l.status, href: '/crm/leads' });
    for (const o of opportunities)
      if (has(o.title, o.accountName)) hits.push({ type: 'Opportunity', id: o.id, title: o.title, subtitle: o.accountName ?? o.stage, href: '/crm/leads' });
    for (const t of tenders)
      if (has(t.title, t.reference)) hits.push({ type: 'Tender', id: t.id, title: t.title, subtitle: t.reference ?? t.status, href: '/tendering/tenders' });
    for (const c of contracts)
      if (has(c.title, c.reference)) hits.push({ type: 'Contract', id: c.id, title: c.title, subtitle: c.reference ?? c.status, href: '/contracts/contracts' });
    for (const p of projects)
      if (has(p.title, p.reference)) hits.push({ type: 'Project', id: p.id, title: p.title, subtitle: p.reference ?? p.status, href: '/projects/projects' });
    for (const o of pos)
      if (has(o.title, o.reference, o.supplierName)) hits.push({ type: 'Purchase Order', id: o.id, title: o.title, subtitle: o.reference ?? o.supplierName ?? o.status, href: '/procurement/purchase-orders' });
    for (const i of invoices)
      if (has(i.title, i.reference, i.supplierName)) hits.push({ type: 'Invoice', id: i.id, title: i.title, subtitle: i.reference ?? i.supplierName ?? i.status, href: '/finance/invoices' });
    for (const e of employees)
      if (has(e.firstName, e.lastName, e.email, e.department)) hits.push({ type: 'Employee', id: e.id, title: `${e.firstName} ${e.lastName}`, subtitle: e.role || e.department, href: '/hr/control' });

    return hits.slice(0, limit);
  }
}
