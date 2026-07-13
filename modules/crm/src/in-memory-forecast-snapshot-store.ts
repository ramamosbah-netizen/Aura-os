import type { Id, ForecastSnapshot } from '@aura/shared';
import type { ForecastSnapshotStore } from './forecast-snapshot-store';

/** Phase-0 forecast-snapshot store — append-only rows in memory (no-DB boots). */
export class InMemoryForecastSnapshotStore implements ForecastSnapshotStore {
  private readonly rows: ForecastSnapshot[] = [];
  /** Monotonic capture order — the tie-break when two captures share a takenAt millisecond. */
  private readonly batchSeq = new Map<string, number>();
  private seq = 0;

  async saveBatch(rows: ForecastSnapshot[]): Promise<void> {
    for (const r of rows) {
      if (!this.batchSeq.has(r.batchId)) this.batchSeq.set(r.batchId, this.seq++);
      this.rows.push({ ...r });
    }
  }

  async recentBatches(tenantId: Id, limit: number): Promise<ForecastSnapshot[][]> {
    const byBatch = new Map<string, ForecastSnapshot[]>();
    for (const r of this.rows) {
      if (r.tenantId !== tenantId) continue;
      const list = byBatch.get(r.batchId) ?? [];
      list.push({ ...r });
      byBatch.set(r.batchId, list);
    }
    return [...byBatch.entries()]
      .sort(([aId, a], [bId, b]) => {
        if (a[0].takenAt !== b[0].takenAt) return a[0].takenAt < b[0].takenAt ? 1 : -1;
        return (this.batchSeq.get(bId) ?? 0) - (this.batchSeq.get(aId) ?? 0); // newer capture first
      })
      .slice(0, limit)
      .map(([, rows]) => rows);
  }
}
