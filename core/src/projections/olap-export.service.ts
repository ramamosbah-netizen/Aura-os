import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';
import { DmsService } from '../dms/dms.service';

@Injectable()
export class OlapExportService {
  private readonly logger = new Logger('OlapExportService');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool | null,
    private readonly dms: DmsService,
  ) {}

  async exportPeriodToWarehouse(tenantId: string, periodMonth: string): Promise<{ fileUrl: string; rowCount: number }> {
    this.logger.log(`Starting OLAP Data Warehouse export for tenant: ${tenantId}, period: ${periodMonth}`);

    let plRows: any[] = [];
    let auditRows: any[] = [];

    if (this.pool) {
      // 1. Fetch Profit & Loss Read Model rows
      const plResult = await this.pool.query(
        `SELECT period_month, revenue, expense 
           FROM public.aura_finance_pl_projection
          WHERE tenant_id = $1 AND period_month = $2`,
        [tenantId, periodMonth]
      );
      plRows = plResult.rows;

      // 2. Fetch Audit Logs for the period
      const auditResult = await this.pool.query(
        `SELECT entity_type, entity_id, action, actor_id, occurred_at, changes
           FROM public.aura_audit_log
          WHERE tenant_id = $1 AND to_char(occurred_at, 'YYYY-MM') = $2`,
        [tenantId, periodMonth]
      );
      auditRows = auditResult.rows;
    } else {
      // In-memory fallback mock data
      plRows = [{ period_month: periodMonth, revenue: 5000, expense: 1200 }];
      auditRows = [{ entity_type: 'finance.invoice', entity_id: 'inv-mock', action: 'approve', actor_id: 'u1', occurred_at: new Date().toISOString(), changes: {} }];
    }

    // Transform and denormalize data to a CSV payload
    const csvLines: string[] = [];
    csvLines.push('type,period_month,entity_type,entity_id,action,value,details');

    for (const row of plRows) {
      csvLines.push(`pl,${row.period_month},,,Revenue,${row.revenue},`);
      csvLines.push(`pl,${row.period_month},,,Expense,${row.expense},`);
    }

    for (const row of auditRows) {
      const dateStr = row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at);
      csvLines.push(`audit,${periodMonth},${row.entity_type},${row.entity_id},${row.action},,${dateStr}`);
    }

    const csvContent = csvLines.join('\n');
    const filename = `olap_export_${tenantId}_${periodMonth}.csv`;

    // Write file directly into DMS storage (version-controlled and audit-logged)
    const doc = await this.dms.createDocument(
      {
        tenantId,
        companyId: null,
        kind: 'report' as any,
        title: filename,
        aggregateType: 'olap.export',
        aggregateId: periodMonth,
      },
      {
        fileName: filename,
        contentType: 'text/csv',
        data: Buffer.from(csvContent, 'utf-8'),
      }
    );

    const fileUrl = doc.versions[0]?.storageKey || `/exports/olap/${filename}`;
    this.logger.log(`OLAP Export successful. File stored in DMS: ${fileUrl}`);
    return {
      fileUrl,
      rowCount: plRows.length + auditRows.length,
    };
  }
}
