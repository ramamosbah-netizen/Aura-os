import AuraWorkspace from '@/components/aura-command-center';

export const dynamic = 'force-dynamic';

/**
 * The role-aware Command Center that used to be Home. Home is now a suite launcher and
 * My Work is the attention dashboard, so this keeps the `perspective.*` role views
 * (CEO / CFO / PM) reachable instead of orphaning a configurable capability.
 */
export default async function MyWorkCommandCenterPage() {
  return <AuraWorkspace variant="my-work" />;
}
