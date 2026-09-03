import { CalendarRange, CheckCircle2, Clock3, Layers3, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { getJson } from '@/lib/api';
import GanttClient from '../../../components/gantt-client';
import ProjectsSuiteChrome from '../../../components/projects-suite-chrome';
import styles from './projects-schedule.module.css';

export const dynamic = 'force-dynamic';

interface ScheduleTask {
  name: string; plannedStart: string; plannedEnd: string;
  baselineStart: string | null; baselineEnd: string | null;
  actualStart: string | null; actualEnd: string | null; percentComplete: number;
}
interface ProjectSchedule {
  id: string; projectId: string; projectName: string | null; tasks: ScheduleTask[]; baselineSetAt: string | null;
}
interface Project { id: string; title: string }

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { projectId } = await searchParams;
  const [schedules, projects] = await Promise.all([
    getJson<ProjectSchedule[]>('/api/projects/schedules'),
    getJson<Project[]>('/api/projects/projects'),
  ]);
  const scopedSchedules = projectId ? (schedules ?? []).filter((schedule) => schedule.projectId === projectId) : schedules;
  const scopedProjects = projectId ? (projects ?? []).filter((project) => project.id === projectId) : projects;
  const projectName = scopedProjects?.[0]?.title ?? scopedSchedules?.[0]?.projectName;
  const rows = scopedSchedules ?? [];
  const taskCount = rows.reduce((total, schedule) => total + schedule.tasks.length, 0);
  const completeCount = rows.reduce((total, schedule) => total + schedule.tasks.reduce((sum, task) => sum + task.percentComplete, 0), 0);
  const averageProgress = taskCount ? Math.round(completeCount / taskCount) : null;
  const baselinedCount = rows.filter((schedule) => Boolean(schedule.baselineSetAt)).length;
  const unavailable = schedules === null;

  return (
    <ProjectsSuiteChrome active="schedule" title="Plan & schedule" description="Build the delivery plan, compare baseline to actual, and keep every project activity accountable.">
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span>Projects / Plan &amp; schedule</span>
            <span className={styles.live}><i />Live planning view</span>
          </div>
          <h1>{projectName ? <>Plan <em>{projectName}</em> with confidence.</> : <>Plan the work. <em>See it move.</em></>}</h1>
          <p>Shape the delivery plan, lock a baseline, and keep every activity aligned with the work happening on site.</p>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.secondaryAction} href={projectId ? `/project/${projectId}` : '/projects/projects'}>
            <Layers3 size={16} /> {projectId ? 'Project 360' : 'Projects register'}
          </Link>
        </div>
      </header>

      <section className={styles.metricGrid} aria-label="Schedule summary">
        <div className={styles.metricCard}>
          <span className={styles.metricIcon}><CalendarRange size={17} /></span>
          <div><span className={styles.metricLabel}>Scheduled projects</span><strong>{unavailable ? '—' : rows.length}</strong><small>{unavailable ? 'Data unavailable' : rows.length === 1 ? 'Active plan' : 'Plans in this view'}</small></div>
        </div>
        <div className={styles.metricCard}>
          <span className={`${styles.metricIcon} ${styles.green}`}><ListChecks size={17} /></span>
          <div><span className={styles.metricLabel}>Planned activities</span><strong>{unavailable ? '—' : taskCount}</strong><small>{unavailable ? 'Data unavailable' : 'Tasks across the timeline'}</small></div>
        </div>
        <div className={styles.metricCard}>
          <span className={`${styles.metricIcon} ${styles.blue}`}><CheckCircle2 size={17} /></span>
          <div><span className={styles.metricLabel}>Average completion</span><strong>{unavailable || averageProgress === null ? '—' : `${averageProgress}%`}</strong><small>{unavailable ? 'Data unavailable' : 'Duration-weighted progress'}</small></div>
        </div>
          <div className={styles.metricCard}>
          <span className={`${styles.metricIcon} ${styles.violet}`}><Clock3 size={17} /></span>
          <div><span className={styles.metricLabel}>Baseline coverage</span><strong>{unavailable || rows.length === 0 ? '—' : `${baselinedCount}/${rows.length}`}</strong><small>{unavailable ? 'Data unavailable' : rows.length === 0 ? 'No plans started yet' : 'Plans with a locked baseline'}</small></div>
        </div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.workspaceHead}>
          <div>
            <span className={styles.sectionKicker}>Planning desk</span>
            <h2>{projectName ? 'Project schedule' : 'Portfolio schedules'}</h2>
            <p>Compare the plan with its baseline, then update progress as delivery moves forward.</p>
          </div>
          <div className={styles.legend} aria-label="Chart legend">
            <span><i className={styles.plannedSwatch} /> Planned</span>
            <span><i className={styles.progressSwatch} /> Progress</span>
            <span><i className={styles.baselineSwatch} /> Baseline</span>
          </div>
        </div>
        {unavailable ? (
          <div className={styles.unavailable} role="status">
            <CalendarRange size={22} />
            <div><strong>Schedule data is unavailable</strong><p>We could not reach the project service. Try again in a moment.</p></div>
          </div>
        ) : (
          <GanttClient schedules={rows} projects={scopedProjects ?? []} selectedProjectId={projectId} />
        )}
      </section>
    </main>
    </ProjectsSuiteChrome>
  );
}
