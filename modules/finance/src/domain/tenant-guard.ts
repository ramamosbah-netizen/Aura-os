// Moved to @aura/shared (identity/tenant-guard) so every module can use it — the isolation hole
// it guards against is not finance-specific (gap register N-08). Re-exported here so the ten
// finance services that already adopted it keep their existing import path.
export { assertSameTenant, sameTenantOrNull } from '@aura/shared';
