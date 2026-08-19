import { getJson } from '@/lib/api';
import AuraTabAnchor from '@/components/aura-tab-anchor';
import ApprovalsReviewsWorkspace from '@/components/approvals-reviews-workspace';
import type { ApiDecisionItem, SharedDecisionDocument } from '@/lib/decision-assignments';

export const dynamic = 'force-dynamic';

export default async function MyApprovalsPage() {
  const [decisions, sharedDocuments] = await Promise.all([
    getJson<ApiDecisionItem[]>('/api/inbox'),
    getJson<SharedDecisionDocument[]>('/api/documents/shared-with-me'),
  ]);

  return (
    <main data-testid="my-approvals-page">
      <AuraTabAnchor href="/my-work/approvals" title="Approvals" type="My Work" />
      <ApprovalsReviewsWorkspace decisions={decisions} sharedDocuments={sharedDocuments} />
    </main>
  );
}
