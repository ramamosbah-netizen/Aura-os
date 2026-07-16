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
import { ESTIMATE_SOURCE_STORE } from './estimate-source-store';
import { InMemoryEstimateSourceStore } from './in-memory-estimate-source-store';
import { PostgresEstimateSourceStore } from './postgres-estimate-source-store';
import { EstimateSourcingService } from './estimate-sourcing.service';
import { SUBMISSION_STORE } from './submission-store';
import { InMemorySubmissionStore } from './in-memory-submission-store';
import { PostgresSubmissionStore } from './postgres-submission-store';
import { CLARIFICATION_STORE } from './clarification-store';
import { InMemoryClarificationStore } from './in-memory-clarification-store';
import { PostgresClarificationStore } from './postgres-clarification-store';
import { ClarificationService } from './clarification.service';
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
      provide: SUBMISSION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSubmissionStore(pool) : new InMemorySubmissionStore(),
    },
    {
      provide: CLARIFICATION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresClarificationStore(pool) : new InMemoryClarificationStore(),
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
    {
      provide: ESTIMATE_SOURCE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresEstimateSourceStore(pool) : new InMemoryEstimateSourceStore(),
    },
    TenderService,
    BidScoreService,
    EstimateService,
    EstimateSourcingService,
    WinLossService,
    ClarificationService,
  ],
  exports: [TenderService, BidScoreService, EstimateService, EstimateSourcingService, WinLossService, ClarificationService],
})
export class TenderingModule {}
