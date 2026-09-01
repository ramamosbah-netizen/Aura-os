import { describe, expect, it, vi } from 'vitest';
import { CostLedgerService } from './cost-ledger.service';
import { InMemoryCostLedgerStore } from './in-memory-cost-ledger-store';
import { ledgerTotals } from './domain/cost-transaction';

describe('B6 cost semantics', () => {
  it('keeps budget, commitment and actual totals separate', () => {
    expect(ledgerTotals([
      { type: 'budget', amount: 100, id: 'b', tenantId: 't', companyId: null, projectId: 'p', cbsNodeId: null, wbsNodeId: null, source: 'variation', quantity: null, sourceRef: null, dimensions: null, dedupeKey: null, occurredAt: '', createdAt: '', createdBy: null },
      { type: 'committed', amount: 40, id: 'c', tenantId: 't', companyId: null, projectId: 'p', cbsNodeId: null, wbsNodeId: null, source: 'po', quantity: null, sourceRef: null, dimensions: null, dedupeKey: null, occurredAt: '', createdAt: '', createdBy: null },
      { type: 'actual', amount: 25, id: 'a', tenantId: 't', companyId: null, projectId: 'p', cbsNodeId: null, wbsNodeId: null, source: 'labour_timesheet', quantity: null, sourceRef: null, dimensions: null, dedupeKey: null, occurredAt: '', createdAt: '', createdBy: null },
    ])).toEqual({ budget: 100, committed: 40, actual: 25 });
  });

  it('captures same-currency provenance deterministically', async () => {
    const cbs = { list: vi.fn(async () => []), reconcileActualProjection: vi.fn() } as any;
    const svc = new CostLedgerService(new InMemoryCostLedgerStore(), cbs);
    const row = await svc.post({
      tenantId: 't', companyId: null, projectId: 'p', type: 'actual', amount: 100,
      source: 'labour_timesheet', sourceCurrency: 'AED', baseCurrency: 'AED', dedupeKey: 'x',
    });
    expect(row).toMatchObject({ sourceAmount: 100, sourceCurrency: 'AED', exchangeRate: 1, baseAmount: 100, baseCurrency: 'AED' });
  });

  it('rejects cross-currency actuals without valid FX provenance', async () => {
    const cbs = { list: vi.fn(async () => []), reconcileActualProjection: vi.fn() } as any;
    const svc = new CostLedgerService(new InMemoryCostLedgerStore(), cbs);
    await expect(svc.post({
      tenantId: 't', projectId: 'p', type: 'actual', amount: 100,
      source: 'material_issue', sourceCurrency: 'USD', baseCurrency: 'AED', dedupeKey: 'fx-missing',
    })).rejects.toThrow('valid FX provenance required');
  });

  it('reconciles projections from canonical ledger facts after a dedupe replay', async () => {
    const cbs = {
      list: vi.fn(async () => [{ id: 'cbs-1', projectId: 'p', actualAmount: 0 }]),
      reconcileActualProjection: vi.fn(async () => undefined),
    } as any;
    const svc = new CostLedgerService(new InMemoryCostLedgerStore(), cbs);
    const input = { tenantId: 't', projectId: 'p', cbsNodeId: 'cbs-1', type: 'actual' as const, amount: 125, source: 'plant_usage' as const, dedupeKey: 'plant:e1' };
    await svc.post(input);
    await svc.post(input);
    expect(cbs.reconcileActualProjection).toHaveBeenCalledTimes(2);
    expect(cbs.reconcileActualProjection).toHaveBeenLastCalledWith('cbs-1', 125);
  });

  it('retries projection after a ledger commit without duplicating the canonical fact', async () => {
    const store = new InMemoryCostLedgerStore();
    let attempts = 0;
    const cbs = {
      list: vi.fn(async () => [{ id: 'cbs-1', projectId: 'p', actualAmount: 0 }]),
      reconcileActualProjection: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('projection unavailable');
      }),
    } as any;
    const svc = new CostLedgerService(store, cbs);
    const input = { tenantId: 't', projectId: 'p', cbsNodeId: 'cbs-1', type: 'actual' as const, amount: 10, source: 'plant_usage' as const, dedupeKey: 'plant:retry' };

    await expect(svc.post(input)).rejects.toThrow('projection unavailable');
    await expect(svc.post(input)).resolves.toMatchObject({ dedupeKey: 'plant:retry' });
    expect(await store.list({ tenantId: 't' })).toHaveLength(1);
    expect(cbs.reconcileActualProjection).toHaveBeenCalledTimes(2);
  });

  it('rejects a conflicting replay for an existing dedupe identity', async () => {
    const svc = new CostLedgerService(new InMemoryCostLedgerStore(), { list: vi.fn(async () => []), reconcileActualProjection: vi.fn() } as any);
    const input = { tenantId: 't', projectId: 'p', cbsNodeId: 'cbs-1', type: 'actual' as const, amount: 10, source: 'plant_usage' as const, dedupeKey: 'plant:conflict' };
    await svc.post(input);
    await expect(svc.post({ ...input, amount: 11 })).rejects.toThrow('dedupe conflict');
  });
});
