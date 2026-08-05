import { describe, it, expect } from 'vitest';
import { evaluateContractCap } from './contract-cap';

const snap = (contractValue: number, netCertifiedToDate: number | null = null) => ({
  contractExists: true,
  contractValue,
  netCertifiedToDate,
});

describe('evaluateContractCap — the AR billing cap (G-08)', () => {
  it('allows an invoice inside both bounds', () => {
    const r = evaluateContractCap({ snapshot: snap(1_000_000, 500_000), alreadyInvoiced: 0, newInvoiceTotal: 450_000 });
    expect(r.withinCap).toBe(true);
  });

  it('refuses billing above the contract value', () => {
    const r = evaluateContractCap({ snapshot: snap(1_000_000), alreadyInvoiced: 900_000, newInvoiceTotal: 200_000 });
    expect(r.withinCap).toBe(false);
    expect(r.reason).toContain('1100000');
    expect(r.reason).toContain('variation');
  });

  it('refuses billing ahead of certified work', () => {
    const r = evaluateContractCap({ snapshot: snap(1_000_000, 400_000), alreadyInvoiced: 0, newInvoiceTotal: 450_000 });
    expect(r.withinCap).toBe(false);
    expect(r.reason).toContain('certified');
  });

  it('is cumulative — two invoices that each fit but together do not are refused', () => {
    const first = evaluateContractCap({ snapshot: snap(100_000), alreadyInvoiced: 0, newInvoiceTotal: 60_000 });
    expect(first.withinCap).toBe(true);
    const second = evaluateContractCap({ snapshot: snap(100_000), alreadyInvoiced: 60_000, newInvoiceTotal: 60_000 });
    expect(second.withinCap).toBe(false);
  });

  it('skips the certified bound when the contract has no certificates', () => {
    const r = evaluateContractCap({ snapshot: snap(1_000_000, null), alreadyInvoiced: 0, newInvoiceTotal: 750_000 });
    expect(r.withinCap).toBe(true);
  });

  it('skips entirely when the ref names no contract (AMC / ad-hoc invoices)', () => {
    const r = evaluateContractCap({
      snapshot: { contractExists: false, contractValue: 0, netCertifiedToDate: null },
      alreadyInvoiced: 0,
      newInvoiceTotal: 999_999,
    });
    expect(r.withinCap).toBe(true);
  });

  it('allows a final invoice that exactly closes out the contract', () => {
    const r = evaluateContractCap({ snapshot: snap(1_000_000, 1_000_000), alreadyInvoiced: 750_000, newInvoiceTotal: 250_000 });
    expect(r.withinCap).toBe(true);
  });

  it('tolerates sub-fils rounding drift rather than refusing a legitimate close-out', () => {
    const r = evaluateContractCap({ snapshot: snap(1_000_000, 1_000_000), alreadyInvoiced: 750_000, newInvoiceTotal: 250_000.004 });
    expect(r.withinCap).toBe(true);
  });

  it('still refuses a real overrun just above the tolerance', () => {
    const r = evaluateContractCap({ snapshot: snap(1_000_000), alreadyInvoiced: 1_000_000, newInvoiceTotal: 1 });
    expect(r.withinCap).toBe(false);
  });

  // Regression: every figure here is VAT-EXCLUSIVE. Feeding a VAT-inclusive invoice total in
  // would refuse the auto-invoice raised from a certified IPC by exactly the tax — the caller
  // must pass the subtotal. This is the shape of the deal chain's own numbers.
  it('passes the IPC auto-invoice: 450k certified net billed on a 1.575M contract', () => {
    const netOfVat = 450_000; // the invoice's subtotal; its total would be 472,500 with 5% VAT
    const r = evaluateContractCap({
      snapshot: snap(1_575_000, 450_000),
      alreadyInvoiced: 0,
      newInvoiceTotal: netOfVat,
    });
    expect(r.withinCap).toBe(true);
  });
});
