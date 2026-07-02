import { getJson } from '@/lib/api';
import RecordDetail, { RecordNotFound } from '../../../../components/record-detail';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
  reference: string | null;
  contractId: string | null;
  contractTitle: string | null;
  accountId: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

const money = (n: number) => (n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getJson<Project>(`/api/projects/projects/${id}`);
  if (!project) return <RecordNotFound type="Project" backHref="/projects/projects" backLabel="Back to Projects" />;

  const links = [
    project.accountId
      ? { label: `Account: ${project.accountName ?? 'view'}`, href: `/crm/accounts/${project.accountId}` }
      : null,
    project.contractId
      ? { label: `Contract: ${project.contractTitle ?? 'view'}`, href: `/contracts/contracts/${project.contractId}` }
      : null,
    { label: 'Schedule (Gantt)', href: '/projects/schedule' },
    { label: 'Variations', href: '/projects/variations' },
    { label: 'Projects dashboard', href: '/projects/dashboard' },
  ].filter((l): l is { label: string; href: string } => l !== null);

  return (
    <RecordDetail
      type="Project"
      title={project.title}
      status={project.status}
      backHref="/projects/projects"
      backLabel="Back to Projects"
      fields={[
        { label: 'Reference', value: project.reference ?? '—' },
        { label: 'Client', value: project.accountName ?? '—' },
        { label: 'Source contract', value: project.contractTitle ?? '—' },
        { label: 'Budget', value: money(project.value) },
        { label: 'Created', value: new Date(project.createdAt).toLocaleDateString() },
      ]}
      links={links}
    />
  );
}
