import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL = readFileSync(
  resolve(__dirname, '../../../../infrastructure/migrations/0267_crm_quotation_readiness_mode.sql'),
  'utf8',
);
const STORE = readFileSync(
  resolve(__dirname, '../../../../modules/crm/src/postgres-quotation-store.ts'),
  'utf8',
);

describe('Quotation readiness migration safety', () => {
  it('uses an explicit marker and defaults post-rollout inserts to governed', () => {
    expect(SQL).toContain('approval_readiness_mode');
    expect(SQL).toContain("check (approval_readiness_mode in ('governed', 'legacy'))");
    expect(SQL).toContain('before insert on public.aura_crm_quotations');
    expect(SQL).toContain("new.approval_readiness_mode := 'governed'");
    expect(SQL).toContain("set approval_readiness_mode = 'legacy'");
    expect(SQL).toContain('alter column approval_readiness_mode set default');
    expect(SQL).toContain('alter column approval_readiness_mode set not null');
  });

  it('keeps the rollback section present', () => {
    expect(SQL).toContain('-- @DOWN');
    expect(SQL).toContain('drop column if exists approval_readiness_mode');
  });

  it('fails closed if an un-migrated reader ever observes NULL', () => {
    expect(STORE).toContain("r.approval_readiness_mode === 'legacy' ? 'legacy' : 'governed'");
    expect(STORE).not.toContain("r.approval_readiness_mode === 'governed' ? 'governed' : 'legacy'");
  });
});
