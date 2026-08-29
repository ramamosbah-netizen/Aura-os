import { getJson } from '@/lib/api';
import { redirect } from 'next/navigation';
import SalesPipelineWorkspace from '@/components/sales-pipeline-workspace';

export const dynamic = 'force-dynamic';

interface PipelineLead { id: string; name: string; companyName: string | null; email: string | null; phone: string | null; status: string; source: string | null; createdAt: string }
interface PipelineOpportunity { id: string; leadId: string | null; accountId: string | null; accountName: string | null; title: string; value: number; stage: string; winProbability: number; closeDate: string | null; createdAt: string }
interface PipelineAccount { id: string; name: string }

// Opportunities — the focused deal workspace. Forecast, Analytics and Radar are separate
// surfaces; these redirects preserve older pipeline-tab bookmarks without keeping duplicate UI.

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string }> }) {
  const query = await searchParams;
  if (query.tab === 'radar') redirect('/crm/radar');
  if (query.tab === 'forecast') redirect('/crm/forecast');
  if (query.tab === 'analytics' || query.tab === 'sources' || query.tab === 'executive') {
    const view = query.tab === 'sources' ? 'sources' : query.tab === 'executive' ? 'executive' : query.view === 'sources' || query.view === 'executive' ? query.view : 'performance';
    redirect(`/crm/analytics?view=${view}`);
  }
  if (query.tab === 'overview') redirect('/crm/overview');

  const [opportunities, leads, accounts] = await Promise.all([
    getJson<PipelineOpportunity[]>('/api/crm/opportunities'),
    getJson<PipelineLead[]>('/api/crm/leads'),
    getJson<PipelineAccount[]>('/api/crm/accounts'),
  ]);

  return (
    <SalesPipelineWorkspace
      opportunities={opportunities ?? []}
      leads={leads ?? []}
      accounts={accounts ?? []}
    />
  );
}
