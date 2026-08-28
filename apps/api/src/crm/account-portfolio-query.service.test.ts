import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { AccountPortfolioQueryService } from './account-portfolio-query.service';

describe('AccountPortfolioQueryService', () => {
  it('returns a bounded page and server-owned summary', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        id: 'a1', name: 'Falcon', status: 'prospect', party_type: 'end_client', industry: 'Facilities', owner_id: 'u1',
        phone: null, email: null, source: null, payment_terms: null, website: null, billing_address: null,
        created_at: new Date('2026-01-01T00:00:00Z'), active_deals: '2', pipeline_value: '125000', open_tenders: '1',
        quotations: '3', contracts: '1', active_contracts: '1', contracted_value: '90000', active_projects: '1',
        live_projects: '1', outstanding_ar: '4000', overdue_ar: '500', last_activity_at: new Date('2026-01-02T00:00:00Z'),
      }] })
      .mockResolvedValueOnce({ rows: [{ count: '8' }] })
      .mockResolvedValueOnce({ rows: [{ total_accounts: '8', active_customers: '3', strategic_accounts: '1', at_risk_accounts: '2', total_pipeline: '500000', outstanding_ar: '12000' }] });

    const result = await new AccountPortfolioQueryService({ query } as unknown as Pool).page(
      'tenant-1', { search: 'falcon', status: 'prospect', ownerId: 'u1' }, { limit: 1, offset: 0 },
    );

    expect(result).toMatchObject({ total: 8, limit: 1, offset: 0, hasMore: true });
    expect(result.items[0]).toMatchObject({ id: 'a1', activeDeals: 2, pipelineValue: 125000, overdueAR: 500 });
    expect(result.summary).toEqual({ totalAccounts: 8, activeCustomers: 3, strategicAccounts: 1, atRiskAccounts: 2, totalPipeline: 500000, outstandingAR: 12000 });
    expect(query).toHaveBeenCalledTimes(3);
  });
});
