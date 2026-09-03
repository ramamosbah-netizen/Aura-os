'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Gauge,
  GitBranch,
  Layers3,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import styles from './project-controls-dashboard.module.css';

export interface ControlProject {
  id: string;
  title: string;
  status: 'planned' | 'active' | 'completed' | 'cancelled' | string;
  value: number;
  accountName: string | null;
  contractTitle: string | null;
  evm: {
    budgetAtCompletion: number | null;
    earnedValue: number | null;
    actualCost: number | null;
    costVariance: number | null;
    cpi: number | null;
    spi: number | null;
  };
  atRisk: boolean;
}

export interface ControlSchedule {
  projectId: string;
  tasks: Array<{ percentComplete: number }>;
  baselineSetAt: string | null;
}

const percent = (value: number | null | undefined): string => value === null || value === undefined || !Number.isFinite(value) ? '—' : `${Math.round(value)}%`;

function health(project: ControlProject, schedule: ControlSchedule | undefined) {
  return {
    plan: schedule?.baselineSetAt ? 'Locked' : schedule ? 'Draft' : '—',
    schedule: project.evm.spi === null ? '—' : project.evm.spi < 1 ? 'Attention' : 'Healthy',
    cost: project.evm.cpi === null ? '—' : project.evm.cpi < 1 ? 'Attention' : 'Healthy',
    evm: project.evm.earnedValue === null || project.evm.budgetAtCompletion === null ? '—' : percent((project.evm.earnedValue / Math.max(1, project.evm.budgetAtCompletion)) * 100),
  };
}

export default function ProjectControlsDashboard({ projects, schedules }: { projects: ControlProject[] | null; schedules: ControlSchedule[] | null }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const scheduleByProject = useMemo(() => new Map((schedules ?? []).map((item) => [item.projectId, item])), [schedules]);
  const rows = projects ?? [];
  const filtered = useMemo(() => rows.filter((project) => {
    const text = `${project.title} ${project.accountName ?? ''} ${project.contractTitle ?? ''}`.toLowerCase();
    return (!query.trim() || text.includes(query.trim().toLowerCase())) && (status === 'all' || project.status === status);
  }), [query, rows, status]);
  const active = rows.filter((project) => project.status === 'active');
  const atRisk = rows.filter((project) => project.atRisk);
  const scheduleKnown = rows.filter((project) => project.evm.spi !== null);
  const costKnown = rows.filter((project) => project.evm.cpi !== null);
  const scheduleHealthy = scheduleKnown.filter((project) => (project.evm.spi ?? 0) >= 1).length;
  const costHealthy = costKnown.filter((project) => (project.evm.cpi ?? 0) >= 1).length;
  const baselined = rows.filter((project) => scheduleByProject.get(project.id)?.baselineSetAt).length;
  const progressValues = rows.flatMap((project) => project.evm.budgetAtCompletion && project.evm.budgetAtCompletion > 0 && project.evm.earnedValue !== null ? [(project.evm.earnedValue / project.evm.budgetAtCompletion) * 100] : []);
  const avgProgress = progressValues.length ? progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length : null;
  const signals = [
    ...atRisk.slice(0, 4).map((project) => ({ id: `risk-${project.id}`, tone: 'bad', title: project.title, detail: project.evm.spi !== null && project.evm.spi < 1 ? 'Schedule is behind plan' : 'Cost performance needs review', href: `/project/${project.id}/controls` })),
    ...rows.filter((project) => !scheduleByProject.get(project.id)?.baselineSetAt).slice(0, 3).map((project) => ({ id: `baseline-${project.id}`, tone: 'warn', title: project.title, detail: 'Baseline not locked', href: `/projects/schedule?projectId=${project.id}` })),
  ].slice(0, 5);

  return (
    <main className={styles.page} data-testid="project-controls-dashboard">
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}><span>AURA OS / PROJECTS</span><i /> TECHNICAL CONTROL ROOM</div>
          <h1>See the work. <em>Steer the outcome.</em></h1>
          <p>A decision surface for technical health across the portfolio — not another project register. Select a signal to open the owning project workspace.</p>
        </div>
        <div className={styles.heroLinks}><Link href="/projects/projects" className={styles.heroLink}><Layers3 size={15} /> Projects</Link><Link href="/projects/schedule" className={styles.heroLink}><CalendarRange size={15} /> Schedule</Link></div>
      </header>

      <section className={styles.kpiBand} aria-label="Technical health KPIs">
        <div className={styles.kpiLead}><span className={styles.kpiLeadIcon}><Activity size={20} /></span><div><span>Portfolio control health</span><strong>{projects === null ? '—' : !rows.length ? 'Awaiting projects' : atRisk.length ? 'Needs attention' : 'Steady state'}</strong><small>{projects === null ? 'Data unavailable' : `${active.length} active project${active.length === 1 ? '' : 's'} under technical control`}</small></div></div>
        <Kpi label="Schedule" value={projects === null || !scheduleKnown.length ? '—' : `${scheduleHealthy}/${scheduleKnown.length}`} hint="healthy SPI" icon={Workflow} tone="blue" />
        <Kpi label="Cost" value={projects === null || !costKnown.length ? '—' : `${costHealthy}/${costKnown.length}`} hint="healthy CPI" icon={CircleDollarSign} tone="violet" />
        <Kpi label="Progress" value={projects === null ? '—' : percent(avgProgress)} hint="EV ÷ BAC" icon={Gauge} tone="green" />
        <Kpi label="Baselines" value={projects === null || schedules === null || !rows.length ? '—' : `${baselined}/${rows.length}`} hint="locked plans" icon={ClipboardCheck} tone="amber" />
      </section>

      <section className={styles.flow} aria-label="Delivery control flow"><div className={styles.flowTitle}><span className={styles.kicker}>Delivery control flow</span><strong>Move from signal to action</strong></div>{[['Plan','WBS / schedule'],['Supply','Material readiness'],['Build','Site execution'],['Assure','Quality & HSE'],['Close','Handover']].map(([title, detail], index) => <div className={styles.flowStage} key={title}><span className={styles.flowNumber}>0{index + 1}</span><strong>{title}</strong><small>{detail}</small>{index < 4 && <ArrowRight size={14} />}</div>)}</section>

      <section className={styles.controlGrid}>
        <div className={styles.matrixPanel}>
          <div className={styles.panelHead}><div><span className={styles.kicker}>Portfolio signal matrix</span><h2>Technical health by project</h2><p>Each status links to the project context or the owning discipline workspace.</p></div><span className={styles.scopePill}><span />{projects === null ? 'Unavailable' : `${filtered.length} in view`}</span></div>
          <div className={styles.filters}><label className={styles.search}><Search size={15} /><span className={styles.srOnly}>Search projects</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a project, customer or contract" /></label><div className={styles.statusFilters} role="group" aria-label="Filter projects by status"><SlidersHorizontal size={14} aria-hidden />{[['all', 'All'], ['planned', 'Planned'], ['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([value, label]) => <button type="button" key={value} className={status === value ? styles.statusActive : ''} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}</div></div>
          {projects === null ? <Empty icon={ShieldAlert} title="Technical feed unavailable" detail="The project control service could not be reached." /> : filtered.length === 0 ? <Empty icon={Search} title={rows.length ? 'No matching projects' : 'No projects in this workspace'} detail={rows.length ? 'Adjust the search or status filter.' : 'Projects created from an approved handover will appear here.'} /> : <div className={styles.matrixWrap}><table className={styles.matrix}><thead><tr><th>Project</th><th>Plan</th><th>Schedule</th><th>Cost</th><th>Progress</th><th aria-label="Open" /></tr></thead><tbody>{filtered.map((project) => { const state = health(project, scheduleByProject.get(project.id)); return <tr key={project.id}><td><Link href={`/project/${project.id}`} className={styles.project}><span className={styles.projectIcon}><Layers3 size={14} /></span><span><strong>{project.title}</strong><small>{project.accountName ?? project.contractTitle ?? 'No commercial context'}</small></span></Link></td><td><Signal value={state.plan} good={state.plan === 'Locked'} /></td><td><Signal value={state.schedule} good={state.schedule === 'Healthy'} /></td><td><Signal value={state.cost} good={state.cost === 'Healthy'} /></td><td><span className={styles.progress}>{state.evm}<i><b style={{ width: `${Math.min(100, Math.max(0, project.evm.budgetAtCompletion && project.evm.earnedValue !== null ? (project.evm.earnedValue / project.evm.budgetAtCompletion) * 100 : 0))}%` }} /></i></span></td><td><Link href={`/project/${project.id}/controls`} className={styles.open}>Open controls <ArrowRight size={13} /></Link></td></tr>; })}</tbody></table></div>}
        </div>
        <aside className={styles.sideStack}>
          <div className={styles.signalPanel}><div className={styles.panelHead}><div><span className={styles.kicker}>Priority signals</span><h2>What needs a decision?</h2></div><ShieldAlert size={18} className={styles.signalIcon} /></div>{signals.length ? <div className={styles.signalList}>{signals.map((signal) => <Link key={signal.id} href={signal.href} className={styles.signalRow}><i className={signal.tone === 'bad' ? styles.badDot : styles.warnDot} /><span><strong>{signal.title}</strong><small>{signal.detail}</small></span><ArrowRight size={13} /></Link>)}</div> : <div className={styles.signalEmpty}><CheckCircle2 size={20} /><span>{projects === null ? 'Signals unavailable' : 'No priority signals'}</span></div>}</div>
          <div className={styles.quickPanel}><span className={styles.kicker}>Control surfaces</span><h2>Jump to the source</h2><Link href="/projects/schedule"><CalendarRange size={15} /><span><strong>Planning &amp; schedule</strong><small>Baseline and activity health</small></span><ArrowRight size={13} /></Link><Link href="/projects/variations"><GitBranch size={15} /><span><strong>Changes &amp; variations</strong><small>Governed commercial impact</small></span><ArrowRight size={13} /></Link><Link href="/operations/overview"><Layers3 size={15} /><span><strong>Delivery operations</strong><small>Engineering, Site, Quality and HSE</small></span><ArrowRight size={13} /></Link></div>
        </aside>
      </section>
      <footer className={styles.footer}><Layers3 size={14} /><span><strong>Projects owns the control view.</strong> Specialist records remain authoritative in their own domains.</span></footer>
    </main>
  );
}

function Kpi({ icon: Icon, tone, label, value, hint }: { icon: LucideIcon; tone: string; label: string; value: string; hint: string }) { return <div className={styles.kpi}><span className={`${styles.kpiIcon} ${styles[tone]}`}><Icon size={16} /></span><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></div>; }
function Signal({ value, good }: { value: string; good: boolean }) { return <span className={`${styles.signal} ${good ? styles.signalGood : value === '—' ? styles.signalUnknown : styles.signalWarn}`}><i />{value}</span>; }
function Empty({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) { return <div className={styles.empty}><Icon size={22} /><strong>{title}</strong><span>{detail}</span></div>; }
