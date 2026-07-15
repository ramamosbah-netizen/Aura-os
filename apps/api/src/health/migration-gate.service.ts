import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '@aura/core';

export interface MigrationGateStatus {
  /** True when the DB schema is BEHIND the code (migration files exist that aren't applied). */
  degraded: boolean;
  /** Migration filenames present on disk but not recorded in public.aura_migrations. */
  pending: string[];
  /** Total migration files shipped with this build (null when the dir couldn't be located). */
  onDisk: number | null;
  /** How many are recorded applied (null when the DB/table couldn't be read). */
  applied: number | null;
  /** Short human explanation for logs / the health payload. */
  reason: string;
}

/**
 * Migration deploy-gate (Roadmap R2 / G-P0-2).
 *
 * Prevents the app from serving business routes against a **stale schema** — the failure mode
 * behind the `assigned_to` silent-500 incident, where code expected a column a un-migrated DB
 * didn't have. At boot we compare the migration files shipped with this build
 * (`infrastructure/migrations/*.sql`) against the rows recorded in `public.aura_migrations` (the
 * ledger the migrate runner writes). If any file is unapplied the schema is behind the code → the
 * app is **degraded**: `/health` says so loudly and business routes are refused with 503 rather
 * than 500-ing deep in a handler.
 *
 * The check runs ONCE at boot (deploys migrate-before-serve, so the boot snapshot is the contract;
 * recovery is a restart after migrating). With no `DATABASE_URL` (in-memory dev/test) there is no
 * schema to be behind, so the gate is inert.
 */
@Injectable()
export class MigrationGateService implements OnModuleInit {
  private readonly logger = new Logger('MigrationGate');
  private status: MigrationGateStatus = {
    degraded: false,
    pending: [],
    onDisk: null,
    applied: null,
    reason: 'not evaluated',
  };

  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  async onModuleInit(): Promise<void> {
    this.status = await this.evaluate();
    if (this.status.degraded) {
      this.logger.error(
        `SCHEMA BEHIND CODE — ${this.status.pending.length} pending migration(s): ${this.status.pending.join(', ')}. ` +
          'Business routes are refused (503) until migrations are applied. Run `pnpm --filter @aura/api db:migrate`.',
      );
    } else {
      this.logger.log(`Schema up to date (${this.status.reason}).`);
    }
  }

  /** The cached boot status (what the health endpoint + the request guard read). */
  getStatus(): MigrationGateStatus {
    return this.status;
  }

  isDegraded(): boolean {
    return this.status.degraded;
  }

  /**
   * Compare the migration files on disk with the applied ledger. Never throws — a check that
   * can't run must fail OPEN for the "can't determine" cases (no DB, no migrations dir) so the
   * gate never bricks a legitimately-schemaless deployment, but fail CLOSED (degraded) for the
   * one thing it exists to catch: files present that the DB hasn't applied.
   */
  async evaluate(): Promise<MigrationGateStatus> {
    if (!this.pool) {
      return { degraded: false, pending: [], onDisk: null, applied: null, reason: 'no database (in-memory mode)' };
    }

    const dir = resolveMigrationsDir();
    if (!dir) {
      this.logger.warn('Could not locate infrastructure/migrations — deploy-gate inert (set MIGRATIONS_DIR to enable).');
      return { degraded: false, pending: [], onDisk: null, applied: null, reason: 'migrations dir not found' };
    }

    const onDisk = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let applied: Set<string>;
    try {
      const { rows } = await this.pool.query<{ filename: string }>('SELECT filename FROM public.aura_migrations');
      applied = new Set(rows.map((r) => r.filename));
    } catch {
      // The ledger table doesn't exist yet → nothing has ever been migrated → the whole schema
      // is behind. Degraded, with every file pending.
      return {
        degraded: onDisk.length > 0,
        pending: onDisk,
        onDisk: onDisk.length,
        applied: 0,
        reason: 'aura_migrations ledger missing — no migrations applied',
      };
    }

    const pending = onDisk.filter((f) => !applied.has(f));
    return {
      degraded: pending.length > 0,
      pending,
      onDisk: onDisk.length,
      applied: applied.size,
      reason: pending.length > 0 ? `${pending.length} migration(s) pending` : 'all migrations applied',
    };
  }
}

/**
 * Locate the shipped `infrastructure/migrations` directory, robust to the dev tree
 * (`repo/apps/api/dist/**`) and the Docker image (`/app/apps/api/dist/**` + `/app/infrastructure`).
 * Honors a `MIGRATIONS_DIR` override, else walks up from this compiled file's directory.
 */
function resolveMigrationsDir(): string | null {
  const override = process.env.MIGRATIONS_DIR?.trim();
  if (override) return existsSync(override) ? override : null;
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'infrastructure', 'migrations');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
