import { describe, it, expect, vi } from 'vitest';
import { InMemoryDocumentRequirementStore } from '@aura/core';
import type { EventStore, AccessService, DocumentRequirementStore } from '@aura/core';
import { addEvidence, makeDocumentRequirement } from '@aura/shared';
import { QuotationService } from './quotation.service';
import { InMemoryQuotationStore } from './in-memory-quotation-store';
import { InMemoryCommercialBaselineStore } from './in-memory-commercial-baseline-store';

// Permissive access mock — these tests don't exercise the value-threshold/SoD approval gate.
const noopAccess = { assert: () => {}, assertApprovalAuthority: () => {} } as unknown as AccessService;

function harness(access: AccessService = noopAccess, requirements: DocumentRequirementStore | null = null) {
  const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const baselines = new InMemoryCommercialBaselineStore();
  const store = new InMemoryQuotationStore();
  const svc = new QuotationService(store, baselines, events, access, undefined, undefined, requirements);
  return { svc, baselines, events, store };
}

const newQuote = (svc: QuotationService) => svc.create({
  tenantId: 't1', quoteNumber: 'QT-1', customerName: 'Emaar', accountId: 'a1',
  issueDate: '2026-07-14', lines: [{ description: 'CCTV', quantity: 2, unitPrice: 1000 }], createdBy: 'u1',
});

const pricedQuote = (svc: QuotationService) => svc.create({
  tenantId: 't1', quoteNumber: 'QT-PRICED', customerName: 'Emaar', accountId: 'a1', issueDate: '2026-07-14',
  lines: [{ description: 'CCTV', quantity: 2, unitPrice: 200 }],
  pricing: { lines: [{
    supplyUnitPrice: 100, wastagePercent: 0, accessories: 0,
    technician: { count: 0, hours: 0, rate: 0 }, engineer: { count: 0, hours: 0, rate: 0 },
    projectManager: { count: 0, hours: 0, rate: 0 }, transport: 0, equipmentRent: 0,
    subcontract: 0, otherDirect: 0, indirectPercent: 0,
  }] },
  createdBy: 'u1',
});

describe('QuotationService — commercial governance (R3)', () => {
  it('locks an immutable Commercial Baseline on approval, capturing the approver', async () => {
    const { svc, events } = harness();
    const q = await newQuote(svc);
    expect(await svc.getBaseline('t1', q.id)).toBeNull(); // none before approval

    await svc.changeStatus(q.id, 'approve', 'u-manager');

    const baseline = await svc.getBaseline('t1', q.id);
    expect(baseline).not.toBeNull();
    expect(baseline!.total).toBe(2100);
    expect(baseline!.quotationId).toBe(q.id);
    expect(baseline!.lockedBy).toBe('u-manager');
    // emitted the locked event
    expect((events.append as any).mock.calls.flat(2).some((e: any) => e?.type === 'crm.commercial_baseline.locked')).toBe(true);
  });

  it('refuses self-approval — the preparer cannot approve their own quotation (SoD, P0-3)', async () => {
    const { svc } = harness();
    const q = await newQuote(svc); // createdBy: 'u1'
    // Same user who prepared it tries to approve → 403-shaped "access denied".
    await expect(svc.changeStatus(q.id, 'approve', 'u1')).rejects.toThrow(/access denied/i);
    // No baseline was locked — the action was rejected before any state change.
    expect(await svc.getBaseline('t1', q.id)).toBeNull();
    // A different approver succeeds.
    await svc.changeStatus(q.id, 'approve', 'u-manager');
    expect(await svc.getBaseline('t1', q.id)).not.toBeNull();
  });

  it('cannot send a quotation that was never approved (governance gate)', async () => {
    const { svc } = harness();
    const q = await newQuote(svc);
    await expect(svc.changeStatus(q.id, 'send')).rejects.toThrow('cannot send from status draft');
  });

  it('rejects approval when the actor lacks quotation approval authority', async () => {
    const access = {
      assert: vi.fn(),
      assertApprovalAuthority: vi.fn(() => { throw new Error('access denied: quotation approval authority required'); }),
    } as unknown as AccessService;
    const { svc } = harness(access);
    const q = await newQuote(svc);
    await expect(svc.changeStatus(q.id, 'approve', 'u-sales')).rejects.toThrow(/access denied/i);
    expect((await svc.get(q.id))?.status).toBe('draft');
  });

  it('enforces a persisted evidence checklist at the canonical approval boundary', async () => {
    const requirements = new InMemoryDocumentRequirementStore();
    const { svc } = harness(noopAccess, requirements);
    const q = await newQuote(svc);
    const requirement = makeDocumentRequirement({
      tenantId: 't1', entityType: 'crm.quotation', entityId: q.id, type: 'COMMERCIAL_OFFER', requiredCount: 1,
    });
    await requirements.upsert(requirement);

    await expect(svc.changeStatus(q.id, 'approve', 'u-manager')).rejects.toThrow(/approval blocked/i);
    expect((await svc.get(q.id))?.status).toBe('draft');

    await requirements.upsert(addEvidence(requirement, {
      type: 'MANUAL_CONFIRMATION', reference: 'offer-reviewed', checkedBy: 'u-manager',
    }));
    await svc.changeStatus(q.id, 'approve', 'u-manager');
    expect((await svc.get(q.id))?.status).toBe('approved');
  });

  it('blocks a newly created governed quotation when no checklist exists', async () => {
    const requirements = new InMemoryDocumentRequirementStore();
    const { svc } = harness(noopAccess, requirements);
    const q = await newQuote(svc);

    await expect(svc.changeStatus(q.id, 'approve', 'u-manager'))
      .rejects.toThrow(/readiness checklist is not configured/i);
    expect((await svc.get(q.id))?.status).toBe('draft');
  });

  it('allows only an explicitly legacy quotation to use no-checklist compatibility', async () => {
    const requirements = new InMemoryDocumentRequirementStore();
    const { svc, store } = harness(noopAccess, requirements);
    const q = await newQuote(svc);
    await store.save({ ...q, approvalReadinessMode: 'legacy' });

    await svc.changeStatus(q.id, 'approve', 'u-manager');
    expect((await svc.get(q.id))?.status).toBe('approved');
  });

  it('approval only locks one baseline, and getBaseline is scoped to the tenant', async () => {
    const { svc, baselines } = harness();
    const q = await newQuote(svc);
    await svc.changeStatus(q.id, 'approve', 'u-manager');

    // Exactly one baseline saved for this quotation.
    expect(await baselines.getByQuotation('t1', q.id)).not.toBeNull();
    // A different tenant sees nothing for this quotation id.
    expect(await svc.getBaseline('t2', q.id)).toBeNull();
  });

  it('reconciles Commercial pricing with Quotation 360 and keeps the approved baseline immutable', async () => {
    const { svc, store } = harness();
    const q = await pricedQuote(svc);
    const draft = (await svc.commercialPricingSummary({ tenantId: 't1' })).rows[0];
    expect(draft).toMatchObject({ totalCost: 200, profit: 200, marginPercent: 50, pricingKnown: true });

    await svc.changeStatus(q.id, 'approve', 'u-manager');
    const approved = await svc.get(q.id);
    await store.save({ ...approved!, pricing: { lines: [{
      supplyUnitPrice: 900, wastagePercent: 0, accessories: 0,
      technician: { count: 0, hours: 0, rate: 0 }, engineer: { count: 0, hours: 0, rate: 0 },
      projectManager: { count: 0, hours: 0, rate: 0 }, transport: 0, equipmentRent: 0,
      subcontract: 0, otherDirect: 0, indirectPercent: 0,
    }] } });

    const row = (await svc.commercialPricingSummary({ tenantId: 't1' })).rows.find((r) => r.quotationId === q.id);
    expect(row).toMatchObject({ totalCost: 200, profit: 200, marginPercent: 50, pricingKnown: true });
    expect((await svc.getPricing(q.id)).totalCost).toBe(1800); // mutable record changed; reporting did not
  });

  it('reports missing pricing as unknown rather than zero', async () => {
    const { svc, store } = harness();
    const q = await newQuote(svc);
    await store.save({ ...q, pricing: null });
    const row = (await svc.commercialPricingSummary({ tenantId: 't1' })).rows[0];
    expect(row).toMatchObject({ totalCost: null, profit: null, marginPercent: null, pricingKnown: false });
  });

  it('preserves accepted status and frozen pricing lineage in the commercial summary', async () => {
    const { svc } = harness();
    const q = await pricedQuote(svc);
    await svc.changeStatus(q.id, 'approve', 'u-manager');
    await svc.changeStatus(q.id, 'send');
    await svc.changeStatus(q.id, 'accept');

    const row = (await svc.commercialPricingSummary({ tenantId: 't1' })).rows[0];
    expect(row).toMatchObject({
      quotationId: q.id,
      status: 'accepted',
      total: q.total,
      totalCost: 200,
      profit: 200,
      marginPercent: 50,
      pricingKnown: true,
    });
  });

  it('keeps the Commercial summary tenant-scoped and bounded', async () => {
    const { svc, store } = harness();
    await pricedQuote(svc);
    await svc.create({
      tenantId: 't2', quoteNumber: 'QT-OTHER', customerName: 'Other', issueDate: '2026-07-14',
      lines: [{ description: 'CCTV', quantity: 1, unitPrice: 10 }],
    });
    const list = vi.spyOn(store, 'list');

    const rows = await svc.commercialPricingSummary({ tenantId: 't1' });
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].quoteNumber).toBe('QT-PRICED');
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', limit: 500 }));
  });

  it('writes approval, baseline, and outbox events through one transaction handle', async () => {
    const store = new InMemoryQuotationStore();
    const baselines = new InMemoryCommercialBaselineStore();
    const events = {
      append: vi.fn().mockResolvedValue(undefined),
      appendWithClient: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventStore;
    const tx = { run: vi.fn(async (fn: (handle: unknown) => Promise<unknown>) => fn('tx-handle')) };
    const storeSave = vi.spyOn(store, 'saveWithClient');
    const baselineSave = vi.spyOn(baselines, 'saveWithClient');
    const svc = new QuotationService(store, baselines, events, noopAccess, null, tx as never);
    const q = await newQuote(svc);
    // Creation is transactional too; isolate the approval transaction this assertion covers.
    tx.run.mockClear();
    storeSave.mockClear();
    baselineSave.mockClear();
    (events.appendWithClient as ReturnType<typeof vi.fn>).mockClear();

    await svc.changeStatus(q.id, 'approve', 'u-manager');

    expect(tx.run).toHaveBeenCalledTimes(1);
    expect(storeSave).toHaveBeenCalledWith('tx-handle', expect.objectContaining({ status: 'approved' }));
    expect(baselineSave).toHaveBeenCalledWith('tx-handle', expect.objectContaining({ quotationId: q.id }));
    expect((events.appendWithClient as any).mock.calls[0][0]).toBe('tx-handle');
  });
});

describe('QuotationService.listRevisions — the chain is links, not the number', () => {
  const quote = (svc: QuotationService, quoteNumber: string) => svc.create({
    tenantId: 't1', quoteNumber, customerName: 'Emaar', accountId: 'a1', issueDate: '2026-07-14',
    lines: [{ description: 'CCTV', quantity: 2, unitPrice: 1000 }], createdBy: 'u1',
  });

  it('follows parentQuotationId, oldest revision first', async () => {
    const { svc } = harness();
    const r0 = await quote(svc, 'QT-9');
    await svc.changeStatus(r0.id, 'approve', 'u-manager');
    await svc.changeStatus(r0.id, 'send');
    const r1 = await svc.revise(r0.id);

    const chain = await svc.listRevisions('t1', r0.id);
    expect(chain.map((q) => q.revision)).toEqual([0, 1]);
    expect(chain[1].id).toBe(r1.id);
    // Reachable from either end — a chain read from the newest revision is the same chain.
    expect((await svc.listRevisions('t1', r1.id)).map((q) => q.id)).toEqual(chain.map((q) => q.id));
  });

  // The live defect this rule exists for: quoting one opportunity twice yields two independent
  // quotes sharing a derived number, both at revision 0. Returning them as a revision history
  // invents a price change between two unrelated quotes.
  it('does NOT treat two separate quotes sharing a number as revisions of each other', async () => {
    const { svc } = harness();
    const a = await quote(svc, 'QT-OPP-947e5807');
    const b = await quote(svc, 'QT-OPP-947e5807');

    expect(await svc.listRevisions('t1', a.id)).toHaveLength(1);
    expect((await svc.listRevisions('t1', a.id))[0].id).toBe(a.id);
    expect((await svc.listRevisions('t1', b.id))[0].id).toBe(b.id);
  });

  it('still returns a number-matched chain whose links were never written', async () => {
    const { svc } = harness();
    const store = new InMemoryQuotationStore();
    const svc2 = new QuotationService(store, new InMemoryCommercialBaselineStore(),
      { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore, noopAccess);
    const r0 = await quote(svc2, 'QT-LEGACY');
    // A revision 1 with no parent link — legacy data, but distinct revision numbers prove it is
    // one chain rather than two quotes.
    await store.save({ ...r0, id: 'legacy-r1', revision: 1, parentQuotationId: null });

    expect((await svc2.listRevisions('t1', r0.id)).map((q) => q.revision)).toEqual([0, 1]);
  });

  it('returns nothing for a quotation that does not exist', async () => {
    const { svc } = harness();
    expect(await svc.listRevisions('t1', 'nope')).toEqual([]);
  });

  it('restarts validity and records the revising actor when the old window has elapsed', async () => {
    const { svc } = harness();
    const r0 = await quote(svc, 'QT-EXPIRED');
    await svc.changeStatus(r0.id, 'approve', 'u-manager');
    await svc.changeStatus(r0.id, 'send');
    const r1 = await svc.revise(r0.id, 'u-reviser');

    expect(r1.createdBy).toBe('u-reviser');
    expect(r1.validUntil).not.toBeNull();
    expect(r1.validUntil! >= r1.issueDate).toBe(true);
  });

  it('does not disclose a foreign-tenant quotation revision chain', async () => {
    const { svc } = harness();
    const foreign = await svc.create({
      tenantId: 't2', quoteNumber: 'QT-CROSS-TENANT', customerName: 'Private customer', accountId: 'a2',
      issueDate: '2026-07-14', lines: [{ description: 'CCTV', quantity: 1, unitPrice: 1000 }], createdBy: 'u2',
    });

    // A known id from another tenant must be indistinguishable from an absent quotation.
    expect(await svc.listRevisions('t1', foreign.id)).toEqual([]);
  });
});

describe('QuotationService.updateCommercialTerms — editable only while worked up', () => {
  const withTerms = (svc: QuotationService) => svc.create({
    tenantId: 't1', quoteNumber: 'QT-T', customerName: 'Emaar', accountId: 'a1', issueDate: '2026-07-14',
    lines: [{ description: 'CCTV', quantity: 2, unitPrice: 1000 }], createdBy: 'u1',
  });

  it('edits exclusions and payment on a draft, leaving untouched fields alone', async () => {
    const { svc } = harness();
    const q = await withTerms(svc);
    const updated = await svc.updateCommercialTerms(q.id, { exclusions: ['VAT', 'vat', 'Permits'], paymentConditions: '50/50' });
    expect(updated.exclusions).toEqual(['VAT', 'Permits']); // normalised
    expect(updated.paymentConditions).toBe('50/50');
    expect(updated.deliveryTerms).toBeNull(); // not passed → unchanged
  });

  it('records a before→after diff + actor on the audit event (P1-2)', async () => {
    const { svc, events } = harness();
    const q = await withTerms(svc);
    await svc.updateCommercialTerms(q.id, { paymentConditions: '50/50' });
    const appended = (events.append as any).mock.calls.flat(2);
    const evt = appended.find((e: any) => e?.payload?.field === 'commercial_terms');
    expect(evt.payload.changes.paymentConditions).toEqual({ from: null, to: '50/50' });
    expect(evt.payload.changes.terms).toBeUndefined(); // untouched field is not in the diff
    expect(evt.actorId).toBe('u1'); // falls back to createdBy when no request context is bound
  });

  it('refuses once approved — a 409-shaped "only … can" message, not "cannot"', async () => {
    const { svc } = harness();
    const q = await withTerms(svc);
    await svc.changeStatus(q.id, 'approve', 'u-manager');
    await expect(svc.updateCommercialTerms(q.id, { exclusions: ['too late'] })).rejects.toThrow(/only .* can .* edited/);
  });

  it('keeps approval lock distinct from issued-revision immutability and revises after issue', async () => {
    const { svc } = harness();
    const q = await withTerms(svc);

    // Approval establishes readiness and locks governed commercial fields on this revision.
    await svc.changeStatus(q.id, 'approve', 'u-manager');
    await expect(svc.updateCommercialTerms(q.id, { paymentConditions: 'too late at approval' }))
      .rejects.toThrow(/only .* can .* edited/);

    // External issue is the customer-facing freeze boundary; it does not mutate the old record.
    await svc.changeStatus(q.id, 'send');
    await expect(svc.updateCommercialTerms(q.id, { paymentConditions: 'must stay immutable' }))
      .rejects.toThrow(/only .* can .* edited/);
    expect((await svc.get(q.id))?.status).toBe('sent');

    // A post-issue change is represented by a new draft revision, not an in-place edit.
    const next = await svc.revise(q.id, 'u-reviser');
    expect(next).toMatchObject({ revision: q.revision + 1, parentQuotationId: q.id, status: 'draft' });
    expect((await svc.get(q.id))?.status).toBe('revised');
    const updated = await svc.updateCommercialTerms(next.id, { paymentConditions: 'new negotiated terms' });
    expect(updated.paymentConditions).toBe('new negotiated terms');
    expect((await svc.get(q.id))?.paymentConditions).toBeNull();
  });
});
