import { getJson } from '@/lib/api';
import PipelineWorkspace, {
  type PipelineAccount,
  type PipelineAtRisk,
  type PipelineLead,
  type PipelineOpp,
} from '@/components/pipeline-workspace';

export const dynamic = 'force-dynamic';

// Sales Pipeline — the focused deal board. Opportunities and leads share one journey; the pipeline
// engine's at-risk list supplies the server-computed attention reasons. Every figure is read live.

interface Pipeline { atRisk: PipelineAtRisk[] }

export default async function PipelinePage() {
  // Accounts are read for the Opportunity drawer's party picker only — a deal is linked to an
  // existing account, never to a typed-in name.
  const [opportunities, leads, pipeline, accounts] = await Promise.all([
    getJson<PipelineOpp[]>('/api/crm/opportunities'),
    getJson<PipelineLead[]>('/api/crm/leads'),
    getJson<Pipeline>('/api/crm/opportunities/pipeline'),
    getJson<PipelineAccount[]>('/api/crm/accounts'),
  ]);

  return (
    <PipelineWorkspace
      opportunities={opportunities ?? []}
      leads={leads ?? []}
      atRisk={pipeline?.atRisk ?? []}
      accounts={accounts ?? []}
    />
  );
}
