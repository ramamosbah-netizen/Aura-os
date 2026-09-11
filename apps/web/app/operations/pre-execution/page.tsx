import { getJson } from '@/lib/api';
import DeliveryOperationsWorkspaceHeader from '@/components/delivery-operations-workspace-header';
import PreExecutionClient, { type ReadinessRow } from '@/components/pre-execution-client';

export const dynamic = 'force-dynamic';

interface Project { id: string; title: string; reference?: string | null; status?: string | null }
interface Schedule { projectId: string; baselineSetAt?: string | null }
interface SourceRow { projectId?: string; status?: string; severity?: string }

const closed = new Set(['approved', 'closed', 'resolved', 'complete', 'completed', 'commissioned']);

export default async function PreExecutionPage() {
  const [projects, schedules, drawings, ncrs] = await Promise.all([
    getJson<Project[]>('/api/projects/projects'),
    getJson<Schedule[]>('/api/projects/schedules'),
    getJson<SourceRow[]>('/api/engineering/drawings'),
    getJson<SourceRow[]>('/api/quality/ncrs'),
  ]);
  const scheduleByProject = new Map((schedules ?? []).map((row) => [row.projectId, row]));
  const rows: ReadinessRow[] | null = projects === null ? null : projects.map((project) => {
    const schedule = scheduleByProject.get(project.id);
    const projectDrawings = drawings?.filter((row) => row.projectId === project.id) ?? null;
    const projectNcrs = ncrs?.filter((row) => row.projectId === project.id) ?? null;
    const hasMajorNcr = projectNcrs?.some((row) => row.severity === 'major' && !closed.has((row.status ?? '').toLowerCase())) ?? false;
    const plan = schedule?.baselineSetAt ? 'READY' : 'UNKNOWN';
    const engineering = projectDrawings === null ? 'UNKNOWN' : projectDrawings.length > 0 && projectDrawings.every((row) => row.status === 'approved') ? 'READY' : 'UNKNOWN';
    const quality = hasMajorNcr ? 'BLOCKED' : 'UNKNOWN';
    return {
      id: project.id,
      title: project.title,
      reference: project.reference ?? null,
      status: project.status ?? null,
      plan,
      engineering,
      material: 'UNKNOWN',
      quality,
      hse: 'UNKNOWN',
      overall: hasMajorNcr ? 'BLOCKED' : 'UNKNOWN',
      reason: hasMajorNcr ? 'Major open NCR is an evidenced blocker.' : 'Material, HSE or discipline evidence is not established.',
    };
  });

  return (
    <div className="page-container" style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 28px 64px' }} data-testid="pre-execution-workspace">
      <DeliveryOperationsWorkspaceHeader active="pre-execution" title="Pre-execution" description="Decide what can start safely before the team is sent to site. This view projects readiness from the owning systems; it never stores a manual READY flag." />
      <PreExecutionClient rows={rows} />
    </div>
  );
}
