import { BadRequestException, Body, Controller, Get, Inject, Optional, Post } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Pool } from 'pg';
import { AuditService, PG_POOL, Permissions, SettingsService, TenantContext } from '@aura/core';

/**
 * Admin Center data-lifecycle surface (Vol 15 §2.9 tail / §2.6 retention seam, gap #25):
 * the orphan-scan report and the events/audit archiver, admin-visible instead of
 * script-only. Shares the reference catalog with apps/api/scripts/orphan-scan.mjs
 * (infrastructure/orphan-references.json) and the retention window with the archiver
 * via the `lifecycle.archiveMonths` tenant setting.
 */

interface RefRow {
  child: string;
  column: string;
  parent: string;
}

// table → [time column, predicate no row may escape] — mirrors scripts/archive-events.mjs.
const ARCHIVE_TARGETS: Array<[table: string, timeCol: string, extra: string]> = [
  ['aura_events', 'occurred_at', 'processed_at is not null'],
  ['aura_audit_log', 'created_at', 'true'],
];

const BATCH = 5000;
const DEFAULT_MONTHS = 12;

/** Walk up from dist/ to the repo (or image) root holding infrastructure/. */
function loadCatalog(): RefRow[] {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const p = join(dir, 'infrastructure', 'orphan-references.json');
    if (existsSync(p)) {
      return (JSON.parse(readFileSync(p, 'utf8')) as { references: RefRow[] }).references;
    }
    dir = dirname(dir);
  }
  return [];
}

@Controller('admin/platform')
export class DataLifecycleController {
  private readonly catalog = loadCatalog();

  constructor(
    @Optional() @Inject(PG_POOL) private readonly pool: Pool | null,
    private readonly settings: SettingsService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private async archiveMonths(): Promise<number> {
    const raw = await this.settings.get(this.tenant.get().tenantId, 'lifecycle.archiveMonths').catch(() => null);
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 120 ? n : DEFAULT_MONTHS;
  }

  /** Orphan report + archive eligibility. Degrades honestly without a database. */
  @Permissions('admin.data.manage')
  @Get('data-lifecycle')
  async status(): Promise<{
    database: boolean;
    months: number;
    orphans: Array<{ child: string; column: string; parent: string; count: number | null }>;
    archive: Array<{ table: string; eligible: number; archived: number }>;
  }> {
    const months = await this.archiveMonths();
    if (!this.pool) return { database: false, months, orphans: [], archive: [] };

    const orphans: Array<{ child: string; column: string; parent: string; count: number | null }> = [];
    for (const { child, column, parent } of this.catalog) {
      const exists = await this.pool.query<{ n: number }>(
        `select count(*)::int as n from information_schema.tables
         where table_schema = 'public' and table_name = any($1)`,
        [[child, parent]],
      );
      if (exists.rows[0].n !== 2) {
        orphans.push({ child, column, parent, count: null }); // table missing in this DB
        continue;
      }
      const { rows } = await this.pool.query<{ n: number }>(
        `select count(*)::int as n
         from public.${child} c
         where c.${column} is not null
           and not exists (
             select 1 from public.${parent} p
             where p.id::text = c.${column}::text and p.tenant_id = c.tenant_id
           )`,
      );
      orphans.push({ child, column, parent, count: rows[0].n });
    }

    const archive: Array<{ table: string; eligible: number; archived: number }> = [];
    for (const [table, timeCol, extra] of ARCHIVE_TARGETS) {
      const eligible = await this.pool.query<{ n: number }>(
        `select count(*)::int as n from public.${table}
         where ${timeCol} < now() - ($1 || ' months')::interval and ${extra}`,
        [months],
      );
      const archived = await this.pool
        .query<{ n: number }>(`select count(*)::int as n from public.${table}_archive`)
        .then((r) => r.rows[0].n)
        .catch(() => 0); // twin not created yet
      archive.push({ table, eligible: eligible.rows[0].n, archived });
    }

    return { database: true, months, orphans, archive };
  }

  /** Run the archiver — dry-run by default; `execute: true` moves rows (audited). */
  @Permissions('admin.data.manage')
  @Post('archive-run')
  async archiveRun(
    @Body() dto: { execute?: boolean },
  ): Promise<{ executed: boolean; months: number; results: Array<{ table: string; eligible: number; moved: number }> }> {
    if (!this.pool) throw new BadRequestException('no database configured — archiving applies to Postgres mode only');
    const months = await this.archiveMonths();
    const execute = dto?.execute === true;
    const results: Array<{ table: string; eligible: number; moved: number }> = [];

    for (const [table, timeCol, extra] of ARCHIVE_TARGETS) {
      const eligible = (
        await this.pool.query<{ n: number }>(
          `select count(*)::int as n from public.${table}
           where ${timeCol} < now() - ($1 || ' months')::interval and ${extra}`,
          [months],
        )
      ).rows[0].n;

      let moved = 0;
      if (execute && eligible > 0) {
        await this.pool.query(
          `create table if not exists public.${table}_archive (like public.${table} including all)`,
        );
        // Batched move — same CTE as scripts/archive-events.mjs.
        for (;;) {
          const { rowCount } = await this.pool.query(
            `with batch as (
               delete from public.${table}
               where id in (
                 select id from public.${table}
                 where ${timeCol} < now() - ($1 || ' months')::interval and ${extra}
                 order by ${timeCol}
                 limit ${BATCH}
               )
               returning *
             )
             insert into public.${table}_archive select * from batch`,
            [months],
          );
          if (!rowCount) break;
          moved += rowCount;
        }
      }
      results.push({ table, eligible, moved });
    }

    if (execute) {
      const ctx = this.tenant.get();
      void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'data-lifecycle', 'archive', 'executed', {
        months,
        results,
      });
    }
    return { executed: execute, months, results };
  }
}
