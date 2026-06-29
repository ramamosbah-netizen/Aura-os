import { Injectable } from '@nestjs/common';
import { AccountService } from '@aura/crm';
import { TenderService } from '@aura/tendering';
import { ContractService } from '@aura/contracts';
import { ProjectService } from '@aura/projects';
import { PurchaseOrderService } from '@aura/procurement';
import { InvoiceService } from '@aura/finance';

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
    private readonly tenders: TenderService,
    private readonly contracts: ContractService,
    private readonly projects: ProjectService,
    private readonly pos: PurchaseOrderService,
    private readonly invoices: InvoiceService,
  ) {}

  async search(tenantId: string, q: string, limit = 20): Promise<SearchHit[]> {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const has = (...vals: Array<string | null | undefined>): boolean =>
      vals.some((v) => typeof v === 'string' && v.toLowerCase().includes(needle));

    const [accounts, tenders, contracts, projects, pos, invoices] = await Promise.all([
      this.accounts.list({ tenantId, limit: 50 }),
      this.tenders.list({ tenantId, limit: 50 }),
      this.contracts.list({ tenantId, limit: 50 }),
      this.projects.list({ tenantId, limit: 50 }),
      this.pos.list({ tenantId, limit: 50 }),
      this.invoices.list({ tenantId, limit: 50 }),
    ]);

    const hits: SearchHit[] = [];
    for (const a of accounts)
      if (has(a.name)) hits.push({ type: 'Account', id: a.id, title: a.name, subtitle: a.status, href: '/crm/accounts' });
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

    return hits.slice(0, limit);
  }
}
