import { Controller, Get, Header, Query, Logger } from '@nestjs/common';
import { AuditService, TenantContext } from '@aura/core';
import { Inject } from '@nestjs/common';
import { PG_POOL } from '@aura/core';
import { toCsv } from '@aura/shared';
import type { Pool } from 'pg';

/**
 * AuditController — Admin REST API for the immutable audit trail browser.
 *
 * Provides searchable, paginated access to the kernel audit log.
 * All entries are immutable; this controller is read-only.
 *
 * Blueprint Reference: Phase 8 — Week 1-2, Task K2 (Audit Trail Browser)
 */
@Controller('audit')
export class AuditController {
  private readonly logger = new Logger('AuditController');

  constructor(
    private readonly tenant: TenantContext,
    @Inject(PG_POOL) private readonly pool: Pool | null,
  ) {}

  /**
   * List audit log entries with optional filters.
   *
   * GET /api/v1/audit?module=finance&entityType=invoice&action=created&limit=50&offset=0
   */
  @Get()
  async list(
    @Query('module') module?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit: string = '50',
    @Query('offset') offset: string = '0',
  ) {
    const tenantId = this.tenant.get().tenantId ?? 'default';

    // Fallback: return mock data when no PG pool is available (dev mode)
    if (!this.pool) {
      this.logger.warn('No PG pool available — returning mock audit entries');
      return {
        data: generateMockEntries(tenantId, Number(limit)),
        total: 128,
        limit: Number(limit),
        offset: Number(offset),
      };
    }

    // Build dynamic WHERE clause from provided filters
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramIdx = 2;

    if (module) {
      conditions.push(`module = $${paramIdx++}`);
      params.push(module);
    }
    if (entityType) {
      conditions.push(`entity_type = $${paramIdx++}`);
      params.push(entityType);
    }
    if (entityId) {
      conditions.push(`entity_id = $${paramIdx++}`);
      params.push(entityId);
    }
    if (action) {
      conditions.push(`action = $${paramIdx++}`);
      params.push(action);
    }
    if (actorId) {
      conditions.push(`actor_id = $${paramIdx++}`);
      params.push(actorId);
    }
    if (from) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(to);
    }

    const whereClause = conditions.join(' AND ');
    const lim = Math.min(Number(limit) || 50, 200);
    const off = Number(offset) || 0;

    const [dataResult, countResult] = await Promise.all([
      this.pool.query(
        `SELECT id, tenant_id, company_id, actor_id, module, entity_type, entity_id, action, changes, metadata, created_at
         FROM public.aura_audit_log
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT ${lim} OFFSET ${off}`,
        params,
      ),
      this.pool.query(
        `SELECT count(*)::int AS total FROM public.aura_audit_log WHERE ${whereClause}`,
        params,
      ),
    ]);

    return {
      data: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      limit: lim,
      offset: off,
    };
  }

  /**
   * Export the (filtered) audit trail as CSV — the Power BI / Excel feed for the compliance
   * log (Vol 23 #10). Same filters as `list`, no page limit (capped for safety), jsonb
   * `changes`/`metadata` flattened to JSON strings so every column is a scalar. Declared
   * before `:id` so the literal route wins.
   *
   * GET /api/v1/audit/export.csv?module=finance&from=2026-01-01
   */
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-log.csv"')
  async exportCsv(
    @Query('module') module?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<string> {
    const tenantId = this.tenant.get().tenantId ?? 'default';
    const COLS = ['id', 'tenant_id', 'company_id', 'actor_id', 'module', 'entity_type', 'entity_id', 'action', 'changes', 'metadata', 'created_at'];
    const flatten = (rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> =>
      rows.map((r) => ({
        ...r,
        changes: JSON.stringify(r.changes ?? {}),
        metadata: JSON.stringify(r.metadata ?? {}),
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      }));

    if (!this.pool) {
      return toCsv(flatten(generateMockEntries(tenantId, 50)), COLS);
    }

    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    let idx = 2;
    const eq = (col: string, val?: string): void => {
      if (val) {
        conditions.push(`${col} = $${idx++}`);
        params.push(val);
      }
    };
    eq('module', module);
    eq('entity_type', entityType);
    eq('entity_id', entityId);
    eq('action', action);
    eq('actor_id', actorId);
    if (from) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(to);
    }

    const EXPORT_CAP = 50000;
    const res = await this.pool.query(
      `SELECT ${COLS.join(', ')}
         FROM public.aura_audit_log
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ${EXPORT_CAP}`,
      params,
    );
    return toCsv(flatten(res.rows), COLS);
  }

  /**
   * Get a single audit entry by ID.
   */
  @Get(':id')
  async getById(@Query('id') id: string) {
    if (!this.pool) {
      return { id, tenant_id: 'default', module: 'mock', entity_type: 'mock', action: 'mock' };
    }
    const result = await this.pool.query(
      'SELECT * FROM public.aura_audit_log WHERE id = $1',
      [id],
    );
    return result.rows[0] ?? null;
  }
}

// ─── Mock data generator for development ──────────────────────────────────────

function generateMockEntries(tenantId: string, limit: number) {
  const modules = ['crm', 'finance', 'procurement', 'projects', 'tendering', 'hr', 'inventory'];
  const actions = ['created', 'updated', 'approved', 'rejected', 'deleted', 'submitted'];
  const entities = ['invoice', 'purchase_order', 'project', 'tender', 'employee', 'account', 'grn'];
  const actors = ['user-001', 'user-002', 'user-admin', 'system'];

  return Array.from({ length: Math.min(limit, 50) }, (_, i) => ({
    id: `audit-${Date.now()}-${i}`,
    tenant_id: tenantId,
    company_id: 'company-001',
    actor_id: actors[i % actors.length],
    module: modules[i % modules.length],
    entity_type: entities[i % entities.length],
    entity_id: `ent-${1000 + i}`,
    action: actions[i % actions.length],
    changes: { field: 'status', from: 'draft', to: 'approved' },
    metadata: {},
    created_at: new Date(Date.now() - i * 3600000).toISOString(),
  }));
}
