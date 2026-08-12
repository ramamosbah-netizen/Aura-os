import type { ReportLineStore } from './store.interface';

/** Generic in-memory store for a daily-report line-item type (labour/plant/progress/delay/evidence). */
export class InMemoryReportLineStore<T extends { id: string; tenantId: string; dailyReportId: string; createdAt: string }>
  implements ReportLineStore<T>
{
  private readonly items = new Map<string, T>();

  async save(line: T): Promise<void> {
    this.items.set(line.id, { ...line });
  }

  async listByReport(dailyReportId: string, tenantId: string): Promise<T[]> {
    return [...this.items.values()]
      .filter((l) => l.dailyReportId === dailyReportId && l.tenantId === tenantId)
      .map((l) => ({ ...l }))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
}
