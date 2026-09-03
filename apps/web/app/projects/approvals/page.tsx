import { getJson } from '@/lib/api';
import AuraTabAnchor from '@/components/aura-tab-anchor';
import ProjectApprovalsWorkspace from '@/components/project-approvals-workspace';
import type { ApiDecisionItem, SharedDecisionDocument } from '@/lib/decision-assignments';
import ProjectsSuiteChrome from '@/components/projects-suite-chrome';
import ProjectApprovalBand from '@/components/project-approval-band';
import type { DeliveryProject } from '@/components/project-delivery-dashboard';
import type { DeliveryVariation } from '@/components/project-change-control-band';

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
  const [decisions, sharedDocuments, notifications, projects, variations] = await Promise.all([
    getJson<ApiDecisionItem[]>('/api/inbox'),
    getJson<SharedDecisionDocument[]>('/api/documents/shared-with-me'),
    getJson<ProjectNotification[]>('/api/notifications'),
    getJson<DeliveryProject[]>('/api/projects/projects/portfolio'),
    getJson<DeliveryVariation[]>('/api/projects/variations'),
  ]);
  const projectDecisionCount = decisions?.filter((item) => item.module === 'Projects' || item.module === 'Quality').length ?? null;

  return (
    <ProjectsSuiteChrome active="approvals" title="Approvals & actions" description="See project decisions that need attention, with the source record and next valid action always visible.">
    <main data-testid="project-approvals-page">
      <AuraTabAnchor href="/projects/approvals" title="Project approvals" type="Projects" />
      <ProjectApprovalBand projects={projects} variations={variations} totalApprovals={projectDecisionCount} />
      <ProjectApprovalsWorkspace decisions={decisions} sharedDocuments={sharedDocuments} notifications={notifications} />
    </main>
    </ProjectsSuiteChrome>
  );
}
