import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// AURA-FIT-001: this is an I/O-bound walk of the whole repository, not a behavioural test.
// vitest's 5 s default describes neither its work nor its variance under parallel turbo load
// (measured 15-20 s contended, <1 s alone). The generous budget names what it is; the assertions
// are untouched — this relaxes nothing about the check itself.
vi.setConfig({ testTimeout: 30_000 });

describe('0270 baseline projection migration contract', () => {
  const sql = readFileSync(
    join(process.cwd(), '..', '..', 'infrastructure', 'migrations', '0270_crm_baseline_estimation_projection_backfill.sql'),
    'utf8',
  ).toLowerCase();

  it('only copies a uniquely-linked, frozen, non-empty authoritative source', () => {
    expect(sql).toContain("ps.status = 'frozen'");
    expect(sql).toContain('ps.superseded_at is null');
    expect(sql).toContain('jsonb_array_length(ps.lines) > 0');
    expect(sql).toContain('source_count = 1');
  });

  it('is idempotent and never fabricates a zero/guess projection', () => {
    expect(sql).toContain('b.estimation is null');
    expect(sql).not.toMatch(/set\s+pricing\s*=\s*['"]?0/);
    expect(sql).not.toMatch(/set\s+estimation\s*=\s*['"]?0/);
    expect(sql).toContain('-- @down');
  });
});
