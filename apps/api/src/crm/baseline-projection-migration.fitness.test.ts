import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
