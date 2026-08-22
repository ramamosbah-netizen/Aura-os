import { getJson } from '@/lib/api';
import PipelineWorkspace, {
  type PipelineAtRisk,
  type PipelineLead,
  type PipelineOpp,
} from '@/components/pipeline-workspace';

export const dynamic = 'force-dynamic';

// Sales Pipeline — the focused deal board. Opportunities and leads share one journey; the pipeline
// engine's at-risk list supplies the server-computed attention reasons. Every figure is read live.

interface Pipeline { atRisk: PipelineAtRisk[] }

export default async function PipelinePage() {
  const [opportunities, leads, pipeline] = await Promise.all([
    getJson<PipelineOpp[]>('/api/crm/opportunities'),
    getJson<PipelineLead[]>('/api/crm/leads'),
    getJson<Pipeline>('/api/crm/opportunities/pipeline'),
  ]);

  return (
    <PipelineWorkspace
      opportunities={opportunities ?? []}
      leads={leads ?? []}
      atRisk={pipeline?.atRisk ?? []}
    />
  );
}
