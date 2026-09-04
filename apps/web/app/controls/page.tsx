import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Compatibility entry point for legacy Project Controls links. Project-scoped
 * control work now lives in Project 360; preserve the incoming project context
 * while translating the legacy WBS tab to the canonical delivery workspace.
 */
export default async function LegacyControlsPage({ searchParams }: { searchParams: Promise<{ projectId?: string; tab?: string }> }) {
  const { projectId, tab } = await searchParams;
  const canonicalTab = tab === 'wbs' ? 'delivery' : tab ?? 'overview';
  const query = new URLSearchParams();
  if (canonicalTab) query.set('tab', canonicalTab);
  if (projectId) {
    const suffix = query.toString();
    redirect(`/project/${encodeURIComponent(projectId)}/controls${suffix ? `?${suffix}` : ''}`);
  }
  const suffix = query.toString();
  redirect(`/projects/controls${suffix ? `?${suffix}` : ''}`);
}
