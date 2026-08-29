import { getJson } from '@/lib/api';
import SalesPipelineWorkspace from '@/components/sales-pipeline-workspace';
import type { LeadCommand } from '@/components/lead-attention-panel';
import type { RadarData } from '@/components/signals-radar';

export const dynamic = 'force-dynamic';

interface PipelineLead { id: string; name: string; companyName: string | null; email: string | null; phone: string | null; status: string; source: string | null; createdAt: string }
interface PipelineOpportunity { id: string; leadId: string | null; accountId: string | null; accountName: string | null; title: string; value: number; stage: string; winProbability: number; closeDate: string | null; createdAt: string }
interface PipelineAccount { id: string; name: string }

// Sales Pipeline — the focused deal board. Opportunities and leads share one journey; the pipeline
// engine's at-risk list supplies the server-computed attention reasons. Every figure is read live.

export default async function PipelinePage() {
  // Pipeline owns the complete sales workspace. Board/List behavior remains in CrmPipelineClient;
  // SalesPipelineWorkspace adds the explicit Overview/Forecast/Analytics navigation around it.
  const [opportunities, leads, accounts, leadCommand, radar] = await Promise.all([
    getJson<PipelineOpportunity[]>('/api/crm/opportunities'),
    getJson<PipelineLead[]>('/api/crm/leads'),
    getJson<PipelineAccount[]>('/api/crm/accounts'),
    getJson<LeadCommand>('/api/crm/leads/command'),
    getJson<RadarData>('/api/crm/signals/radar'),
  ]);

  return (
    <SalesPipelineWorkspace
      opportunities={opportunities ?? []}
      leads={leads ?? []}
      accounts={accounts ?? []}
      leadCommand={leadCommand}
      radar={radar}
    />
  );
}
