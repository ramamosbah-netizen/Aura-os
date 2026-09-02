import Link from 'next/link';
import { ArrowRight, CheckCircle2, ClipboardCheck, FileCheck2, HardHat, PencilRuler, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';
import { getJson } from '@/lib/api';
import styles from './delivery-operations-overview.module.css';

export const dynamic = 'force-dynamic';

interface Project { id: string; title: string; status?: string; atRisk?: boolean }
interface Row { id: string; projectId?: string; status?: string; severity?: string }
type Source<T> = T[] | null;

const countOpen = <T extends { status?: string }>(rows: Source<T>, closed: string[]): number | null => {
  if (rows === null) return null;
  const done = new Set(closed.map((value) => value.toLowerCase()));
  return rows.filter((row) => !done.has((row.status ?? '').toLowerCase())).length;
};
const displayCount = (value: number | null): string => value === null ? 'Unavailable' : String(value);

interface Area { label: string; description: string; href: string; icon: LucideIcon; count: number | null; countLabel: string }

export default async function DeliveryOperationsOverviewPage() {
  const [projects, drawings, rfis, reports, instructions, ncrs, permits, commissioning] = await Promise.all([
    getJson<Project[]>('/api/projects/projects'),
    getJson<Row[]>('/api/engineering/drawings'),
    getJson<Row[]>('/api/engineering/rfis'),
    getJson<Row[]>('/api/site/daily-reports'),
    getJson<Row[]>('/api/site/instructions'),
    getJson<Row[]>('/api/quality/ncrs'),
    getJson<Row[]>('/api/hse/ptws'),
    getJson<Row[]>('/api/commissioning/records'),
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

  const attention = [
    openRfis && openRfis > 0 ? { label: 'RFIs awaiting response', detail: 'Engineering review queue', value: openRfis, href: '/engineering' } : null,
    openNcrs && openNcrs > 0 ? { label: 'NCRs requiring action', detail: 'Quality corrective-action queue', value: openNcrs, href: '/quality/ncrs' } : null,
    activePermits && activePermits > 0 ? { label: 'Active permits to watch', detail: 'HSE permit register', value: activePermits, href: '/hse/permits' } : null,
    openInstructions && openInstructions > 0 ? { label: 'Open site instructions', detail: 'Field coordination queue', value: openInstructions, href: '/site/instructions' } : null,
  ].filter(Boolean) as Array<{ label: string; detail: string; value: number; href: string }>;

  const areas: Area[] = [
    { label: 'Engineering', description: 'Drawings, RFIs, submittals and technical actions across projects.', href: '/engineering', icon: PencilRuler, count: openDrawings, countLabel: 'open drawings' },
    { label: 'Site', description: 'Work instructions, daily reports, progress and site evidence.', href: '/site/control', icon: HardHat, count: openReports, countLabel: 'reports in progress' },
    { label: 'Quality', description: 'Inspections, NCRs, snags and corrective actions.', href: '/quality/control', icon: ClipboardCheck, count: openNcrs, countLabel: 'open NCRs' },
    { label: 'HSE', description: 'Permits, incidents, observations and CAPA.', href: '/hse/control', icon: ShieldCheck, count: activePermits, countLabel: 'active permits' },
    { label: 'Testing & Commissioning', description: 'Tests, witnessed sign-off and system readiness.', href: '/commissioning', icon: Wrench, count: commissioningOpen, countLabel: 'records in progress' },
    { label: 'Handover', description: 'Acceptance packages and client sign-off across projects.', href: '/handover', icon: FileCheck2, count: null, countLabel: 'open the register' },
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
          <Link href="/projects/dashboard" className={styles.secondary}>Projects <ArrowRight size={14} aria-hidden /></Link>
          <Link href="/projects/projects" className={styles.primary}>Open project register <ArrowRight size={14} aria-hidden /></Link>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Delivery operations summary">
        <Metric label="Active projects" value={displayCount(activeProjects?.length ?? null)} sub="across delivery" />
        <Metric label="Projects needing attention" value={displayCount(atRiskProjects?.length ?? null)} sub="portfolio signal" alert={Boolean(atRiskProjects?.length)} />
        <Metric label="Open RFIs" value={displayCount(openRfis)} sub="engineering" />
        <Metric label="Open NCRs" value={displayCount(openNcrs)} sub="quality" alert={Boolean(openNcrs)} />
        <Metric label="Active permits" value={displayCount(activePermits)} sub="HSE" />
        <Metric label="Commissioning queue" value={displayCount(commissioningOpen)} sub="testing & readiness" />
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
        <div className={styles.areaGrid}>{areas.map((area) => { const Icon = area.icon; return <Link key={area.label} href={area.href} className={styles.areaCard}><div className={styles.areaTop}><span className={styles.areaIcon}><Icon size={17} aria-hidden /></span><ArrowRight size={15} aria-hidden /></div><div><h3>{area.label}</h3><p>{area.description}</p></div><div className={styles.areaFoot}><strong>{displayCount(area.count)}</strong><span>{area.countLabel}</span></div></Link>; })}</div>
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
