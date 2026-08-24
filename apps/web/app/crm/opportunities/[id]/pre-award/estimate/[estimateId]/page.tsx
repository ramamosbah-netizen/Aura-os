import { getJson } from '@/lib/api';
import EstimationWorkspace, { type WorkspaceView } from '../../../../../../../components/estimation-workspace';

export const dynamic = 'force-dynamic';

// Estimation Workspace (Slice 6B) — opened in its own tab from the Commercial panel once the scope is
// approved. Cost only; the commercial decision lives in Pricing (Slice 7).
export default async function EstimationWorkspacePage({ params }: { params: Promise<{ id: string; estimateId: string }> }) {
  const { id, estimateId } = await params;
  const view = await getJson<WorkspaceView>(`/api/crm/opportunities/${id}/pre-award-package/estimate/${estimateId}`);
  if (!view || !view.estimate) {
    return <div style={{ padding: 40 }}>Estimate not found, or the API is offline.</div>;
  }
  return <EstimationWorkspace opportunityId={id} initial={view} />;
}
