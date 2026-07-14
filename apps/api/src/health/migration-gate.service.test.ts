import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { MigrationGateService } from './migration-gate.service';

/** A pg-Pool stand-in whose SELECT returns the given applied filenames (or throws). */
function fakePool(applied: string[] | Error): Pool {
  return {
    query: vi.fn(async () => {
      if (applied instanceof Error) throw applied;
      return { rows: applied.map((f) => ({ filename: f })) };
    }),
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
    const gate = new MigrationGateService(fakePool(['0001_a.sql']));
    await gate.onModuleInit();
    expect(gate.isDegraded()).toBe(true);
    expect(gate.getStatus().pending).toEqual(['0002_b.sql']);
  });
});
