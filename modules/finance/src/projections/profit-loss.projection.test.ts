import { describe, expect, it, vi } from 'vitest';
import { ProfitLossProjection } from './profit-loss.projection';
import type { DomainEvent } from '@aura/shared';
import type { PoolClient } from 'pg';

describe('ProfitLossProjection', () => {
  it('correctly routes and inserts revenue vs expense depending on supplier presence', async () => {
    const projection = new ProfitLossProjection();
    const querySpy = vi.fn();
    const mockClient = { query: querySpy } as unknown as PoolClient;

    // 1. Revenue Event: supplier is null
    const revEvent: DomainEvent = {
      id: 'e-rev-1',
      type: 'finance.invoice.approved',
      tenantId: 'tenant-abc',
      companyId: 'company-xyz',
      aggregateType: 'finance.invoice',
      aggregateId: 'inv-100',
      actorId: 'u1',
      occurredAt: '2026-06-15T10:00:00Z',
      version: 1,
      payload: {
        value: 5000,
        supplier: null,
      },
    };

    await projection.handle(revEvent, mockClient);

    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO public.aura_finance_pl_projection'),
      ['tenant-abc', 'company-xyz', '2026-06', 5000, 0]
    );

    // 2. Expense Event: supplier is present
    querySpy.mockClear();
    const expEvent: DomainEvent = {
      id: 'e-exp-1',
      type: 'finance.invoice.paid',
      tenantId: 'tenant-abc',
      companyId: 'company-xyz',
      aggregateType: 'finance.invoice',
      aggregateId: 'inv-101',
      actorId: 'u1',
      occurredAt: '2026-06-18T10:00:00Z',
      version: 1,
      payload: {
        value: 1200,
        supplier: 'Al-Jabr Supply Corp',
      },
    };

    await projection.handle(expEvent, mockClient);

    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO public.aura_finance_pl_projection'),
      ['tenant-abc', 'company-xyz', '2026-06', 0, 1200]
    );
  });
});
