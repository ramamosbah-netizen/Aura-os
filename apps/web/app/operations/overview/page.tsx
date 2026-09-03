import Link from 'next/link';
import { Activity, ArrowRight, ArrowUpRight, CheckCircle2, ClipboardCheck, FileCheck2, FilePlus2, HardHat, PencilRuler, Radio, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';
import { getJson } from '@/lib/api';
import styles from './delivery-operations-overview.module.css';

export const dynamic = 'force-dynamic';

interface Project { id: string; title: string; reference?: string | null; status?: string; atRisk?: boolean }
interface Row { id: string; projectId?: string; status?: string; severity?: string }
interface ProjectSchedule { projectId: string; baselineSetAt?: string | null; tasks?: Array<{ percentComplete?: number }> }
type Source<T> = T[] | null;

const countOpen = <T extends { status?: string }>(rows: Source<T>, closed: string[]): number | null => {
  if (rows === null) return null;
  const done = new Set(closed.map((value) => value.toLowerCase()));
  return rows.filter((row) => !done.has((row.status ?? '').toLowerCase())).length;
};
const displayCount = (value: number | null): string => value === null ? 'Unavailable' : String(value);

interface Area { label: string; description: string; href: string; icon: LucideIcon; count: number | null; countLabel: string; secondaryCount?: number | null; secondaryLabel?: string; action: string; owner: string }
interface OperationAction { label: string; description: string; owner: string; href: string; icon: LucideIcon }

export default async function DeliveryOperationsOverviewPage() {
  const [projects, drawings, rfis, reports, instructions, ncrs, permits, commissioning, schedules] = await Promise.all([
    getJson<Project[]>('/api/projects/projects'),
    getJson<Row[]>('/api/engineering/drawings'),
    getJson<Row[]>('/api/engineering/rfis'),
    getJson<Row[]>('/api/site/daily-reports'),
    getJson<Row[]>('/api/site/instructions'),
    getJson<Row[]>('/api/quality/ncrs'),
    getJson<Row[]>('/api/hse/ptws'),
    getJson<Row[]>('/api/commissioning/records'),
    getJson<ProjectSchedule[]>('/api/projects/schedules'),
  ]);

  const activeProjects = projects?.filter((project) => (project.status ?? '').toLowerCase() === 'active') ?? null;
  const atRiskProjects = projects?.filter((project) => project.atRisk) ?? null;
  const openDrawings = countOpen(drawings, ['approved', 'rejected']);
  const openRfis = countOpen(rfis, ['closed']);
  const openReports = countOpen(reports, ['submitted', 'approved']);
  const openInstructions = countOpen(instructions, ['closed', 'acknowledged']);
  const openNcrs = countOpen(ncrs, ['closed']);
  const activePermits = countOpen(permits, ['closed', 'expired']);
  const commissioningOpen = countOpen(commissioning, ['commissioned', 'failed']);

  const operationalSources = [
    { label: 'Projects', rows: projects },
    { label: 'Planning', rows: schedules },
    { label: 'Engineering', rows: drawings },
    { label: 'Site reports', rows: reports },
    { label: 'Instructions', rows: instructions },
    { label: 'Quality', rows: ncrs },
    { label: 'HSE permits', rows: permits },
    { label: 'Commissioning', rows: commissioning },
  ];
  const connectedSources = operationalSources.filter((source) => source.rows !== null).length;
  const allSourcesConnected = connectedSources === operationalSources.length;
  const scheduleByProject = new Map((schedules ?? []).map((schedule) => [schedule.projectId, schedule]));
  const projectReadiness = (projects ?? []).map((project) => {
    const schedule = scheduleByProject.get(project.id);
    const projectDrawings = drawings?.filter((row) => row.projectId === project.id) ?? null;
    const projectNcrs = ncrs?.filter((row) => row.projectId === project.id) ?? null;
    const majorOpenNcr = projectNcrs?.some((row) => row.severity === 'major' && !['closed', 'resolved'].includes((row.status ?? '').toLowerCase())) ?? false;
    return {
      ...project,
      plan: schedule?.baselineSetAt ? 'READY' : schedule ? 'UNKNOWN' : 'UNKNOWN',
      engineering: projectDrawings === null ? 'UNKNOWN' : projectDrawings.length > 0 && projectDrawings.every((row) => row.status === 'approved') ? 'READY' : 'UNKNOWN',
      material: 'UNKNOWN',
      quality: majorOpenNcr ? 'BLOCKED' : 'UNKNOWN',
      hse: 'UNKNOWN',
      readiness: majorOpenNcr ? 'BLOCKED' : 'UNKNOWN',
      readinessReason: majorOpenNcr ? 'Major NCR remains open' : 'Material / discipline evidence not established',
    };
  });
  const executionProjects = (projects ?? []).filter((project) => (project.status ?? '').toLowerCase() === 'active').map((project) => {
    const tasks = scheduleByProject.get(project.id)?.tasks ?? [];
    const progress = tasks.length > 0 ? Math.round(tasks.reduce((sum, task) => sum + (task.percentComplete ?? 0), 0) / tasks.length) : null;
    return { ...project, progress };
  });
  const operationActions: OperationAction[] = [
    { label: 'Work instruction', description: 'Issue a controlled field direction.', owner: 'Site authority', href: '/site/instructions', icon: FilePlus2 },
    { label: 'Daily report', description: 'Record progress, manpower and evidence.', owner: 'Site authority', href: '/site/daily-reports', icon: HardHat },
    { label: 'Technical query', description: 'Raise an RFI against the engineering queue.', owner: 'Engineering authority', href: '/engineering', icon: PencilRuler },
    { label: 'Inspection / NCR', description: 'Start a quality inspection or corrective action.', owner: 'Quality authority', href: '/quality/control', icon: ClipboardCheck },
    { label: 'Permit to work', description: 'Open the HSE permit and risk workflow.', owner: 'HSE authority', href: '/hse/control', icon: ShieldCheck },
    { label: 'Evidence document', description: 'Open the canonical document register.', owner: 'Documents authority', href: '/documents', icon: FileCheck2 },
    { label: 'Test / commissioning', description: 'Record testing and system readiness.', owner: 'Commissioning authority', href: '/commissioning', icon: Wrench },
    { label: 'Handover action', description: 'Open acceptance and closeout evidence.', owner: 'Handover authority', href: '/handover', icon: FileCheck2 },
  ];

  const attention = [
    openRfis && openRfis > 0 ? { label: 'RFIs awaiting response', detail: 'Engineering review queue', value: openRfis, href: '/engineering' } : null,
    openNcrs && openNcrs > 0 ? { label: 'NCRs requiring action', detail: 'Quality corrective-action queue', value: openNcrs, href: '/quality/ncrs' } : null,
    activePermits && activePermits > 0 ? { label: 'Active permits to watch', detail: 'HSE permit register', value: activePermits, href: '/hse/permits' } : null,
    openInstructions && openInstructions > 0 ? { label: 'Open site instructions', detail: 'Field coordination queue', value: openInstructions, href: '/site/instructions' } : null,
  ].filter(Boolean) as Array<{ label: string; detail: string; value: number; href: string }>;

  const areas: Area[] = [
    { label: 'Engineering', description: 'Drawings, RFIs, submittals and technical actions across projects.', href: '/engineering', icon: PencilRuler, count: openDrawings, countLabel: 'open drawings', secondaryCount: openRfis, secondaryLabel: 'RFIs', action: 'Review technical queue', owner: 'Engineering authority' },
    { label: 'Site', description: 'Work instructions, daily reports, progress and site evidence.', href: '/site/control', icon: HardHat, count: openReports, countLabel: 'reports in progress', secondaryCount: openInstructions, secondaryLabel: 'instructions', action: 'Open field control', owner: 'Site authority' },
    { label: 'Quality', description: 'Inspections, NCRs, snags and corrective actions.', href: '/quality/control', icon: ClipboardCheck, count: openNcrs, countLabel: 'open NCRs', action: 'Open quality queue', owner: 'Quality authority' },
    { label: 'HSE', description: 'Permits, incidents, observations and CAPA.', href: '/hse/control', icon: ShieldCheck, count: activePermits, countLabel: 'active permits', action: 'Review safety controls', owner: 'HSE authority' },
    { label: 'Testing & Commissioning', description: 'Tests, witnessed sign-off and system readiness.', href: '/commissioning', icon: Wrench, count: commissioningOpen, countLabel: 'records in progress', action: 'Open readiness queue', owner: 'Commissioning authority' },
    { label: 'Handover', description: 'Acceptance packages and client sign-off across projects.', href: '/handover', icon: FileCheck2, count: null, countLabel: 'open the register', action: 'Open acceptance register', owner: 'Handover authority' },
  ];

  return (
    <main className={styles.page} data-testid="delivery-operations-overview">
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}><span aria-hidden /> AURA OS / DELIVERY OPERATIONS</div>
          <h1>Delivery <span>Operations</span></h1>
          <p>Run the discipline work across every permitted project. Projects owns the plan; these workspaces own execution records.</p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/operations/pre-execution" className={styles.secondary}>Pre-execution <ArrowRight size={14} aria-hidden /></Link>
          <Link href="/operations/reports" className={styles.secondary}>Reports <ArrowRight size={14} aria-hidden /></Link>
          <Link href="/projects/dashboard" className={styles.secondary}>Projects <ArrowRight size={14} aria-hidden /></Link>
          <Link href="/projects/projects" className={styles.primary}>Open project register <ArrowRight size={14} aria-hidden /></Link>
        </div>
      </header>

      <section className={styles.pulse} aria-labelledby="operations-pulse-heading">
        <div className={styles.pulseLead}>
          <div className={styles.pulseIcon}><Activity size={20} aria-hidden /></div>
          <div>
            <div className={styles.kicker}>Live operating signal</div>
            <h2 id="operations-pulse-heading">{allSourcesConnected ? 'All operating feeds are connected' : 'Some operating feeds need attention'}</h2>
            <p>This is the cross-project control room. It composes live signals from each discipline while the source workspaces remain authoritative.</p>
          </div>
        </div>
        <div className={styles.pulseRail}>
          <div className={styles.pulseStat}><span>Source coverage</span><strong>{connectedSources}/{operationalSources.length}</strong><small>{allSourcesConnected ? 'connected' : 'available now'}</small></div>
          <div className={styles.pulseStat}><span>Operating model</span><strong>Live</strong><small>cross-project read</small></div>
          <Link href="/my-work" className={styles.pulseLink}>Open My Work <ArrowUpRight size={14} aria-hidden /></Link>
        </div>
        <div className={styles.sourceList} aria-label="Operations source health">
          {operationalSources.map((source) => <span key={source.label} className={source.rows === null ? styles.sourceUnavailable : styles.sourceConnected}><Radio size={11} aria-hidden />{source.label}<b>{source.rows === null ? 'Unavailable' : 'Connected'}</b></span>)}
        </div>
      </section>

      <section className={styles.metrics} aria-label="Delivery operations summary">
        <Metric label="Active projects" value={displayCount(activeProjects?.length ?? null)} sub="across delivery" />
        <Metric label="Projects needing attention" value={displayCount(atRiskProjects?.length ?? null)} sub="portfolio signal" alert={Boolean(atRiskProjects?.length)} />
        <Metric label="Open RFIs" value={displayCount(openRfis)} sub="engineering" />
        <Metric label="Open NCRs" value={displayCount(openNcrs)} sub="quality" alert={Boolean(openNcrs)} />
        <Metric label="Active permits" value={displayCount(activePermits)} sub="HSE" />
        <Metric label="Commissioning queue" value={displayCount(commissioningOpen)} sub="testing & readiness" />
      </section>

      <section className={styles.actionSection} aria-labelledby="action-heading">
        <div className={styles.sectionHead}><div><div className={styles.kicker}>Execution action center</div><h2 id="action-heading">Start the next operational record</h2><p>Choose the owning workspace; select the project and complete the governed form there.</p></div><span className={styles.actionHint}>No duplicate writers</span></div>
        <div className={styles.actionGrid}>{operationActions.map((item) => { const Icon = item.icon; return <Link key={item.label} href={item.href} className={styles.actionCard}><span className={styles.actionIcon}><Icon size={16} aria-hidden /></span><span className={styles.actionCopy}><small>{item.owner}</small><strong>{item.label}</strong><span>{item.description}</span></span><ArrowUpRight size={14} aria-hidden /></Link>; })}</div>
      </section>

      <section className={styles.readinessSection} aria-labelledby="site-gate-heading">
        <div className={styles.readinessLead}><div className={styles.kicker}>Execution gate</div><h2 id="site-gate-heading">Before site execution</h2><p>Confirm the project has a usable plan, released engineering information, material path and quality / HSE controls before field work begins.</p><div className={styles.readinessNote}><ShieldCheck size={15} aria-hidden /><span>Readiness is a projection, not a separate checklist. The owning systems remain the source of truth.</span></div></div>
        <div className={styles.readinessLinks}>
          <Link href="/projects/schedule"><span><strong>01</strong><b>Plan &amp; baseline</b><small>Projects authority</small></span><ArrowUpRight size={14} aria-hidden /></Link>
          <Link href="/engineering"><span><strong>02</strong><b>Engineering release</b><small>Drawings / RFIs</small></span><ArrowUpRight size={14} aria-hidden /></Link>
          <Link href="/procurement"><span><strong>03</strong> <b>Material path</b><small>Supply Chain authority</small></span><ArrowUpRight size={14} aria-hidden /></Link>
          <Link href="/quality/control"><span><strong>04</strong><b>Quality controls</b><small>Inspection / NCR</small></span><ArrowUpRight size={14} aria-hidden /></Link>
          <Link href="/hse/control"><span><strong>05</strong><b>HSE controls</b><small>Permits / risk</small></span><ArrowUpRight size={14} aria-hidden /></Link>
        </div>
      </section>

      <section className={styles.matrixSection} aria-labelledby="readiness-matrix-heading">
        <div className={styles.sectionHead}><div><div className={styles.kicker}>Readiness projection</div><h2 id="readiness-matrix-heading">Before Site Execution</h2><p>Project-level evidence across the gates that must be reviewed before field work starts.</p></div><span className={styles.actionHint}>No manual READY state</span></div>
        {projectReadiness.length === 0 ? <div className={styles.matrixEmpty}><ShieldCheck size={16} aria-hidden /><span><strong>No readiness rows available</strong><small>Projects and their source evidence will appear here when an authoritative project record is available.</small></span><Link href="/projects/projects">Open Projects register <ArrowUpRight size={13} aria-hidden /></Link></div> : <div className={styles.matrixWrap}><table className={styles.matrix}><thead><tr><th scope="col">Project / work</th><th scope="col">Plan</th><th scope="col">Eng.</th><th scope="col">Material</th><th scope="col">Quality</th><th scope="col">HSE</th><th scope="col">Decision</th><th scope="col">Source</th></tr></thead><tbody>{projectReadiness.slice(0, 10).map((row) => <tr key={row.id}><th scope="row"><Link href={`/project/${row.id}`}>{row.title}</Link><small>{row.status ?? 'status unavailable'}</small></th>{(['plan', 'engineering', 'material', 'quality', 'hse', 'readiness'] as const).map((key) => <td key={key}><span className={`${styles.signal} ${signalClass(row[key])}`}>{row[key]}</span></td>)}<td><span className={styles.reason}>{row.readinessReason}</span></td></tr>)}</tbody></table></div>}
      </section>

      <section className={styles.executionSection} aria-labelledby="active-execution-heading">
        <div className={styles.sectionHead}><div><div className={styles.kicker}>Field delivery</div><h2 id="active-execution-heading">Active execution</h2><p>Progress is read from the project schedule; no progress is inferred when no schedule tasks exist.</p></div><Link href="/site/execution" className={styles.sectionLink}>Open site execution <ArrowRight size={13} aria-hidden /></Link></div>
        {executionProjects.length === 0 ? <div className={styles.matrixEmpty}><HardHat size={16} aria-hidden /><span><strong>No active execution records</strong><small>Active projects with schedule progress will appear here. Create or open a project from the Projects register.</small></span><Link href="/projects/projects">Open Projects register <ArrowUpRight size={13} aria-hidden /></Link></div> : <div className={styles.executionGrid}>{executionProjects.slice(0, 8).map((project) => <Link key={project.id} href={`/project/${project.id}/site`} className={styles.executionRow}><span className={styles.executionMark}><HardHat size={14} aria-hidden /></span><span className={styles.executionName}><strong>{project.title}</strong><small>{project.reference ?? 'Project execution context'}</small></span><span className={styles.executionProgress}><b>{project.progress === null ? 'Unavailable' : `${project.progress}%`}</b><span><i style={{ width: `${project.progress ?? 0}%` }} /></span></span><ArrowUpRight size={14} aria-hidden /></Link>)}</div>}
      </section>

      <section className={styles.section} aria-labelledby="attention-heading">
        <div className={styles.sectionHead}><div><div className={styles.kicker}>Operational attention</div><h2 id="attention-heading">Needs attention</h2><p>Cross-project exceptions from the owning discipline systems.</p></div><Link href="/my-work/approvals" className={styles.sectionLink}>Open actions <ArrowRight size={13} aria-hidden /></Link></div>
        <div className={styles.attentionGrid}>
          <div className={styles.panel}>
            {attention.length === 0 ? <div className={styles.clear}><CheckCircle2 size={17} aria-hidden />No open discipline exceptions are currently reported.</div> : <div className={styles.attentionList}>{attention.map((item) => <Link key={item.label} href={item.href} className={styles.attentionRow}><i className={styles.attentionDot} aria-hidden /><span className={styles.attentionCopy}><strong>{item.label}</strong><small>{item.detail}</small></span><span className={styles.attentionCount}>{item.value}</span><ArrowRight size={14} aria-hidden /></Link>)}</div>}
          </div>
          <div className={styles.panel}>
            <div className={styles.kicker}>Project queue</div><h2 style={{ margin: '5px 0 8px', fontSize: 16 }}>Active projects</h2>
            {activeProjects === null ? <div className={styles.clear}>Project data unavailable.</div> : activeProjects.length === 0 ? <div className={styles.clear}>No active projects.</div> : <div className={styles.projects}>{activeProjects.slice(0, 6).map((project) => <Link key={project.id} href={`/project/${project.id}`} className={styles.projectRow}><span><strong>{project.title}</strong><small>Open Project 360 context</small></span><span className={project.atRisk ? styles.risk : styles.onTrack}>{project.atRisk ? 'At risk' : 'On watch'}</span><ArrowRight size={14} aria-hidden /></Link>)}</div>}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="areas-heading">
        <div className={styles.sectionHead}><div><div className={styles.kicker}>Discipline workspaces</div><h2 id="areas-heading">Operate across projects</h2><p>Each area remains the canonical owner of its records and actions.</p></div></div>
        <div className={styles.areaGrid}>{areas.map((area) => { const Icon = area.icon; const state = area.count === null ? 'Unavailable' : area.count > 0 ? 'Attention' : 'Clear'; const stateClass = area.count === null ? styles.areaStateUnavailable : area.count > 0 ? styles.areaStateAttention : styles.areaStateClear; return <Link key={area.label} href={area.href} className={styles.areaCard}><div className={styles.areaTop}><span className={styles.areaIcon}><Icon size={17} aria-hidden /></span><span className={`${styles.areaState} ${stateClass}`}>{state}</span><ArrowRight size={15} aria-hidden /></div><div className={styles.areaIdentity}><div className={styles.areaCode}>{area.owner}</div><h3>{area.label}</h3><p>{area.description}</p></div><div className={styles.areaStats}><div><strong>{displayCount(area.count)}</strong><span>{area.countLabel}</span></div>{area.secondaryLabel ? <div><strong>{displayCount(area.secondaryCount ?? null)}</strong><span>{area.secondaryLabel}</span></div> : <div className={styles.areaScope}><span>Scope</span><strong>Cross-project</strong></div>}</div><div className={styles.areaAction}><span>{area.action}</span><ArrowUpRight size={14} aria-hidden /></div></Link>; })}</div>
      </section>

      <section className={styles.section} aria-labelledby="flow-heading">
        <div className={styles.sectionHead}><div><div className={styles.kicker}>Execution readiness</div><h2 id="flow-heading">From plan to field</h2><p>Project 360 composes this view; no duplicate readiness record is created here.</p></div></div>
        <div className={styles.flow}>{['Project setup', 'WBS / CBS', 'Schedule', 'Engineering', 'Material', 'Quality / HSE', 'Site execution'].map((step, index) => <div key={step} className={styles.flowStep}><span className={styles.flowDot}>{index + 1}</span><strong>{step}</strong><span>{index < 3 ? 'Projects' : 'Delivery record'}</span></div>)}</div>
        <div className={styles.note}>Readiness is a projection from planning, engineering, supply, quality, HSE and resource evidence. <strong>UNKNOWN</strong> is kept distinct from <strong>BLOCKED</strong> and from zero.</div>
      </section>
    </main>
  );
}

function Metric({ label, value, sub, alert }: { label: string; value: string; sub: string; alert?: boolean }) {
  return <div className={`${styles.metric} ${alert ? styles.metricAlert : ''}`}><div className={styles.metricTop}><span>{label}</span></div><strong>{value}</strong><small>{sub}</small></div>;
}

function signalClass(value: string) {
  if (value === 'READY') return styles.signalReady;
  if (value === 'BLOCKED') return styles.signalBlocked;
  return styles.signalUnknown;
}
