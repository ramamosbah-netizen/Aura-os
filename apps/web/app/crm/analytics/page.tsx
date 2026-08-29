import { getJson } from '@/lib/api';
import SalesInsightWorkspace from '@/components/sales-insight-workspace';

export const dynamic = 'force-dynamic';

interface Lead { id: string; name: string; companyName: string | null; email: string | null; phone: string | null; status: string; source: string | null; createdAt: string }
interface Opportunity { id: string; leadId: string | null; accountId: string | null; accountName: string | null; title: string; value: number; stage: string; winProbability: number; closeDate: string | null; createdAt: string }
interface Account { id: string; name: string }

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const query = await searchParams;
  const view = query.view === 'sources' ? 'sources' : query.view === 'executive' ? 'executive' : 'analytics';
  const [opportunities, leads, accounts] = await Promise.all([
    getJson<Opportunity[]>('/api/crm/opportunities'),
    getJson<Lead[]>('/api/crm/leads'),
    getJson<Account[]>('/api/crm/accounts'),
  ]);
  return <SalesInsightWorkspace kind="analytics" view={view} leads={leads ?? []} opportunities={opportunities ?? []} accounts={accounts ?? []} />;
}
