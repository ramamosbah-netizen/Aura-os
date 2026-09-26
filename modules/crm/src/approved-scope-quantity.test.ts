import { describe, it, expect, vi } from 'vitest';
import type { AccessService, EventStore } from '@aura/core';
import type { EstimationLineInput } from '@aura/shared';
import { QuotationService } from './quotation.service';
import { InMemoryQuotationStore } from './in-memory-quotation-store';
import { InMemoryCommercialBaselineStore } from './in-memory-commercial-baseline-store';
import { assertSourcedQuantitiesHeld } from './domain/quotation';

/**
 * EST-19 — AWARDED QUANTITY CONTINUITY. An approved-scope line (one carrying `sourceItemId`) holds the
 * quantity the offer was materialised with. Pricing prices it; it does not re-measure it. The frozen
 * criterion: "reject mismatched source quantities; approved change creates traceable revision".
 */
const noopAccess = { assert: () => {}, assertApprovalAuthority: () => {} } as unknown as AccessService;

function harness() {
  const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const svc = new QuotationService(new InMemoryQuotationStore(), new InMemoryCommercialBaselineStore(), events, noopAccess);
  return { svc };
}

const priced = (over: Partial<EstimationLineInput> = {}): EstimationLineInput => ({
  description: '24 IP cameras', unit: 'no', sourceItemId: 'camera-line', quantity: 24,
  materialUnitCost: 100, wastagePercent: 0, labour: { hoursPerUnit: 0, crewSize: 1, hourlyRate: 0 },
  equipmentUnitCost: 0, consumablesUnitCost: 0, subcontractUnitCost: 0,
  overheadPercent: 0, riskPercent: 0, warrantyPercent: 0, contingencyPercent: 0, targetMarginPercent: 20,
  ...over,
} as EstimationLineInput);

/** A governed direct offer as convert-to-quotation materialises it: the approved basis line at 24. */
const governedOffer = (svc: QuotationService) => svc.create({
  tenantId: 't1', quoteNumber: 'QUO-J1', customerName: 'Emaar', issueDate: '2026-09-26',
  lines: [{ description: '24 IP cameras', quantity: 24, unit: 'no', sourceItemId: 'camera-line', unitPrice: 125 }],
});

describe('EST-19 — the rule', () => {
  const held = [{ description: '24 IP cameras', quantity: 24, sourceItemId: 'camera-line' }];

  it('holds a sourced quantity, and lets unsourced lines through', () => {
    expect(() => assertSourcedQuantitiesHeld(held, [{ description: 'cams', quantity: 24, sourceItemId: 'camera-line' }, { description: 'Delivery', quantity: 3 }], 'QUO-J1 Rev 0', { requireAll: true })).not.toThrow();
    expect(() => assertSourcedQuantitiesHeld(held, [{ description: 'cams', quantity: 30, sourceItemId: 'camera-line' }], 'QUO-J1 Rev 0', { requireAll: false }))
      .toThrow(/can only change through a new approved scope revision — QUO-J1 Rev 0 carries 24 from the approved basis, and the pricing asks for 30/);
  });

  it('refuses a repeated, an invented and — when the offer is written — a dropped sourced line', () => {
    expect(() => assertSourcedQuantitiesHeld(held, [
      { description: 'a', quantity: 24, sourceItemId: 'camera-line' }, { description: 'b', quantity: 24, sourceItemId: 'camera-line' },
    ], 'QUO-J1 Rev 0', { requireAll: true })).toThrow(/can only appear once/);
    expect(() => assertSourcedQuantitiesHeld(held, [{ description: 'Rogue', quantity: 5, sourceItemId: 'nvr-line' }], 'QUO-J1 Rev 0', { requireAll: false }))
      .toThrow(/names a source item QUO-J1 Rev 0 was not raised from/);
    expect(() => assertSourcedQuantitiesHeld(held, [{ description: 'Delivery', quantity: 1 }], 'QUO-J1 Rev 0', { requireAll: true }))
      .toThrow(/approved scope can only leave QUO-J1 Rev 0 through a new approved scope revision — the pricing omits "24 IP cameras"/);
    // A draft sheet being built may not have the line YET — only the offer's own write requires it.
    expect(() => assertSourcedQuantitiesHeld(held, [{ description: 'Delivery', quantity: 1 }], 'QUO-J1 Rev 0', { requireAll: false })).not.toThrow();
  });

  it('holds nothing on an offer with no approved scope', () => {
    expect(() => assertSourcedQuantitiesHeld([{ description: 'Manual', quantity: 1, sourceItemId: null }], [{ description: 'Manual', quantity: 9 }], 'QUO-D Rev 0', { requireAll: true })).not.toThrow();
  });
});

describe('EST-19 — the offer and its pricing sheet', () => {
  it('re-prices the approved line at its held quantity', async () => {
    const { svc } = harness();
    const q = await governedOffer(svc);
    const updated = await svc.saveEstimation(q.id, [priced()]);
    expect(updated.lines[0]).toMatchObject({ quantity: 24, sourceItemId: 'camera-line', unitPrice: 125 });
  });

  it('refuses re-measuring it — even when the item omits its source and inherits it by position', async () => {
    const { svc } = harness();
    const q = await governedOffer(svc);
    await expect(svc.saveEstimation(q.id, [priced({ quantity: 30 })])).rejects.toThrow(/carries 24 from the approved basis, and the pricing asks for 30/);
    await expect(svc.saveEstimation(q.id, [priced({ quantity: 30, sourceItemId: undefined })])).rejects.toThrow(/carries 24/);
    expect((await svc.get(q.id))!.lines[0].quantity).toBe(24); // refused, not partially applied
  });

  it('refuses replacing the approved line with another item in its place', async () => {
    const { svc } = harness();
    const q = await governedOffer(svc);
    // An item in the approved line's position inherits its source, so a replacement is judged as a
    // re-measurement of that line. (Leaving a sourced line out entirely is refused by the rule above.)
    await expect(svc.saveEstimation(q.id, [priced({ description: 'Delivery', sourceItemId: undefined, quantity: 1 })]))
      .rejects.toThrow(/the quantity of "24 IP cameras" can only change through a new approved scope revision — QUO-J1 Rev 0 carries 24 from the approved basis, and the pricing asks for 1/);
  });

  it('refuses early, on the sheet — the offer is checked before a sheet is even written', async () => {
    const { svc } = harness();
    const q = await governedOffer(svc);
    await expect(svc.assertPricingHoldsApprovedScope(q.id, [priced({ quantity: 30 })])).rejects.toThrow(/carries 24/);
    await expect(svc.assertPricingHoldsApprovedScope(q.id, [priced()])).resolves.toBeUndefined();
    await expect(svc.assertPricingHoldsApprovedScope(q.id, [])).resolves.toBeUndefined();
  });

  it('leaves an offer with no approved scope free to be measured by its pricing', async () => {
    const { svc } = harness();
    const q = await svc.create({ tenantId: 't1', quoteNumber: 'QUO-D', customerName: 'Emaar', issueDate: '2026-09-26', lines: [{ description: 'Manual', quantity: 1, unitPrice: 10 }] });
    const updated = await svc.saveEstimation(q.id, [priced({ description: 'Manual', sourceItemId: undefined, quantity: 9 })]);
    expect(updated.lines[0].quantity).toBe(9);
  });
});
