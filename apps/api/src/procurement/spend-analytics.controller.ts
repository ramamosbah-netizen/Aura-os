import { Controller, Get, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { PurchaseOrderService } from '@aura/procurement';

interface Bucket { key: string; count: number; value: number }
interface SpendAnalytics {
  totalSpend: number;
  poCount: number;
  committedSpend: number; // approved/issued/received/closed — real commitments
  draftSpend: number;     // draft/pending — not yet committed
  byStatus: Bucket[];
  bySupplier: Bucket[];   // top 10 by value
  byProject: Bucket[];    // top 10 by value
  byMonth: Bucket[];      // last 12 months, chronological
}

const COMMITTED = new Set(['approved', 'issued', 'received', 'closed']);

function bucket(rows: { key: string; value: number }[]): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const r of rows) {
    const b = m.get(r.key) ?? { key: r.key, count: 0, value: 0 };
    b.count += 1;
    b.value += r.value;
    m.set(r.key, b);
  }
  return [...m.values()];
}

/**
 * Procurement spend analytics — the manager's read view over the PO book: total & committed
 * spend, and breakdowns by status, supplier, project and month. Pure aggregation over the
 * PurchaseOrder aggregate (no other context), computed server-side so the client renders one payload.
 */
@Controller('procurement/spend-analytics')
export class SpendAnalyticsController {
  constructor(
    private readonly pos: PurchaseOrderService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  async analytics(@Query('status') status?: string): Promise<SpendAnalytics> {
    const pos = await this.pos.list({ status });
    const rows = pos.map((p) => ({ status: p.status, value: p.value || 0, supplierName: p.supplierName, projectName: p.projectName, createdAt: p.createdAt }));

    const totalSpend = rows.reduce((s, r) => s + r.value, 0);
    const committedSpend = rows.filter((r) => COMMITTED.has(r.status)).reduce((s, r) => s + r.value, 0);

    const byStatus = bucket(rows.map((r) => ({ key: r.status, value: r.value }))).sort((a, b) => b.value - a.value);
    const bySupplier = bucket(rows.map((r) => ({ key: r.supplierName || 'Unassigned', value: r.value })))
      .sort((a, b) => b.value - a.value).slice(0, 10);
    const byProject = bucket(rows.map((r) => ({ key: r.projectName || 'Unassigned', value: r.value })))
      .sort((a, b) => b.value - a.value).slice(0, 10);

    // Last 12 months, chronological.
    const byMonthMap = bucket(rows.map((r) => ({ key: (r.createdAt ?? '').slice(0, 7), value: r.value })))
      .filter((b) => b.key);
    const byMonth = byMonthMap.sort((a, b) => (a.key < b.key ? -1 : 1)).slice(-12);

    return {
      totalSpend,
      poCount: rows.length,
      committedSpend,
      draftSpend: totalSpend - committedSpend,
      byStatus,
      bySupplier,
      byProject,
      byMonth,
    };
  }
}
