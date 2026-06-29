import type { Projection } from '@aura/core';
import type { DomainEvent } from '@aura/shared';
import type { PoolClient } from 'pg';

export class ProfitLossProjection implements Projection {
  readonly name = 'finance.profit-loss';
  readonly version = 1;

  async handle(event: DomainEvent, client: PoolClient | null): Promise<void> {
    if (!client) return;

    if (
      event.type !== 'finance.invoice.approved' &&
      event.type !== 'finance.invoice.paid'
    ) {
      return;
    }

    const { tenantId, companyId, occurredAt, payload } = event;
    const value = Number(payload.value || 0);
    const supplier = payload.supplier;

    // Period month (e.g. "2026-06")
    const dateStr = occurredAt || new Date().toISOString();
    const periodMonth = dateStr.substring(0, 7);

    const isExpense = !!supplier;
    const revenueDiff = isExpense ? 0 : value;
    const expenseDiff = isExpense ? value : 0;

    await client.query(
      `INSERT INTO public.aura_finance_pl_projection (tenant_id, company_id, period_month, revenue, expense, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (tenant_id, period_month)
       DO UPDATE SET 
         revenue = public.aura_finance_pl_projection.revenue + EXCLUDED.revenue,
         expense = public.aura_finance_pl_projection.expense + EXCLUDED.expense,
         updated_at = now()`,
      [tenantId, companyId, periodMonth, revenueDiff, expenseDiff]
    );
  }

  async reset(client: PoolClient | null): Promise<void> {
    if (!client) return;
    await client.query('TRUNCATE public.aura_finance_pl_projection CASCADE');
  }
}
