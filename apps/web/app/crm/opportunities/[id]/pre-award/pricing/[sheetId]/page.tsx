import { getJson } from '@/lib/api';
import PackagePricingWorkspace, { type PricingView } from '../../../../../../../components/package-pricing-workspace';

export const dynamic = 'force-dynamic';

// Package Pricing Workspace (Slice 7B) — opened in its own tab from the Commercial panel once the
// estimate is approved. The commercial decision: Estimated Cost → Margin/Markup → Discount → Selling
// Price → Freeze → Quotation.
export default async function PackagePricingWorkspacePage({ params }: { params: Promise<{ id: string; sheetId: string }> }) {
  const { id, sheetId } = await params;
  const view = await getJson<PricingView>(`/api/crm/opportunities/${id}/pre-award-package/pricing/${sheetId}`);
  if (!view || !view.sheet) {
    return <div style={{ padding: 40 }}>Pricing sheet not found, or the API is offline.</div>;
  }
  return <PackagePricingWorkspace opportunityId={id} initial={view} />;
}
