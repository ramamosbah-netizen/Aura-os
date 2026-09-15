import { CalendarRange, CheckCircle2, Clock3, Gauge, Layers3, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { getJson } from '@/lib/api';
import GanttClient from '../../../components/gantt-client';
import PlanningRunPanel from '../../../components/planning-run-panel';
import ResourceBookingClient from '../../../components/resource-booking-client';
import ResourcePoolClient from '../../../components/resource-pool-client';
import ProjectsSuiteChrome from '../../../components/projects-suite-chrome';
import styles from './projects-schedule.module.css';

export const dynamic = 'force-dynamic';

interface ScheduleTask {
  /** Stable task identity — carried through to the Gantt so an edit stays an edit. */
  id: string;
  wbsNodeId: string | null;
  name: string; plannedStart: string; plannedEnd: string;
  baselineStart: string | null; baselineEnd: string | null;
  actualStart: string | null; actualEnd: string | null; percentComplete: number;
  durationWorkingDays: number | null;
  requirements: Array<{
    id: string;
    resource: { resourceType: 'employee' | 'vehicle' | 'asset' | 'pool'; canonicalResourceId: string };
    quantity: number;
    unit: 'hours' | 'persons' | 'crews' | 'units';
  }>;
}
interface ProjectSchedule {
  id: string; projectId: string; projectName: string | null; tasks: ScheduleTask[]; baselineSetAt: string | null;
}
interface Project { id: string; title: string }
interface WbsNode { id: string; projectId: string; code: string; title: string; parentId: string | null }
interface ResourceCatalogItem {
  resourceType: 'employee' | 'vehicle' | 'asset' | 'pool';
  canonicalResourceId: string;
  label: string;
  secondary: string | null;
  status: string;
  unit: 'hours' | 'persons' | 'crews' | 'units' | null;
}
interface ResourcePool { id: string; name: string; unit: 'hours' | 'persons' | 'crews' | 'units'; sourceType: 'internal' | 'subcontractor'; sourceId: string | null }
interface ResourceCapacity { id: string; resource: { resourceType: string; canonicalResourceId: string }; unit: 'hours' | 'persons' | 'crews' | 'units'; quantity: number | null; from: string; to: string; note: string | null }
interface Supplier { id: string; code: string; name: string; category: string; status: string }
interface ResourceBookingView {
  booking: {
    id: string; taskId: string | null; requirementId: string | null;
    resource: { resourceType: 'employee' | 'vehicle' | 'asset' | 'pool'; canonicalResourceId: string };
    unit: 'hours' | 'persons' | 'crews' | 'units'; quantity: number; from: string; to: string;
    status: 'held' | 'released'; capacityAtCommitment: number | null; demandAtCommitment: number;
    overCapacityReason: string | null; releasedReason: string | null;
    response: 'pending' | 'accepted' | 'declined'; responseReason: string | null; responseBy: string | null;
  };
  assessment: { feasibility: 'AVAILABLE' | 'CONFLICTED' | 'UNKNOWN'; reason?: string; conflictDays: string[] };
  resourceConflict: { projectsInvolved: string[]; conflictDays: string[] };
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { projectId } = await searchParams;
  const [schedules, projects, wbsNodes, resourceCatalog, resourceBookings, resourcePools, resourceCapacity, suppliers] = await Promise.all([
    getJson<ProjectSchedule[]>('/api/projects/schedules'),
    getJson<Project[]>('/api/projects/projects'),
    getJson<WbsNode[]>(projectId ? `/api/projects/wbs?projectId=${encodeURIComponent(projectId)}` : '/api/projects/wbs'),
    getJson<ResourceCatalogItem[]>(projectId ? `/api/projects/schedules/resource-catalog?projectId=${encodeURIComponent(projectId)}` : '/api/projects/schedules/resource-catalog'),
    projectId ? getJson<ResourceBookingView[]>(`/api/projects/${encodeURIComponent(projectId)}/resource-bookings`) : Promise.resolve(null),
    getJson<ResourcePool[]>('/api/projects/resource-pools'),
    getJson<ResourceCapacity[]>('/api/projects/resource-capacity'),
    getJson<Supplier[]>('/api/procurement/suppliers'),
  ]);
  const scopedSchedules = projectId ? (schedules ?? []).filter((schedule) => schedule.projectId === projectId) : schedules;
  const scopedProjects = projectId ? (projects ?? []).filter((project) => project.id === projectId) : projects;
  const projectName = scopedProjects?.[0]?.title ?? scopedSchedules?.[0]?.projectName;
  const rows = scopedSchedules ?? [];
  const selectedSchedule = projectId ? rows.find((schedule) => schedule.projectId === projectId) : undefined;
  const taskCount = rows.reduce((total, schedule) => total + schedule.tasks.length, 0);
  const completeCount = rows.reduce((total, schedule) => total + schedule.tasks.reduce((sum, task) => sum + task.percentComplete, 0), 0);
  const averageProgress = taskCount ? Math.round(completeCount / taskCount) : null;
  const baselinedCount = rows.filter((schedule) => Boolean(schedule.baselineSetAt)).length;
  const unavailable = schedules === null;
  const scheduleHealth = unavailable
    ? { label: 'Unavailable', detail: 'The planning authority could not be reached, so schedule health cannot be established.', tone: 'muted' as const }
    : taskCount === 0
      ? { label: 'Not established', detail: 'No dated schedule activities are connected to this project yet.', tone: 'muted' as const }
      : { label: 'Unavailable', detail: 'No trusted SPI or time-phased baseline is available to claim an on-track or behind-schedule signal.', tone: 'muted' as const };

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

      <section className={styles.healthSummary} aria-labelledby="schedule-health-title">
        <div className={styles.healthLead}>
          <span className={styles.healthIcon}><Gauge size={18} /></span>
          <div>
            <span className={styles.sectionKicker}>Plan &amp; schedule health</span>
            <h2 id="schedule-health-title">{projectName ? `${projectName} at a glance` : 'Schedule at a glance'}</h2>
            <p>{scheduleHealth.detail}</p>
          </div>
        </div>
        <div className={styles.healthSignal}>
          <span>Schedule health</span>
          <strong className={styles[scheduleHealth.tone]}>{scheduleHealth.label}</strong>
          <small>Read from authoritative planning evidence</small>
        </div>
        <div className={styles.healthFacts}>
          <div><span>Activities</span><strong>{unavailable ? '—' : taskCount || '—'}</strong><small>{taskCount ? 'across the visible plan' : 'not established'}</small></div>
          <div><span>Progress</span><strong>{unavailable || averageProgress === null ? '—' : `${averageProgress}%`}</strong><small>{averageProgress === null ? 'not established' : 'average completion'}</small></div>
          <div><span>Baseline</span><strong>{unavailable || rows.length === 0 ? '—' : `${baselinedCount}/${rows.length}`}</strong><small>{rows.length && baselinedCount === rows.length ? 'locked plans' : 'coverage'}</small></div>
        </div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.workspaceHead}>
          <div>
            <span className={styles.sectionKicker}>Planning desk</span>
            <h2>{projectName ? 'Gantt chart' : 'Portfolio Gantt chart'}</h2>
            <p>Compare planned dates, baseline commitments and earned progress across the delivery timeline.</p>
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
          <GanttClient schedules={rows} projects={scopedProjects ?? []} wbsNodes={wbsNodes ?? []} resourceCatalog={resourceCatalog ?? []} selectedProjectId={projectId} />
        )}
      </section>

      {projectId && selectedSchedule && resourceBookings !== null && (
        <section className={styles.workspace} aria-label="Resource commitments">
          <div className={styles.workspaceHead}>
            <div>
              <span className={styles.sectionKicker}>Activity commitments</span>
              <h2>Hold capacity for planned work</h2>
              <p>Activity demand remains part of the schedule. Commit it here when the plan is ready to consume shared capacity, then resolve any cross-project conflict explicitly.</p>
            </div>
          </div>
          <ResourceBookingClient projectId={projectId} tasks={selectedSchedule.tasks} catalog={resourceCatalog ?? []} bookings={resourceBookings} />
        </section>
      )}

      {projectId && !unavailable && (
        <section className={styles.workspace} aria-label="Resource planning">
          <div className={styles.workspaceHead}>
            <div>
              <span className={styles.sectionKicker}>Resource planning</span>
              <h2>Level the plan, then accept it</h2>
              <p>Run the solver against capacity and every other project&rsquo;s commitments; review the proposal and promote it to the current plan when it holds.</p>
            </div>
          </div>
          <PlanningRunPanel projectId={projectId} projectName={projectName} />
        </section>
      )}

      {resourcePools !== null && resourceCapacity !== null && (
        <section className={styles.workspace} aria-label="Organization resource capacity">
          <div className={styles.workspaceHead}>
            <div>
              <span className={styles.sectionKicker}>Resource authority</span>
              <h2>Shared teams &amp; capacity</h2>
              <p>Define reusable teams once, declare their availability, and let every project plan against the same source.</p>
            </div>
          </div>
          <ResourcePoolClient
            pools={resourcePools}
            capacity={resourceCapacity}
            suppliers={(suppliers ?? []).filter((supplier) => supplier.status === 'approved' && supplier.category === 'subcontractor')}
          />
        </section>
      )}
    </main>
    </ProjectsSuiteChrome>
  );
}
