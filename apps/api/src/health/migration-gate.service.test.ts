import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { MigrationGateService, shouldAutoMigrate } from './migration-gate.service';

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
