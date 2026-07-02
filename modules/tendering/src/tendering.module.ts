import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { TENDER_STORE } from './tender-store';
import { InMemoryTenderStore } from './in-memory-tender-store';
import { PostgresTenderStore } from './postgres-tender-store';
import { BOQ_STORE } from './boq-store';
import { InMemoryBOQStore } from './in-memory-boq-store';
import { PostgresBOQStore } from './postgres-boq-store';
import { TenderService } from './tender.service';
import { BID_SCORE_STORE } from './bid-score-store';
import { InMemoryBidScoreStore } from './in-memory-bid-score-store';
import { PostgresBidScoreStore } from './postgres-bid-score-store';
import { BidScoreService } from './bid-score.service';
import { ESTIMATE_STORE } from './estimate-store';
import { InMemoryEstimateStore } from './in-memory-estimate-store';
import { PostgresEstimateStore } from './postgres-estimate-store';
import { EstimateService } from './estimate.service';
import { TENDER_OUTCOME_STORE } from './win-loss-store';
import { InMemoryTenderOutcomeStore } from './in-memory-win-loss-store';
import { PostgresTenderOutcomeStore } from './postgres-win-loss-store';
import { WinLossService } from './win-loss.service';

/** The Tendering business module — same shape as CRM (the module template). */
@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: TENDER_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresTenderStore(pool) : new InMemoryTenderStore(),
    },
    {
      provide: BOQ_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresBOQStore(pool) : new InMemoryBOQStore(),
    },
    {
      provide: BID_SCORE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresBidScoreStore(pool) : new InMemoryBidScoreStore(),
    },
    {
      provide: ESTIMATE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresEstimateStore(pool) : new InMemoryEstimateStore(),
    },
    {
      provide: TENDER_OUTCOME_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresTenderOutcomeStore(pool) : new InMemoryTenderOutcomeStore(),
    },
    TenderService,
    BidScoreService,
    EstimateService,
    WinLossService,
  ],
  exports: [TenderService, BidScoreService, EstimateService, WinLossService],
})
export class TenderingModule {}
