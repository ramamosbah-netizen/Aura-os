import { redirect } from 'next/navigation';
import type { WorkspaceMe } from '@aura/shared';
import { getJson } from '@/lib/api';
import AuraWorkspace from '@/components/aura-command-center';

export const dynamic = 'force-dynamic';

/**
 * Business Command Center is a cross-suite control surface, not a My Work page.
 * The server-side workspace function check keeps a hidden sidebar item from being
 * mistaken for authorization: direct links are denied before the dashboard loads.
 */
export default async function BusinessCommandCenterPage() {
  const me = await getJson<WorkspaceMe>('/api/workspace/me');
  if (!me || (!me.isAdmin && !me.functions.includes('suite.commandCenter'))) redirect('/my-work');
  return <AuraWorkspace variant="business-command-center" />;
}
