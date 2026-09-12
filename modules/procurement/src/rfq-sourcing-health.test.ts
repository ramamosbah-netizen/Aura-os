import { describe, expect, it, vi } from 'vitest';
import { RfqService } from './rfq.service';
import type { Rfq } from './domain/rfq';

/**
 * §24-Procurement — what the sourcing signal will and will not claim.
 *
 * Procurement can prove exactly one thing: an RFQ is past the date Procurement itself set for it
 * and is still out. These tests pin that claim at its edges, because every edge is a place the
 * signal could quietly start asserting something the data does not support.
 *
 * What it must never claim is delivery. Nothing in this module records a required-on-site date, a
 * promised or expected delivery, a lead time or a long-lead flag — so `procurement-delivery-exposure`
 * reports UNKNOWN, and nothing here is allowed to answer that question on its behalf.
 */

const TODAY = '2026-09-08';
const tenantId = 't1';
const projectId = 'p1';

const rfq = (over: Partial<Rfq>): Rfq => ({
  id: 'r1',
  tenantId,
  companyId: null,
  reference: 'RFQ-001',
  title: 'CCTV cameras',
  prId: 'pr1',
  prTitle: 'CCTV material',
  status: 'sent',
  dueDate: '2026-09-01',
  ownerId: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  createdBy: null,
  ...over,
});

/**
 * The stubs resolve the way the real stores do (TC-GATE-19).
 *
 * The signal used to read `list({ tenantId })` from both stores and filter the results here. Both
 * of those reads stop at a hundred rows in Postgres and at NO rows in memory, so this suite could
 * never have shown the truncation — it now asks each store the targeted question instead, and
 * these stubs answer it from the same fixtures.
 */
function build(rfqs: Rfq[], requests: Array<{ id: string; projectId: string | null }> = [{ id: 'pr1', projectId }]) {
  return new RfqService(
    {
      list: async () => rfqs,
      listByPrIds: async (_t: string, prIds: readonly string[]) =>
        rfqs.filter((r) => r.prId !== null && prIds.includes(r.prId)),
    } as never,
    { append: vi.fn(), appendWithClient: vi.fn() } as never,
    { assert: vi.fn() } as never,
    null,
    {
      list: async () => requests,
      listIdsForProject: async (_t: string, p: string) =>
        requests.filter((r) => r.projectId === p).map((r) => r.id),
    } as never,
  );
}

const assess = (rfqs: Rfq[], requests?: Array<{ id: string; projectId: string | null }>) =>
  build(rfqs, requests).readProjectProcurementSourcingReadiness(tenantId, projectId, TODAY);

describe('procurement sourcing readiness', () => {
  it('reports a dated RFQ that is out and past its deadline', async () => {
    const v = await assess([rfq({ dueDate: '2026-09-01', status: 'sent' })]);
    expect(v.state).toBe('WATCH');
    expect(v.reason).toMatch(/past the quote deadline/);
    expect(v.measure).toEqual({ value: 1 });
  });

  it('says nothing about delivery, only about the deadline Procurement set', async () => {
    // The sentence is the contract. "Material is late" would be a claim about a need date that
    // does not exist in this module, and a reader who saw it would act on it.
    const v = await assess([rfq({})]);
    expect(v.reason).not.toMatch(/deliver|material|late to site|arrive/i);
  });

  it('does not treat an RFQ inside its deadline as overdue', async () => {
    const v = await assess([rfq({ dueDate: '2026-12-31' })]);
    expect(v.state).toBe('CLEAR');
  });

  it('invents no deadline for an RFQ that never had one', async () => {
    // An undated RFQ cannot be late — there is nothing to be late against. It is not evidence of
    // health either way, and CLEAR here means "no DATED RFQ is overdue", not "sourcing is on time".
    const v = await assess([rfq({ dueDate: null })]);
    expect(v.state).toBe('CLEAR');
  });

  it('raises no phantom concern from an awarded RFQ whose date passed long ago', async () => {
    // `sent` is what proves it is still outstanding. Counting finished business would produce a
    // concern that never clears — the trap the drawing-submission lineage was checked against.
    for (const status of ['awarded', 'closed', 'draft'] as const) {
      const v = await assess([rfq({ status, dueDate: '2020-01-01' })]);
      expect(v.state, status).toBe('CLEAR');
    }
  });

  it('counts only RFQs raised for THIS project', async () => {
    const v = await assess(
      [rfq({ id: 'mine', prId: 'pr1' }), rfq({ id: 'theirs', prId: 'pr2' })],
      [{ id: 'pr1', projectId }, { id: 'pr2', projectId: 'other-project' }],
    );
    expect(v.measure).toEqual({ value: 1 });
  });

  it('ignores an RFQ with no request behind it, rather than guessing whose it is', async () => {
    // An RFQ reaches a project only through `prId → PR.projectId`, and `prId` is nullable. One
    // without a request belongs to no project and is evidence about none.
    const v = await assess([rfq({ prId: null })]);
    expect(v.state).toBe('CLEAR');
  });

  it('reports UNKNOWN rather than CLEAR when the request register cannot be read', async () => {
    // Without it there is no way to tell whose RFQ this is, and "no overdue RFQs for this project"
    // would be a claim made with no ability to check it.
    const service = new RfqService(
      { list: async () => [rfq({})] } as never,
      { append: vi.fn(), appendWithClient: vi.fn() } as never,
      { assert: vi.fn() } as never,
      null,
      null,
    );
    const v = await service.readProjectProcurementSourcingReadiness(tenantId, projectId, TODAY);
    expect(v).toMatchObject({ state: 'UNKNOWN', cause: 'PROVIDER_UNAVAILABLE' });
  });

  it('uses one level for every overdue RFQ, because Procurement declares no thresholds', async () => {
    // One day and eleven years report identically. Procurement has no rule distinguishing them, so
    // inventing a gradient here would be Projects deciding what Procurement means by "very late".
    const barely = await assess([rfq({ dueDate: '2026-09-07' })]);
    const ancient = await assess([rfq({ dueDate: '2015-01-01' })]);
    expect(barely.state).toBe(ancient.state);
    expect(barely.state).toBe('WATCH');
  });
});
