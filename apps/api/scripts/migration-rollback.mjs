// Rollback target selection for the migration runner (apps/api/scripts/migrate.mjs).
// Its own module so it can be unit-tested: importing migrate.mjs would read the environment,
// build a pg client and exit the process when no connection string is configured.

/**
 * Which applied migrations a rollback should revert, newest first.
 *
 * - no target → just the most recently applied one (the original `down` behaviour).
 * - a target  → everything from the tip down to AND INCLUDING that file.
 *
 * The target form exists because "the newest migration" is not a stable way to NAME one. A
 * rollback check written when 0235 was the tip silently starts reverting a different file the
 * moment a later migration lands — which is exactly what merging a branch does, and it then
 * fails as a confusing assertion about the wrong migration. Reverting stays strictly
 * newest-first: this never reaches into the middle of the history and leaves a hole behind it.
 *
 * @param {string[]} files   every migration filename on disk, sorted
 * @param {Set<string>} applied  filenames recorded in public.aura_migrations
 * @param {string} [target]  filename to roll back to, inclusive
 * @returns {string[]} filenames to revert, in the order they must be reverted
 */
export function selectRollbackTargets(files, applied, target) {
  const appliedInOrder = files.filter((f) => applied.has(f));
  if (!target) return appliedInOrder.slice(-1);
  const at = appliedInOrder.indexOf(target);
  if (at < 0) {
    throw new Error(`down target "${target}" is not an applied migration on disk — nothing to roll back to`);
  }
  return appliedInOrder.slice(at).reverse();
}
