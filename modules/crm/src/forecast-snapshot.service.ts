import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type Id, makeEvent,
  type ForecastSnapshot, type ForecastableOpp, type ForecastDiff,
  captureForecast, diffForecast, CRM_FORECAST_EVENT,
} from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { CRM_FORECAST_SNAPSHOT_STORE, type ForecastSnapshotStore } from './forecast-snapshot-store';
import { OpportunityService } from './opportunity.service';

const r2 = (n: number): number => Math.round(n * 100) / 100;

export interface ForecastCapture {
  batchId: Id;
  takenAt: string;
  periods: ForecastSnapshot[];
  totalOpen: number;
  totalWeighted: number;
  totalCommitted: number;
  totalDeals: number;
}

export interface ForecastHistory {
  captures: ForecastCapture[];
  /** Slippage of the newest capture vs. the one before it (hasPrior:false on the first ever). */
  latestDiff: ForecastDiff;
}

function toCapture(periods: ForecastSnapshot[]): ForecastCapture {
  return {
    batchId: periods[0]?.batchId ?? '',
    takenAt: periods[0]?.takenAt ?? '',
    periods,
    totalOpen: r2(periods.reduce((s, p) => s + p.openValue, 0)),
    totalWeighted: r2(periods.reduce((s, p) => s + p.weightedValue, 0)),
    totalCommitted: r2(periods.reduce((s, p) => s + p.committedValue, 0)),
    totalDeals: periods.reduce((s, p) => s + p.dealCount, 0),
  };
}

/** Forecast snapshots — capture the weighted pipeline as immutable history and expose slippage.
 * Events emitted on the spine (non-transactional, mirroring OpportunityDepthService). */
@Injectable()
export class ForecastSnapshotService {
  private readonly logger = new Logger('CRM-Forecast');

  constructor(
    @Inject(CRM_FORECAST_SNAPSHOT_STORE) private readonly store: ForecastSnapshotStore,
    private readonly opportunities: OpportunityService,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  /** Take an immutable snapshot of the current open pipeline, keyed by expected-close period. */
  async capture(tenantId: Id, actorId?: Id | null): Promise<ForecastCapture> {
    const opps = (await this.opportunities.list({ tenantId, limit: 5000 })) as ForecastableOpp[];
    const rows = captureForecast(tenantId, opps);
    await this.store.saveBatch(rows);

    const capture = toCapture(rows);
    await this.events.append([makeEvent({
      type: CRM_FORECAST_EVENT.snapshotCaptured, tenantId, companyId: null,
      actorId: actorId ?? null, aggregateType: 'crm.forecast', aggregateId: capture.batchId,
      payload: { takenAt: capture.takenAt, totalWeighted: capture.totalWeighted, totalDeals: capture.totalDeals },
    })]);
    this.logger.log(`Forecast snapshot captured for ${tenantId}: ${capture.totalDeals} deals, weighted ${capture.totalWeighted}`);
    return capture;
  }

  /** The last `limit` captures (newest first) plus the slippage of the newest vs. its predecessor. */
  async history(tenantId: Id, limit = 12): Promise<ForecastHistory> {
    const batches = await this.store.recentBatches(tenantId, Math.max(limit, 2));
    const captures = batches.slice(0, limit).map(toCapture);
    const curr = batches[0] ?? [];
    const prev = batches[1] ?? [];
    return { captures, latestDiff: diffForecast(prev, curr) };
  }
}
