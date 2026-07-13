import type { Id, ForecastSnapshot } from '@aura/shared';

export const CRM_FORECAST_SNAPSHOT_STORE = Symbol('CRM_FORECAST_SNAPSHOT_STORE');

/** Append-only store for forecast captures. A capture is a batch of period rows sharing a batchId;
 * the store hands them back grouped by batch, newest capture first. No update/delete — history is
 * immutable by design. */
export interface ForecastSnapshotStore {
  saveBatch(rows: ForecastSnapshot[]): Promise<void>;
  /** The `limit` most-recent captures, each an array of that capture's period rows, newest first. */
  recentBatches(tenantId: Id, limit: number): Promise<ForecastSnapshot[][]>;
}
