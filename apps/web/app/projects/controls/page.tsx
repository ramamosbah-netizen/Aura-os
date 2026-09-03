import { getJson } from '@/lib/api';
import ProjectControlsDashboard, { type ControlProject, type ControlSchedule } from '@/components/project-controls-dashboard';
import ProjectsSuiteChrome from '@/components/projects-suite-chrome';

export const dynamic = 'force-dynamic';

export default async function ProjectsControlsPage() {
  const [projects, schedules] = await Promise.all([
    getJson<ControlProject[]>('/api/projects/projects/portfolio'),
    getJson<ControlSchedule[]>('/api/projects/schedules'),
  ]);

  return <ProjectsSuiteChrome active="controls" title="Project controls" description="Technical health across the portfolio — WBS, CBS, schedule, cost and decision signals."><ProjectControlsDashboard projects={projects} schedules={schedules} /></ProjectsSuiteChrome>;
}
