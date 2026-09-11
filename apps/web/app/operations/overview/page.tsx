import Link from 'next/link';
import { ArrowRight, ArrowUpRight, BarChart3, CheckCircle2, CircleAlert, ClipboardCheck, FileCheck2, FilePlus2, HardHat, PencilRuler, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';
import { getJson } from '@/lib/api';
import DeliveryOperationsWorkspaceHeader from '@/components/delivery-operations-workspace-header';
import SuiteShortcutGrid from '@/components/suite-shortcut-grid';
import type { SuiteShortcut } from '@/components/suite-dashboard-shell';
import styles from './delivery-operations-overview.module.css';

// Discipline shortcuts — the same tone-coloured card grid Sales uses at the foot of its cockpit,
// so a reader can jump straight into a discipline workspace from the overview.
const DISCIPLINE_SHORTCUTS: SuiteShortcut[] = [
  { label: 'Engineering', description: 'Drawings, RFIs, submittals, design changes and deliverables', href: '/engineering', icon: PencilRuler, tone: 'blue' },
  { label: 'Site', description: 'Work instructions, daily reports and field execution', href: '/site/control', icon: HardHat, tone: 'amber' },
  { label: 'Quality', description: 'Inspections, NCRs and corrective actions', href: '/quality/control', icon: ClipboardCheck, tone: 'green' },
  { label: 'HSE', description: 'Permits to work and safety governance', href: '/hse/control', icon: ShieldCheck, tone: 'teal' },
  { label: 'Testing & commissioning', description: 'Test records, system readiness and commissioning', href: '/commissioning', icon: Wrench, tone: 'cyan' },
  { label: 'Handover', description: 'Closeout evidence and client acceptance', href: '/handover', icon: FileCheck2, tone: 'violet' },
  { label: 'Reports', description: 'Read-only cross-project delivery views', href: '/operations/reports', icon: BarChart3, tone: 'slate' },
];

export const dynamic = 'force-dynamic';

interface Project { id: string; title: string; reference?: string | null; status?: string; atRisk?: boolean }
interface Row { id: string; projectId?: string; status?: string; severity?: string }
interface ProjectSchedule { projectId: string; baselineSetAt?: string | null; tasks?: Array<{ percentComplete?: number }> }
interface HandoverRow { status?: string }
type Source<T> = T[] | null;
type Discipline = 'all' | 'engineering' | 'site' | 'quality' | 'hse' | 'commissioning';

const countOpen = <T extends { status?: string }>(rows: Source<T>, closed: string[]): number | null => {
  if (rows === null) return null;
  const done = new Set(closed.map((value) => value.toLowerCase()));
  return rows.filter((row) => !done.has((row.status ?? '').toLowerCase())).length;
};
const displayCount = (value: number | null): string => value === null ? 'Unavailable' : String(value);

interface AttentionItem { projectId: string | null; label: string; detail: string; href: string; discipline: Exclude<Discipline, 'all'>; tone: 'critical' | 'attention' }
interface ActionItem { label: string; description: string; href: string; icon: LucideIcon }

export default async function DeliveryOperationsOverviewPage({ searchParams }: { searchParams?: Promise<{ project?: string; discipline?: string; q?: string }> }) {
  const filters = (await searchParams) ?? {};
  const selectedProject = filters.project ?? '';
  const selectedDiscipline: Discipline = ['engineering', 'site', 'quality', 'hse', 'commissioning'].includes(filters.discipline ?? '') ? filters.discipline as Discipline : 'all';
  const query = (filters.q ?? '').trim().toLowerCase();

  const [projects, rfis, instructions, ncrs, permits, schedules, handovers] = await Promise.all([
    getJson<Project[]>('/api/projects/projects'),
    getJson<Row[]>('/api/engineering/rfis'),
    getJson<Row[]>('/api/site/instructions'),
    getJson<Row[]>('/api/quality/ncrs'),
    getJson<Row[]>('/api/hse/ptws'),
    getJson<ProjectSchedule[]>('/api/projects/schedules'),
    getJson<HandoverRow[]>('/api/commissioning/handovers'),
  ]);

  const projectMap = new Map((projects ?? []).map((project) => [project.id, project]));
  const projectMatches = (project: Project) => {
    if (selectedProject && project.id !== selectedProject) return false;
    return !query || [project.title, project.reference, project.status].some((value) => value?.toLowerCase().includes(query));
  };
  const visibleProjects = (projects ?? []).filter(projectMatches);
  const scheduleByProject = new Map((schedules ?? []).map((schedule) => [schedule.projectId, schedule]));
  const readinessRows = projects === null ? null : projects.map((project) => {
    const schedule = scheduleByProject.get(project.id);
    const projectNcrs = ncrs?.filter((row) => row.projectId === project.id) ?? null;
    const majorOpenNcr = projectNcrs?.some((row) => row.severity === 'major' && !['closed', 'resolved'].includes((row.status ?? '').toLowerCase())) ?? false;
    return { ...project, overall: majorOpenNcr ? 'BLOCKED' : 'UNKNOWN', reason: majorOpenNcr ? 'Major open NCR is an evidenced blocker.' : 'Material, HSE or discipline evidence is not established.', plan: schedule?.baselineSetAt ? 'READY' : 'UNKNOWN' };
  }).filter(projectMatches);
  const executionProjects = visibleProjects.filter((project) => (project.status ?? '').toLowerCase() === 'active').map((project) => {
    const tasks = scheduleByProject.get(project.id)?.tasks ?? [];
    const progress = tasks.length > 0 ? Math.round(tasks.reduce((sum, task) => sum + (task.percentComplete ?? 0), 0) / tasks.length) : null;
    return { ...project, progress };
  });

  const openRfis = countOpen(rfis, ['closed']);
  const openInstructions = countOpen(instructions, ['closed', 'acknowledged']);
  const openNcrs = countOpen(ncrs, ['closed']);
  const activePermits = countOpen(permits, ['closed', 'expired']);
  const actionParts = [openRfis, openNcrs, activePermits, openInstructions];
  const actionValues = actionParts.filter((value): value is number => value !== null);
  const needsAction = actionValues.length === actionParts.length ? actionValues.reduce((sum, value) => sum + value, 0) : null;
  const handoverCount = handovers === null ? null : handovers.filter((row) => !['accepted', 'complete', 'completed'].includes((row.status ?? '').toLowerCase())).length;
  const blockedCount = readinessRows?.filter((row) => row.overall === 'BLOCKED').length ?? null;
  const activeWork = projects === null ? null : executionProjects.length;
  const attention = buildAttention({ rfis, ncrs, permits, instructions, projectMap, selectedProject, selectedDiscipline, query });

  const actions: Array<{ group: string; items: ActionItem[] }> = [
    { group: 'Site', items: [{ label: 'Work instruction', description: 'Issue a controlled field direction.', href: '/site/instructions', icon: FilePlus2 }, { label: 'Daily report', description: 'Record progress and site evidence.', href: '/site/daily-reports', icon: HardHat }] },
    { group: 'Engineering', items: [{ label: 'RFI / technical query', description: 'Raise a question against the engineering queue.', href: '/engineering', icon: PencilRuler }] },
    { group: 'Quality', items: [{ label: 'Inspection / NCR', description: 'Start an inspection or corrective action.', href: '/quality/control', icon: CheckCircle2 }] },
    { group: 'HSE', items: [{ label: 'Permit to work', description: 'Open the governed permit workflow.', href: '/hse/control', icon: ShieldCheck }] },
    { group: 'Testing', items: [{ label: 'Test / commissioning', description: 'Record testing and system readiness.', href: '/commissioning', icon: Wrench }] },
    { group: 'Evidence', items: [{ label: 'Document / evidence', description: 'Open the canonical document register.', href: '/documents', icon: FileCheck2 }] },
  ];

  return (
    <main className={styles.page} data-testid="delivery-operations-overview">
      <DeliveryOperationsWorkspaceHeader
        active="overview"
        title="Execution Command Center"
        description="See what is working now, what is blocked, and where your decision is needed across active projects."
        owner="Delivery Operations composition layer"
      />
      <div className={styles.overviewActionBar}>
        <details className={styles.actionMenu}><summary className={styles.primary}>+ Delivery Action</summary><div className={styles.actionPopover}>{actions.map((group) => <div key={group.group} className={styles.actionGroup}><span>{group.group}</span>{group.items.map((item) => { const Icon = item.icon; return <Link key={item.label} href={item.href} className={styles.actionItem}><Icon size={14} aria-hidden /><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowUpRight size={13} aria-hidden /></Link>; })}</div>)}</div></details>
      </div>

      <form method="get" className={styles.filters} aria-label="Filter execution command center"><label><span>Project</span><select name="project" defaultValue={selectedProject}><option value="">All projects</option>{(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label><label><span>Discipline</span><select name="discipline" defaultValue={selectedDiscipline}><option value="all">All disciplines</option><option value="engineering">Engineering</option><option value="site">Site</option><option value="quality">Quality</option><option value="hse">HSE</option><option value="commissioning">Testing &amp; commissioning</option></select></label><label className={styles.searchField}><span>Search</span><input name="q" defaultValue={filters.q ?? ''} placeholder="Project or reference…" /></label><button type="submit" className={styles.filterButton}>Apply</button>{(selectedProject || selectedDiscipline !== 'all' || query) && <Link href="/operations/overview" className={styles.reset}>Reset</Link>}</form>

      <section className={styles.metrics} aria-label="Delivery operations summary"><Metric label="Active work" value={displayCount(activeWork)} tone="accent" /><Metric label="Blocked" value={displayCount(blockedCount)} tone="critical" /><Metric label="Needs action" value={displayCount(needsAction)} tone="attention" /><Metric label="Handover" value={displayCount(handoverCount)} tone="good" /></section>

      <section className={styles.section} aria-label="Needs your attention"><SectionHead kicker="Decision queue" title="Needs your attention" linkHref="/my-work/approvals" linkLabel="View all" /><div className={styles.panel}>{attention === null ? <Unavailable message="Attention signals are unavailable from one or more owning workspaces." /> : attention.length === 0 ? <div className={styles.clear}><CheckCircle2 size={17} aria-hidden />No open execution exceptions match these filters.</div> : <div className={styles.attentionList}>{attention.slice(0, 6).map((item) => <Link key={`${item.discipline}-${item.projectId ?? 'portfolio'}`} href={item.href} className={styles.attentionRow}><span className={`${styles.attentionDot} ${item.tone === 'critical' ? styles.attentionCritical : ''}`} aria-hidden /><span className={styles.attentionCopy}><strong>{item.label}</strong><small>{item.detail}</small></span><span className={styles.attentionAction}>{item.discipline === 'quality' ? 'Resolve' : 'Review'} <ArrowRight size={13} aria-hidden /></span></Link>)}</div>}{attention && attention.length > 6 && <Link href="/my-work/approvals" className={styles.moreLink}>View all attention signals <ArrowRight size={13} aria-hidden /></Link>}</div></section>

      <section className={styles.section} aria-label="Active execution"><SectionHead kicker="Live delivery" title="Active execution" linkHref="/site/execution" linkLabel="View all" /><div className={styles.panel}>{executionProjects.length === 0 ? <div className={styles.empty}><HardHat size={18} aria-hidden /><strong>No active execution records</strong><span>Active projects with schedule progress will appear here. No placeholder progress has been added.</span><Link href="/projects/projects">Open Projects register <ArrowUpRight size={13} aria-hidden /></Link></div> : <div className={styles.executionList}>{executionProjects.slice(0, 6).map((project) => <Link key={project.id} href={`/project/${project.id}/site`} className={styles.executionRow}><span className={styles.executionName}><strong>{project.title}</strong><small>{project.reference ?? 'Project execution context'}</small></span><span className={styles.executionProgress}><b>{project.progress === null ? 'Unavailable' : `${project.progress}%`}</b><span><i style={{ width: `${project.progress ?? 0}%` }} /></span></span><span className={styles.executionStatus}>{project.progress === null ? 'Not established' : 'In progress'}</span><ArrowUpRight size={14} aria-hidden /></Link>)}</div>}</div></section>

      <section className={styles.section} aria-label="Upcoming and pre-execution"><SectionHead kicker="Start safely" title="Upcoming / pre-execution" linkHref="/operations/pre-execution" linkLabel="Pre-execution" /><div className={styles.panel}>{readinessRows === null ? <Unavailable message="Readiness projection is unavailable because the Projects source did not respond." /> : readinessRows.length === 0 ? <div className={styles.empty}><ShieldCheck size={18} aria-hidden /><strong>No upcoming work matches these filters</strong><span>Readiness appears when an authoritative project record exists.</span><Link href="/projects/projects">Open Projects register <ArrowUpRight size={13} aria-hidden /></Link></div> : <div className={styles.upcomingList}>{readinessRows.slice(0, 8).map((row) => <Link key={row.id} href={`/operations/pre-execution?project=${encodeURIComponent(row.id)}`} className={styles.upcomingRow}><span><strong>{row.title}</strong><small>{row.reference ?? 'Project preparation'}</small></span><span className={`${styles.signal} ${signalClass(row.overall)}`}>{row.overall}</span><ArrowUpRight size={14} aria-hidden /></Link>)}</div>}</div></section>

      <SuiteShortcutGrid kicker="Delivery Operations workspaces" title="Discipline workspaces" items={DISCIPLINE_SHORTCUTS} itemTestId="operations-shortcut" tabType="Delivery Operations" titleId="operations-tools-title" />

      <footer className={styles.footerNote}><CircleAlert size={14} aria-hidden /><span>Overview is a summary and exception surface. Detailed records and actions remain in Engineering, Site, Quality, HSE, Testing &amp; Commissioning and Handover.</span></footer>
    </main>
  );
}

function buildAttention({ rfis, ncrs, permits, instructions, projectMap, selectedProject, selectedDiscipline, query }: { rfis: Source<Row>; ncrs: Source<Row>; permits: Source<Row>; instructions: Source<Row>; projectMap: Map<string, Project>; selectedProject: string; selectedDiscipline: Discipline; query: string }): AttentionItem[] | null {
  if ([rfis, ncrs, permits, instructions].some((source) => source === null)) return null;
  const items: AttentionItem[] = [];
  const add = (rows: Row[], discipline: Exclude<Discipline, 'all'>, closed: string[], label: string, href: string, tone: AttentionItem['tone']) => {
    if (selectedDiscipline !== 'all' && selectedDiscipline !== discipline) return;
    const grouped = new Map<string, number>();
    for (const row of rows.filter((item) => !closed.includes((item.status ?? '').toLowerCase()))) { const id = row.projectId ?? 'portfolio'; if (!selectedProject || id === selectedProject) grouped.set(id, (grouped.get(id) ?? 0) + 1); }
    for (const [projectId, count] of grouped) { const project = projectMap.get(projectId); if (query && project && ![project.title, project.reference].some((value) => value?.toLowerCase().includes(query))) continue; items.push({ projectId: projectId === 'portfolio' ? null : projectId, label: project ? `${project.title} · ${label}` : label, detail: `${count} open ${label.toLowerCase()} item${count === 1 ? '' : 's'}`, href, discipline, tone }); }
  };
  add(rfis ?? [], 'engineering', ['closed'], 'RFI queue', '/engineering', 'attention');
  add(ncrs ?? [], 'quality', ['closed', 'resolved'], 'NCR queue', '/quality/control', 'critical');
  add(permits ?? [], 'hse', ['closed', 'expired'], 'permit queue', '/hse/control', 'attention');
  add(instructions ?? [], 'site', ['closed', 'acknowledged'], 'site instruction queue', '/site/control', 'attention');
  return items;
}

function SectionHead({ kicker, title, linkHref, linkLabel }: { kicker: string; title: string; linkHref: string; linkLabel: string }) { return <div className={styles.sectionHead}><div><div className={styles.kicker}>{kicker}</div><h2>{title}</h2></div><Link href={linkHref} className={styles.sectionLink}>{linkLabel} <ArrowRight size={13} aria-hidden /></Link></div>; }
function Metric({ label, value, tone }: { label: string; value: string; tone: 'accent' | 'critical' | 'attention' | 'good' }) { return <div className={`${styles.metric} ${styles[`metric${tone[0].toUpperCase()}${tone.slice(1)}`]}`}><span>{label}</span><strong>{value}</strong></div>; }
function Unavailable({ message }: { message: string }) { return <div className={styles.unavailable}><CircleAlert size={16} aria-hidden /><span>{message}</span></div>; }
function signalClass(value: string) { if (value === 'READY') return styles.signalReady; if (value === 'BLOCKED') return styles.signalBlocked; return styles.signalUnknown; }
