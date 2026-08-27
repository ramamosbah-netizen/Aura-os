import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Client } from 'pg';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '@aura/core';
import { readSecret } from '@aura/shared';

/**
 * Decide whether boot should auto-apply pending migrations. The first-run failure mode this
 * repairs: a fresh clone boots with an empty schema, every migration pending, so the deploy-gate
 * refuses ALL business routes (503) until someone manually runs `db:migrate` and restarts — a
 * dead app on first launch. In development we instead migrate-then-serve automatically.
 *
 * PRODUCTION IS NEVER auto-migrated: prod deploys run migrations as a separate, ordered, reviewed
 * step (migrate-before-serve), and letting an app node apply DDL to a shared cluster on boot is a
 * foot-gun (races between replicas, partial applies, wrong-role DDL). There, the 503 gate stands.
 * A dev user who wants the strict gate behaviour can opt out with `AUTO_MIGRATE=off|false|0|no`.
 */
export function shouldAutoMigrate(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return false;
  const flag = env.AUTO_MIGRATE?.trim().toLowerCase();
  if (flag === 'off' || flag === 'false' || flag === '0' || flag === 'no') return false;
  return true;
}

export interface MigrationGateStatus {
  /** True when migration history differs in either direction and business traffic must be gated. */
  degraded: boolean;
  /** Migration filenames present on disk but not recorded in public.aura_migrations. */
  pending: string[];
  /**
   * Filenames recorded APPLIED that no longer exist on disk — schema history drift (gap register
   * **G-09**). This is degraded: a node whose immutable migration history does not match the
   * database cannot prove that its schema is the one the code was tested against.
   */
  appliedButAbsent: string[];
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
    appliedButAbsent: [],
    onDisk: null,
    applied: null,
    reason: 'not evaluated',
  };

  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  async onModuleInit(): Promise<void> {
    this.status = await this.evaluate();

    // First-run repair (dev only): rather than serve a dead 503 app, apply the pending migrations
    // and re-check. Production keeps the strict gate (see shouldAutoMigrate). A failure here leaves
    // the app degraded exactly as before — auto-migrate can only improve on the 503, never brick it.
    if (this.status.pending.length > 0 && this.pool && shouldAutoMigrate()) {
      const dir = resolveMigrationsDir();
      if (dir) {
        this.logger.warn(
          `Schema behind code — auto-applying ${this.status.pending.length} pending migration(s) (dev). ` +
            'Set AUTO_MIGRATE=off to keep the strict deploy-gate instead.',
        );
        try {
          await this.applyPending(this.status.pending, dir);
          this.status = await this.evaluate();
        } catch (err) {
          this.logger.error(`Auto-migrate failed: ${(err as Error).message}. Business routes remain gated (503).`);
        }
      }
    }

    if (this.status.pending.length > 0) {
      this.logger.error(
        `SCHEMA BEHIND CODE — ${this.status.pending.length} pending migration(s): ${this.status.pending.join(', ')}. ` +
          'Business routes are refused (503) until migrations are applied. Run `pnpm --filter @aura/api db:migrate`.',
      );
    } else if (this.status.appliedButAbsent.length === 0) {
      this.logger.log(`Schema up to date (${this.status.reason}).`);
    }

    // Drift in the other direction (G-09) is also fail-closed. A database whose immutable history
    // differs from the build cannot prove schema compatibility, even when no forward file is pending.
    if (this.status.appliedButAbsent.length > 0) {
      this.logger.error(
        `MIGRATION HISTORY DRIFT — ${this.status.appliedButAbsent.length} applied migration(s) no longer exist on disk: ` +
          `${this.status.appliedButAbsent.join(', ')}. Usually a rename/renumber AFTER the file was applied. ` +
          'Business routes are refused (503) until the ledger and shipped history are reconciled.',
      );
    }
  }

  /**
   * Apply pending migration files in filename order, each in its own transaction, recording the
   * ledger row — the same contract as `apps/api/scripts/migrate.mjs`. One connection is held for
   * the whole run so each file's BEGIN/DDL/INSERT/COMMIT lands together. Any failure aborts the
   * run (throws); files already applied stay applied (the ledger is the source of truth).
   *
   * The connection is deliberately NOT the app pool when an owner credential exists — see
   * `migrationOwnerUrl`.
   */
  private async applyPending(pending: string[], dir: string): Promise<void> {
    const ownerUrl = migrationOwnerUrl();
    if (ownerUrl) {
      this.logger.log('Auto-migrate connects as the schema owner (MIGRATION_DATABASE_URL), not the app role.');
      const client = new Client({ connectionString: ownerUrl, ssl: sslFor(ownerUrl) });
      await client.connect();
      try {
        await this.runPending(client, pending, dir);
      } finally {
        await client.end();
      }
      return;
    }

    if (!this.pool) return;
    // No owner credential configured. Correct for setups that never split the roles, where
    // DATABASE_URL still owns the schema. On a role-split database it fails — and the rewrite
    // below names the missing credential instead of leaving a bare "permission denied".
    const client: PoolClient = await this.pool.connect();
    try {
      await this.runPending(client, pending, dir);
    } catch (err) {
      const message = (err as Error).message;
      if (/permission denied|must be owner/i.test(message)) {
        throw new Error(
          `${message} — the app role holds no DDL rights (G-03 runs the API as NOBYPASSRLS aura_app). ` +
            'Set MIGRATION_DATABASE_URL to the schema-owning credential so auto-migrate uses it, or run ' +
            '`pnpm --filter @aura/api db:migrate` and restart.',
          { cause: err },
        );
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /** Run the pending files on an already-open connection (pooled app client or owner client). */
  private async runPending(client: SqlRunner, pending: string[], dir: string): Promise<void> {
    // The ledger may not exist yet on a truly fresh DB — create it exactly as the runner does.
    await client.query(
      `create table if not exists public.aura_migrations (
         filename   text        primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    for (const file of pending) {
      const sql = readFileSync(join(dir, file), 'utf8');
      const marker = sql.indexOf('-- @DOWN');
      const up = marker < 0 ? sql : sql.slice(0, marker);
      await client.query('BEGIN');
      try {
        await client.query(up);
        await client.query('insert into public.aura_migrations (filename) values ($1)', [file]);
        await client.query('COMMIT');
        this.logger.log(`✓ auto-applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
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
      return { degraded: false, pending: [], appliedButAbsent: [], onDisk: null, applied: null, reason: 'no database (in-memory mode)' };
    }

    const dir = resolveMigrationsDir();
    if (!dir) {
      this.logger.warn('Could not locate infrastructure/migrations — deploy-gate inert (set MIGRATIONS_DIR to enable).');
      return { degraded: false, pending: [], appliedButAbsent: [], onDisk: null, applied: null, reason: 'migrations dir not found' };
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
        appliedButAbsent: [],
        onDisk: onDisk.length,
        applied: 0,
        reason: 'aura_migrations ledger missing — no migrations applied',
      };
    }

    const pending = onDisk.filter((f) => !applied.has(f));
    // The other direction: applied rows with no file. This is immutable-history drift and must gate.
    const onDiskSet = new Set(onDisk);
    const appliedButAbsent = [...applied].filter((f) => !onDiskSet.has(f)).sort();
    const degraded = pending.length > 0 || appliedButAbsent.length > 0;
    return {
      degraded,
      pending,
      appliedButAbsent,
      onDisk: onDisk.length,
      applied: applied.size,
      reason:
        pending.length > 0
          ? `${pending.length} migration(s) pending`
          : appliedButAbsent.length > 0
            ? `${appliedButAbsent.length} applied migration(s) absent from disk`
            : 'all migrations applied',
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

/** Minimal shape shared by `pg`'s pooled client and a standalone `Client`. */
interface SqlRunner {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

/**
 * The credential auto-migrate connects with, or null to fall back to the app pool.
 *
 * G-03 split the roles: the API connects as `aura_app`, which is NOBYPASSRLS and holds no CREATE
 * on schema public — deliberately, so a compromised app node cannot reshape the schema. Reusing
 * the app pool for DDL therefore CANNOT work on a role-split database: every boot ended in
 * `permission denied for schema public`, which reads as a broken deployment rather than as the
 * privilege boundary it actually is. Schema work belongs to the owning credential, exactly as
 * `scripts/migrate.mjs` has always done it. Read through the secret seam so
 * `MIGRATION_DATABASE_URL_FILE` works the same way.
 */
export function migrationOwnerUrl(): string | null {
  return readSecret('MIGRATION_DATABASE_URL');
}

/** Mirror the standalone runner: TLS off for local sockets, permissive for hosted PG. */
export function sslFor(connectionString: string): false | { rejectUnauthorized: boolean } {
  const local =
    /(@|\/\/)(localhost|127\.0\.0\.1)/.test(connectionString) || /[?&]sslmode=disable/.test(connectionString);
  return local ? false : { rejectUnauthorized: false };
}
