import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import { type PreAwardGovernance, type PreAwardPackageStore, UNGOVERNED } from './pre-award-package-store';

interface Row {
  id: string;
  scope_approved: boolean;
  estimate_approved: boolean;
  pricing_frozen: boolean;
}

export class PostgresPreAwardPackageStore implements PreAwardPackageStore {
  constructor(private readonly pool: Pool) {}

  async governanceForOpportunity(tenantId: Id, opportunityId: Id): Promise<PreAwardGovernance> {
    // One read: the direct package for this opportunity + whether its revisions permit quoting.
    const res = await this.pool.query<Row>(
      `select p.id,
         exists(select 1 from public.aura_crm_estimation_basis_revisions b
                 where b.package_id = p.id and b.status = 'approved')  as scope_approved,
         exists(select 1 from public.aura_crm_estimate_revisions e
                 where e.package_id = p.id and e.status = 'approved')  as estimate_approved,
         exists(select 1 from public.aura_crm_pricing_sheets s
                 where s.package_id = p.id and s.status = 'frozen')    as pricing_frozen
       from public.aura_crm_pre_award_packages p
       where p.tenant_id = $1 and p.opportunity_id = $2::uuid
       limit 1`,
      [tenantId, opportunityId],
    );
    const r = res.rows[0];
    if (!r) return UNGOVERNED;
    return {
      governed: true,
      packageId: r.id,
      scopeApproved: r.scope_approved,
      estimateApproved: r.estimate_approved,
      pricingFrozen: r.pricing_frozen,
    };
  }
}
