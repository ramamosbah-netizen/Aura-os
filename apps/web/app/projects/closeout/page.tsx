import ProjectCloseoutWizard, { type ProjectCloseoutData } from '@/components/project-closeout-wizard';
import { getJson } from '@/lib/api';
import ProjectsSuiteChrome from '@/components/projects-suite-chrome';

export const dynamic = 'force-dynamic';

export default async function ProjectCloseoutPage() {
  const projects = await getJson<ProjectCloseoutData[]>('/api/projects/projects');

  return (
    <ProjectsSuiteChrome active="closeout" title="Project closeout" description="Move from delivery complete to governed handover with a clear readiness trail.">
    <div style={{ padding: '0 0 24px' }}>
      <ProjectCloseoutWizard projects={projects ?? []} />
    </div>
    </ProjectsSuiteChrome>
  );
}
