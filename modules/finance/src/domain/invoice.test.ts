import { describe, expect, it } from 'vitest';
import { FINANCE_EVENT, makeInvoice } from './invoice';

describe('finance invoice model', () => {
  it('creates an invoice with sane defaults and trimmed fields', () => {
    const inv = makeInvoice({ tenantId: 't1', title: '  Switchgear supply  ' });
    expect(inv.title).toBe('Switchgear supply');
    expect(inv.status).toBe('draft');
    expect(inv.value).toBe(0);
    expect(inv.reference).toBeNull();
    expect(inv.poId).toBeNull();
    expect(inv.id).toBeTruthy();
    expect(inv.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('carries the PO + supplier + project references down by snapshot', () => {
    const inv = makeInvoice({
      tenantId: 't1',
      title: 'Switchgear supply',
      reference: 'INV-2026-001',
      poId: 'po-9',
      poTitle: 'Switchgear PO',
      supplierName: 'Globex MEP',
      projectId: 'prj-9',
      projectName: 'Metro Depot ELV',
      status: 'approved',
      value: 90000,
    });
    expect(inv.poId).toBe('po-9');
    expect(inv.poTitle).toBe('Switchgear PO');
    expect(inv.supplierName).toBe('Globex MEP');
    expect(inv.projectId).toBe('prj-9');
    expect(inv.projectName).toBe('Metro Depot ELV');
    expect(inv.reference).toBe('INV-2026-001');
    expect(inv.status).toBe('approved');
    expect(inv.value).toBe(90000);
  });

  it('coerces a missing/garbage value to 0', () => {
    expect(makeInvoice({ tenantId: 't1', title: 'X' }).value).toBe(0);
    expect(makeInvoice({ tenantId: 't1', title: 'X', value: Number.NaN }).value).toBe(0);
  });

  it('exposes the spine event type', () => {
    expect(FINANCE_EVENT.invoiceCreated).toBe('finance.invoice.created');
  });
});
