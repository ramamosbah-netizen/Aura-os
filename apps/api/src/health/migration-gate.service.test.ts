import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { Logger } from '@nestjs/common';
import { MigrationGateService, migrationOwnerUrl, shouldAutoMigrate, sslFor } from './migration-gate.service';

/** A pg-Pool stand-in whose SELECT returns the given applied filenames (or throws). */
function fakePool(applied: string[] | Error): Pool {
  return {
    query: vi.fn(async () => {
      if (applied instanceof Error) throw applied;
      return { rows: applied.map((f) => ({ filename: f })) };
    }),
  } as unknown as Pool;
}

/**
 * A pg-Pool stand-in that also supports `connect()` and mutates its applied set when a ledger
 * INSERT runs — so a full apply-then-re-evaluate cycle is observable in-process.
 */
function fakeMigratingPool(initialApplied: string[]): Pool {
  const applied = new Set(initialApplied);
  const clientQuery = vi.fn(async (text: string, params?: unknown[]) => {
    if (/insert into public\.aura_migrations/i.test(text)) applied.add(String(params?.[0]));
    return { rows: [] };
  });
  return {
    query: vi.fn(async (text: string) => {
      if (/select filename from public\.aura_migrations/i.test(text)) {
        return { rows: [...applied].map((f) => ({ filename: f })) };
      }
      return { rows: [] };
    }),
    connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })),
  } as unknown as Pool;
}

describe('MigrationGateService', () => {
  let dir: string;
  const prev = process.env.MIGRATIONS_DIR;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gate-'));
    writeFileSync(join(dir, '0001_a.sql'), '-- a');
    writeFileSync(join(dir, '0002_b.sql'), '-- b');
    writeFileSync(join(dir, 'README.txt'), 'ignored'); // non-.sql is not a migration
    process.env.MIGRATIONS_DIR = dir;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.MIGRATIONS_DIR;
    else process.env.MIGRATIONS_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  it('is NOT degraded when every on-disk migration is applied', async () => {
    const s = await new MigrationGateService(fakePool(['0001_a.sql', '0002_b.sql'])).evaluate();
    expect(s.degraded).toBe(false);
    expect(s.pending).toEqual([]);
    expect(s.onDisk).toBe(2); // README.txt ignored
    expect(s.applied).toBe(2);
  });

  it('IS degraded and names the pending file when the schema is behind', async () => {
    const s = await new MigrationGateService(fakePool(['0001_a.sql'])).evaluate();
    expect(s.degraded).toBe(true);
    expect(s.pending).toEqual(['0002_b.sql']);
    expect(s.appliedButAbsent).toEqual([]);
  });

  // G-09 — drift the other way: applied rows whose files are gone. The node cannot prove that the
  // database schema matches the immutable history shipped with this build, so it fails closed.
  it('degrades when applied migrations no longer exist on disk', async () => {
    const s = await new MigrationGateService(
      fakePool(['0001_a.sql', '0002_b.sql', '0003_renamed_away.sql']),
    ).evaluate();
    expect(s.degraded).toBe(true);
    expect(s.pending).toEqual([]);
    expect(s.appliedButAbsent).toEqual(['0003_renamed_away.sql']);
    expect(s.applied).toBe(3);
    expect(s.onDisk).toBe(2);
  });

  it('reports drift in both directions at once', async () => {
    const s = await new MigrationGateService(fakePool(['0001_a.sql', '0009_gone.sql'])).evaluate();
    expect(s.degraded).toBe(true);
    expect(s.pending).toEqual(['0002_b.sql']);
    expect(s.appliedButAbsent).toEqual(['0009_gone.sql']);
  });

  it('treats a missing aura_migrations ledger as fully behind (degraded, all pending)', async () => {
    const s = await new MigrationGateService(
      fakePool(new Error('relation "aura_migrations" does not exist')),
    ).evaluate();
    expect(s.degraded).toBe(true);
    expect(s.pending).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(s.applied).toBe(0);
  });

  it('is inert (never degraded) with no database pool — in-memory/dev has no schema to be behind', async () => {
    const s = await new MigrationGateService(null).evaluate();
    expect(s.degraded).toBe(false);
    expect(s.reason).toContain('no database');
  });

  it('onModuleInit caches the status read by getStatus()/isDegraded()', async () => {
    // AUTO_MIGRATE=off keeps this a pure strict-gate/caching assertion (no self-heal).
    const prevFlag = process.env.AUTO_MIGRATE;
    process.env.AUTO_MIGRATE = 'off';
    try {
      const gate = new MigrationGateService(fakePool(['0001_a.sql']));
      await gate.onModuleInit();
      expect(gate.isDegraded()).toBe(true);
      expect(gate.getStatus().pending).toEqual(['0002_b.sql']);
    } finally {
      if (prevFlag === undefined) delete process.env.AUTO_MIGRATE;
      else process.env.AUTO_MIGRATE = prevFlag;
    }
  });

  it('onModuleInit auto-applies pending migrations and clears the degraded state (dev default)', async () => {
    const prevFlag = process.env.AUTO_MIGRATE;
    delete process.env.AUTO_MIGRATE; // dev default is on (NODE_ENV=test ≠ production)
    try {
      const gate = new MigrationGateService(fakeMigratingPool(['0001_a.sql']));
      await gate.onModuleInit();
      expect(gate.isDegraded()).toBe(false);
      expect(gate.getStatus().applied).toBe(2);
      expect(gate.getStatus().pending).toEqual([]);
    } finally {
      if (prevFlag === undefined) delete process.env.AUTO_MIGRATE;
      else process.env.AUTO_MIGRATE = prevFlag;
    }
  });
});

describe('shouldAutoMigrate', () => {
  it('is OFF in production regardless of the flag', () => {
    expect(shouldAutoMigrate({ NODE_ENV: 'production' })).toBe(false);
    expect(shouldAutoMigrate({ NODE_ENV: 'production', AUTO_MIGRATE: 'on' })).toBe(false);
  });

  it('is ON by default outside production', () => {
    expect(shouldAutoMigrate({})).toBe(true);
    expect(shouldAutoMigrate({ NODE_ENV: 'development' })).toBe(true);
    expect(shouldAutoMigrate({ NODE_ENV: 'test' })).toBe(true);
  });

  it('honours an explicit dev opt-out', () => {
    for (const v of ['off', 'false', '0', 'no', 'OFF', 'False']) {
      expect(shouldAutoMigrate({ AUTO_MIGRATE: v })).toBe(false);
    }
    expect(shouldAutoMigrate({ AUTO_MIGRATE: 'yes' })).toBe(true);
  });
});

/**
 * Which credential auto-migrate connects with. G-03 runs the API as `aura_app` (NOBYPASSRLS, no
 * CREATE on schema public), so reusing the app pool for DDL cannot work on a role-split database:
 * boot failed with a bare "permission denied for schema public" that read like a broken deploy.
 */
describe('migrationOwnerUrl', () => {
  const saved = { url: process.env.MIGRATION_DATABASE_URL, file: process.env.MIGRATION_DATABASE_URL_FILE };

  afterEach(() => {
    for (const [k, v] of [['MIGRATION_DATABASE_URL', saved.url], ['MIGRATION_DATABASE_URL_FILE', saved.file]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('prefers the owner credential when one is configured', () => {
    process.env.MIGRATION_DATABASE_URL = 'postgres://owner@db/postgres';
    expect(migrationOwnerUrl()).toBe('postgres://owner@db/postgres');
  });

  it('honours the _FILE secret seam', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owner-'));
    const file = join(dir, 'migration-url');
    writeFileSync(file, 'postgres://owner@db/from-file\n');
    delete process.env.MIGRATION_DATABASE_URL;
    process.env.MIGRATION_DATABASE_URL_FILE = file;
    try {
      expect(migrationOwnerUrl()).toBe('postgres://owner@db/from-file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to the app pool (null) when no owner credential is set — un-split setups', () => {
    delete process.env.MIGRATION_DATABASE_URL;
    delete process.env.MIGRATION_DATABASE_URL_FILE;
    expect(migrationOwnerUrl()).toBeNull();
  });
});

describe('sslFor', () => {
  it('disables TLS for a local socket', () => {
    expect(sslFor('postgresql://user:***@localhost:5432/postgres')).toBe(false);
    expect(sslFor('postgresql://user:***@127.0.0.1:5432/postgres')).toBe(false);
    expect(sslFor('postgresql://user:***@db.example.com:5432/postgres?sslmode=disable')).toBe(false);
  });

  it('keeps TLS on for hosted Postgres, without demanding a local CA', () => {
    expect(sslFor('postgresql://user:***@aws-1.pooler.supabase.com:5432/postgres')).toEqual({ rejectUnauthorized: false });
  });
});

describe('auto-migrate on a role-split database', () => {
  let dir: string;
  const prev = process.env.MIGRATIONS_DIR;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gate-perm-'));
    writeFileSync(join(dir, '0001_a.sql'), '-- a');
    process.env.MIGRATIONS_DIR = dir;
    delete process.env.MIGRATION_DATABASE_URL;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.MIGRATIONS_DIR;
    else process.env.MIGRATIONS_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  it('names the missing owner credential when the app role is refused DDL', async () => {
    const logged: string[] = [];
    const pool = {
      query: vi.fn(async () => ({ rows: [] })),
      connect: vi.fn(async () => ({
        query: vi.fn(async (text: string) => {
          if (/create table|alter table/i.test(text)) throw new Error('permission denied for schema public');
          return { rows: [] };
        }),
        release: vi.fn(),
      })),
    } as unknown as Pool;

    const gate = new MigrationGateService(pool);
    vi.spyOn(Logger.prototype, 'error').mockImplementation((m: unknown) => { logged.push(String(m)); });
    try {
      await gate.onModuleInit();
    } finally {
      vi.restoreAllMocks();
    }

    const failure = logged.find((l) => l.includes('Auto-migrate failed'));
    expect(failure).toBeDefined();
    expect(failure).toContain('MIGRATION_DATABASE_URL');
    // Still gated: a refused migration must leave the deploy-gate closed, not quietly open.
    expect(gate.isDegraded()).toBe(true);
  });
});
