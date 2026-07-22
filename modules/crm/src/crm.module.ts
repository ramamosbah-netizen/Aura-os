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
import { CRM_MARKET_ITEM_STORE } from './market-item-store';
import { InMemoryMarketItemStore } from './in-memory-market-item-store';
import { PostgresMarketItemStore } from './postgres-market-item-store';
import { MarketItemService } from './market-item.service';
import { InMemoryQuotationStore } from './in-memory-quotation-store';
import { PostgresQuotationStore } from './postgres-quotation-store';
import { QuotationService } from './quotation.service';
import { CRM_COMMERCIAL_BASELINE_STORE } from './commercial-baseline-store';
import { InMemoryCommercialBaselineStore } from './in-memory-commercial-baseline-store';
import { PostgresCommercialBaselineStore } from './postgres-commercial-baseline-store';
import { CRM_PRE_AWARD_STORE } from './pre-award-store';
import { InMemoryPreAwardStore } from './in-memory-pre-award-store';
import { PostgresPreAwardStore } from './postgres-pre-award-store';
import { PreAwardService } from './pre-award.service';

import { CRM_CONTACT_STORE } from './contact-store';
import { InMemoryContactStore } from './in-memory-contact-store';
import { PostgresContactStore } from './postgres-contact-store';
import { ContactService } from './contact.service';

import { CRM_ACTIVITY_STORE } from './activity-store';
import { InMemoryActivityStore } from './in-memory-activity-store';
import { PostgresActivityStore } from './postgres-activity-store';
import { ActivityService } from './activity.service';

import { CRM_SIGNAL_STORE } from './signal-store';
import { InMemorySignalStore } from './in-memory-signal-store';
import { PostgresSignalStore } from './postgres-signal-store';
import { SignalService } from './signal.service';

import { CRM_OPPORTUNITY_DEPTH_STORE } from './opportunity-depth-store';
import { InMemoryOpportunityDepthStore } from './in-memory-opportunity-depth-store';
import { PostgresOpportunityDepthStore } from './postgres-opportunity-depth-store';
import { OpportunityDepthService } from './opportunity-depth.service';

import { CRM_FORECAST_SNAPSHOT_STORE } from './forecast-snapshot-store';
import { InMemoryForecastSnapshotStore } from './in-memory-forecast-snapshot-store';
import { PostgresForecastSnapshotStore } from './postgres-forecast-snapshot-store';
import { ForecastSnapshotService } from './forecast-snapshot.service';

import { CRM_ACCOUNT_RELATIONSHIP_STORE } from './account-relationship-store';
import { InMemoryAccountRelationshipStore } from './in-memory-account-relationship-store';
import { PostgresAccountRelationshipStore } from './postgres-account-relationship-store';
import { AccountRelationshipService } from './account-relationship.service';

import { CRM_INSTALLED_BASE_STORE } from './installed-base-store';
import { InMemoryInstalledBaseStore } from './in-memory-installed-base-store';
import { PostgresInstalledBaseStore } from './postgres-installed-base-store';
import { InstalledBaseService } from './installed-base.service';

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
      provide: CRM_MARKET_ITEM_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresMarketItemStore(pool) : new InMemoryMarketItemStore(),
    },
    MarketItemService,
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
      provide: CRM_COMMERCIAL_BASELINE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCommercialBaselineStore(pool) : new InMemoryCommercialBaselineStore(),
    },
    {
      provide: CRM_PRE_AWARD_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPreAwardStore(pool) : new InMemoryPreAwardStore(),
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
    {
      provide: CRM_SIGNAL_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSignalStore(pool) : new InMemorySignalStore(),
    },
    {
      provide: CRM_OPPORTUNITY_DEPTH_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresOpportunityDepthStore(pool) : new InMemoryOpportunityDepthStore(),
    },
    {
      provide: CRM_FORECAST_SNAPSHOT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresForecastSnapshotStore(pool) : new InMemoryForecastSnapshotStore(),
    },
    {
      provide: CRM_ACCOUNT_RELATIONSHIP_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresAccountRelationshipStore(pool) : new InMemoryAccountRelationshipStore(),
    },
    {
      provide: CRM_INSTALLED_BASE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresInstalledBaseStore(pool) : new InMemoryInstalledBaseStore(),
    },
    AccountService,
    AccountRelationshipService,
    InstalledBaseService,
    LeadService,
    OpportunityService,
    QuotationService,
    ContactService,
    ActivityService,
    SignalService,
    OpportunityDepthService,
    ForecastSnapshotService,
    PreAwardService,
    LeadConversionService,
  ],
  exports: [MarketItemService, AccountService, AccountRelationshipService, InstalledBaseService, LeadService, OpportunityService, QuotationService, ContactService, ActivityService, SignalService, OpportunityDepthService, ForecastSnapshotService, PreAwardService, LeadConversionService],
})
export class CrmModule {}
