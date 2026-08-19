import { describe, expect, it } from 'vitest';
import { selectRollbackTargets } from './migration-rollback.mjs';

/**
 * `down` used to mean exactly one thing: revert whatever happens to be newest. That is fine as a
 * developer's undo, but it makes a *test* that names a migration unstable — the CI check written
 * for 0235 silently began reverting 0241 the moment a merged branch added migrations after it,
 * and then failed while asserting about the wrong file.
 */
describe('selectRollbackTargets', () => {
  const files = ['0001_a.sql', '0002_b.sql', '0003_c.sql', '0004_d.sql'];
  const applied = new Set(files);

  it('reverts only the newest applied migration when no target is named', () => {
    expect(selectRollbackTargets(files, applied)).toEqual(['0004_d.sql']);
  });

  it('reverts the tip down to and including a named target, newest first', () => {
    expect(selectRollbackTargets(files, applied, '0002_b.sql')).toEqual([
      '0004_d.sql',
      '0003_c.sql',
      '0002_b.sql',
    ]);
  });

  it('reverts just the target when the target IS the tip', () => {
    expect(selectRollbackTargets(files, applied, '0004_d.sql')).toEqual(['0004_d.sql']);
  });

  it('ignores files that were never applied — the ledger decides, not the directory', () => {
    const partial = new Set(['0001_a.sql', '0002_b.sql']);
    expect(selectRollbackTargets(files, partial)).toEqual(['0002_b.sql']);
    expect(selectRollbackTargets(files, partial, '0001_a.sql')).toEqual(['0002_b.sql', '0001_a.sql']);
  });

  it('refuses a target that is not applied, rather than silently rolling back everything', () => {
    expect(() => selectRollbackTargets(files, new Set(['0001_a.sql']), '0003_c.sql')).toThrow(
      /not an applied migration/,
    );
  });

  it('has nothing to do on an empty ledger', () => {
    expect(selectRollbackTargets(files, new Set())).toEqual([]);
  });
});
