import { getJson } from '@/lib/api';
import ProjectControlsDashboard, { type ControlProject, type ControlSchedule } from '@/components/project-controls-dashboard';

export const dynamic = 'force-dynamic';

export default async function ProjectsControlsPage() {
  const [projects, schedules] = await Promise.all([
    getJson<ControlProject[]>('/api/projects/projects/portfolio'),
    getJson<ControlSchedule[]>('/api/projects/schedules'),
  ]);

  return <ProjectControlsDashboard projects={projects} schedules={schedules} />;
}
