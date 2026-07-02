import { describe, it, expect } from 'vitest';
import type { AccountService, OpportunityService, QuotationService } from '@aura/crm';
import type { TenderService } from '@aura/tendering';
import type { ContractService } from '@aura/contracts';
import type { ProjectService } from '@aura/projects';
import type { PurchaseOrderService, SupplierService } from '@aura/procurement';
import type { InvoiceService } from '@aura/finance';
import type { SubcontractsService } from '@aura/subcontracts';
import type { HrService } from '@aura/hr';
import type { AssetsService } from '@aura/assets';
import { SearchService } from './search.service';

const svc = (rows: unknown[]) => ({ list: async () => rows }) as unknown;

function build(over: Partial<Record<string, unknown[]>> = {}) {
  return new SearchService(
    svc(over.accounts ?? []) as AccountService,
    svc(over.tenders ?? []) as TenderService,
    svc(over.contracts ?? []) as ContractService,
    svc(over.projects ?? []) as ProjectService,
    svc(over.pos ?? []) as PurchaseOrderService,
    svc(over.invoices ?? []) as InvoiceService,
    svc(over.opportunities ?? []) as OpportunityService,
    svc(over.quotations ?? []) as QuotationService,
    svc(over.suppliers ?? []) as SupplierService,
    { listSubcontracts: async () => over.subcontracts ?? [] } as unknown as SubcontractsService,
    { listEmployees: async () => over.employees ?? [] } as unknown as HrService,
    { listAssets: async () => over.assets ?? [] } as unknown as AssetsService,
  );
}

describe('SearchService', () => {
  it('returns nothing for a blank query', async () => {
    const s = build({ accounts: [{ id: 'a1', name: 'Acme', status: 'active' }] });
    expect(await s.search('t1', '   ')).toEqual([]);
  });

  it('matches across modules by name/title/reference, tagging the type', async () => {
    const s = build({
      accounts: [{ id: 'a1', name: 'Acme Corp', status: 'active' }],
      tenders: [{ id: 't1', title: 'Acme Tower', reference: 'TND-1', status: 'open' }],
      invoices: [{ id: 'i1', title: 'Other', reference: 'INV-9', supplierName: 'Beta', status: 'draft' }],
    });
    const hits = await s.search('t1', 'acme');
    expect(hits.map((h) => `${h.type}:${h.title}`).sort()).toEqual(['Account:Acme Corp', 'Tender:Acme Tower']);
    expect(hits.find((h) => h.type === 'Tender')?.href).toBe('/tendering/tenders/t1');
  });

  it('matches a purchase order by supplier name', async () => {
    const s = build({ pos: [{ id: 'p1', title: 'Cables', reference: 'PO-1', supplierName: 'Gulf Cables', status: 'issued' }] });
    const hits = await s.search('t1', 'gulf');
    expect(hits).toHaveLength(1);
    expect(hits[0].type).toBe('Purchase Order');
  });

  it('caps the result count', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, name: `Acme ${i}`, status: 'active' }));
    const hits = await build({ accounts: many }).search('t1', 'acme', 20);
    expect(hits).toHaveLength(20);
  });

  it('matches extended entities — employees, suppliers, assets', async () => {
    const s = build({
      employees: [{ id: 'e1', firstName: 'Ahmed', lastName: 'Ali', email: null, department: 'Sales', role: 'Manager' }],
      suppliers: [{ id: 's1', name: 'Ahmed Trading', code: 'SUP-1', status: 'active' }],
      assets: [{ id: 'x1', name: 'Generator', serialNumber: 'GEN-9', status: 'active' }],
    });
    const hits = await s.search('t1', 'ahmed');
    expect(hits.map((h) => h.type).sort()).toEqual(['Employee', 'Supplier']);
    expect(hits.find((h) => h.type === 'Employee')?.title).toBe('Ahmed Ali');
  });
});
