import { describe, it, expect } from 'vitest';
import type { AccountService, LeadService, OpportunityService, QuotationService } from '@aura/crm';
import type { TenderService } from '@aura/tendering';
import type { ContractService } from '@aura/contracts';
import type { ProjectService } from '@aura/projects';
import type { PurchaseOrderService, SupplierService } from '@aura/procurement';
import type { InvoiceService } from '@aura/finance';
import type { SubcontractsService } from '@aura/subcontracts';
import type { HrService } from '@aura/hr';
import type { AssetsService } from '@aura/assets';
import type { StockService, SerialService } from '@aura/inventory';
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
    svc(over.leads ?? []) as LeadService,
    { listItems: async () => over.stockItems ?? [] } as unknown as StockService,
    { list: async () => over.serials ?? [] } as unknown as SerialService,
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

  it('matches a lead by name', async () => {
    const s = build({ leads: [{ id: 'l1', name: 'Ahmed Al Mansouri', companyName: 'Emaar', email: 'a@e.com', status: 'new' }] });
    const hits = await s.search('t1', 'ahmed');
    expect(hits).toHaveLength(1);
    expect(hits[0].type).toBe('Lead');
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

  it('the ELV lookup — finds a model across the inventory catalog AND installed serials (P1-3)', async () => {
    const s = build({
      stockItems: [{ id: 'sk1', code: 'CAM-DS2CD1143', name: 'Hikvision DS-2CD1143 4MP Dome', barcode: '69001234', warehouse: 'Main' }],
      serials: [
        { id: 'sn1', serialNumber: 'DS2CD1143-A17', itemCode: 'CAM-DS2CD1143', itemName: 'Hikvision DS-2CD1143', projectName: 'Marina Tower', status: 'installed' },
        { id: 'sn2', serialNumber: 'OTHER-1', itemCode: 'CBL-2.5', itemName: '2.5mm Cable', projectName: null, status: 'in_stock' },
      ],
    });
    const hits = await s.search('t1', 'ds-2cd1143');
    // the SKU and the one matching installed unit; the unrelated cable serial is excluded.
    expect(hits.map((h) => h.type).sort()).toEqual(['Serial', 'Stock Item']);
    expect(hits.find((h) => h.type === 'Serial')?.title).toBe('Hikvision DS-2CD1143 — DS2CD1143-A17');
    expect(hits.find((h) => h.type === 'Serial')?.subtitle).toBe('Marina Tower');
    expect(hits.find((h) => h.type === 'Stock Item')?.href).toBe('/inventory/stock');
  });

  it('finds an installed unit by its exact serial number', async () => {
    const s = build({ serials: [{ id: 'sn1', serialNumber: 'DS2CD1143-A17', itemCode: 'CAM', itemName: 'Camera', projectName: 'Marina Tower', status: 'installed' }] });
    const hits = await s.search('t1', 'a17');
    expect(hits).toHaveLength(1);
    expect(hits[0].type).toBe('Serial');
    expect(hits[0].href).toBe('/inventory/serials');
  });
});
