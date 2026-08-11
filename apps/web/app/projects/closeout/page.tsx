import ProjectCloseoutWizard, { type ProjectCloseoutData } from '@/components/project-closeout-wizard';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function ProjectCloseoutPage() {
  const projects = await getJson<ProjectCloseoutData[]>('/api/projects/projects');

  return (
    <div style={{ padding: '24px 28px' }}>
      <ProjectCloseoutWizard projects={projects ?? []} />
    </div>
  );
}
