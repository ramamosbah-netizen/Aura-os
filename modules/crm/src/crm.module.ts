import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { CRM_ACCOUNT_STORE } from './account-store';
import { InMemoryAccountStore } from './in-memory-account-store';
import { PostgresAccountStore } from './postgres-account-store';
import { AccountService } from './account.service';

import { CRM_LEAD_STORE } from './lead-store';
import { InMemoryLeadStore } from './in-memory-lead-store';
import { PostgresLeadStore } from './postgres-lead-store';
import { LeadService } from './lead.service';

import { CRM_OPPORTUNITY_STORE } from './opportunity-store';
import { InMemoryOpportunityStore } from './in-memory-opportunity-store';
import { PostgresOpportunityStore } from './postgres-opportunity-store';
import { OpportunityService } from './opportunity.service';

/**
 * The CRM business module. Imports the kernel (CoreModule) for the event store,
 * access platform, and shared pg pool; picks a Postgres or in-memory account store
 * from DATABASE_URL like every kernel substrate. `apps/api` imports this and exposes
 * the controllers. This is the shape every T1 module follows.
 */
@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: CRM_ACCOUNT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresAccountStore(pool) : new InMemoryAccountStore(),
    },
    {
      provide: CRM_LEAD_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresLeadStore(pool) : new InMemoryLeadStore(),
    },
    {
      provide: CRM_OPPORTUNITY_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresOpportunityStore(pool) : new InMemoryOpportunityStore(),
    },
    AccountService,
    LeadService,
    OpportunityService,
  ],
  exports: [AccountService, LeadService, OpportunityService],
})
export class CrmModule {}
