import { getJson } from '@/lib/api';
import AuraTabAnchor from '@/components/aura-tab-anchor';
import ProjectApprovalsWorkspace from '@/components/project-approvals-workspace';
import type { ApiDecisionItem, SharedDecisionDocument } from '@/lib/decision-assignments';
import ProjectsSuiteChrome from '@/components/projects-suite-chrome';

export const dynamic = 'force-dynamic';

interface ProjectNotification {
  id: string;
  title: string;
  body: string;
  category: string;
  read: boolean;
  createdAt: string;
  refType: string | null;
  refId: string | null;
}

export default async function ProjectApprovalsPage() {
  const [decisions, sharedDocuments, notifications] = await Promise.all([
    getJson<ApiDecisionItem[]>('/api/inbox'),
    getJson<SharedDecisionDocument[]>('/api/documents/shared-with-me'),
    getJson<ProjectNotification[]>('/api/notifications'),
  ]);

  return (
    <ProjectsSuiteChrome active="approvals" title="Approvals & actions" description="See project decisions that need attention, with the source record and next valid action always visible.">
    <main data-testid="project-approvals-page">
      <AuraTabAnchor href="/projects/approvals" title="Project approvals" type="Projects" />
      <ProjectApprovalsWorkspace decisions={decisions} sharedDocuments={sharedDocuments} notifications={notifications} />
    </main>
    </ProjectsSuiteChrome>
  );
}
