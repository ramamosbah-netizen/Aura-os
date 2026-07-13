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

import { CRM_QUOTATION_STORE } from './quotation-store';
import { InMemoryQuotationStore } from './in-memory-quotation-store';
import { PostgresQuotationStore } from './postgres-quotation-store';
import { QuotationService } from './quotation.service';

import { CRM_CONTACT_STORE } from './contact-store';
import { InMemoryContactStore } from './in-memory-contact-store';
import { PostgresContactStore } from './postgres-contact-store';
import { ContactService } from './contact.service';

import { CRM_ACTIVITY_STORE } from './activity-store';
import { InMemoryActivityStore } from './in-memory-activity-store';
import { PostgresActivityStore } from './postgres-activity-store';
import { ActivityService } from './activity.service';

import { LeadConversionService } from './lead-conversion.service';

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
    {
      provide: CRM_QUOTATION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresQuotationStore(pool) : new InMemoryQuotationStore(),
    },
    {
      provide: CRM_CONTACT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresContactStore(pool) : new InMemoryContactStore(),
    },
    {
      provide: CRM_ACTIVITY_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresActivityStore(pool) : new InMemoryActivityStore(),
    },
    AccountService,
    LeadService,
    OpportunityService,
    QuotationService,
    ContactService,
    ActivityService,
    LeadConversionService,
  ],
  exports: [AccountService, LeadService, OpportunityService, QuotationService, ContactService, ActivityService, LeadConversionService],
})
export class CrmModule {}
