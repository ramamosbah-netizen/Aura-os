import Link from 'next/link';
import {
  ArrowRight,
  Wrench,
} from 'lucide-react';
import { getJson } from '@/lib/api';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import { filterAreaRows, PROJECT_AREAS } from '@/lib/project-areas';
import { computeDigest } from '@/lib/project-digest';
import { ELV_DISCIPLINES } from '@/lib/project-scope';
import styles from './project-overview.module.css';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown> & { projectId?: string };

interface ProjectHead {
  id: string;
  title: string;
  reference: string | null;
  contractId: string | null;
  contractTitle: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

interface VariationSummary {
  impact?: { originalValue: number; approvedAdditions: number; approvedOmissions: number; revisedValue: number; approvedCount: number; pendingCount: number };
}

interface ScheduleSummary { projectId: string; tasks?: Array<{ percentComplete?: number }>; baselineSetAt?: string | null; }
interface EvmSummary { budgetAtCompletion: number | null; earnedValue: number | null; actualCost: number | null; cpi: number | null; spi: number | null; plannedValueStatus?: 'available' | 'unavailable'; }
interface CertificateSummary { summary?: { grossCertifiedToDate: number; percentComplete: number } | null; }
interface CloseoutLite { id: string; status: string; items: Array<{ done: boolean }>; }

const aed = (value: number): string => Math.round(value).toLocaleString('en-AE');
const fmt = (iso: string): string => new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' });

const SUBCONTRACT_OPEN_STATUSES = new Set(['draft', 'active', 'submitted', 'in_progress', 'pending']);

async function areaRows(endpoint: string, projectId: string, disciplineId?: string): Promise<Row[]> {
  const data = await getJson<Row[]>(endpoint);
  const scoped = (Array.isArray(data) ? data : []).filter((row) => row.projectId === projectId);
  return filterAreaRows(scoped, disciplineId);
}

export default async function ProjectOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ discipline?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const project = await getJson<ProjectHead>(`/api/projects/projects/${encodeURIComponent(projectId)}`);
  const disciplineId = query.discipline;
  const discipline = ELV_DISCIPLINES.find((item) => item.id === disciplineId);
  const scopeQuery = disciplineId ? `?discipline=${encodeURIComponent(disciplineId)}` : '';

  const [areaData, subcontractRows, scheduleRows, variationSummary, evm, certificateSummary, closeoutRows] = await Promise.all([
    Promise.all(
      PROJECT_AREAS.map(async (area) => ({
        area,
        rows: await areaRows(area.endpoint, projectId, disciplineId),
      })),
    ),
    getJson<Row[]>(`/api/subcontracts?projectId=${encodeURIComponent(projectId)}`),
    getJson<ScheduleSummary[]>(`/api/projects/schedules?projectId=${encodeURIComponent(projectId)}`),
    getJson<VariationSummary>(`/api/projects/variations/summary/${encodeURIComponent(projectId)}`),
    getJson<EvmSummary>(`/api/projects/projects/${encodeURIComponent(projectId)}/evm`),
    project?.contractId ? getJson<CertificateSummary>(`/api/contracts/certificates/summary/${encodeURIComponent(project.contractId)}`) : Promise.resolve(null),
    getJson<CloseoutLite[]>(`/api/projects/closeouts?projectId=${encodeURIComponent(projectId)}`),
  ]);
  const bySlug: Record<string, Row[]> = Object.fromEntries(areaData.map((data) => [data.area.slug, data.rows]));
  const scopedSubcontracts = Array.isArray(subcontractRows) ? subcontractRows : null;
  const openSubcontracts = scopedSubcontracts?.filter((row) => SUBCONTRACT_OPEN_STATUSES.has(String(row.status ?? '').toLowerCase())).length ?? null;

  // Read-only activity composition from records owned by the delivery domains. No duplicate
  // ProjectNotes or project-history writer is introduced here.
  const activity = areaData
    .flatMap(({ area, rows }) => rows.map((row) => ({
      area,
      label: String(row.title ?? row.name ?? row.reference ?? row.code ?? row.ncrNumber ?? row.documentNumber ?? area.entity),
      timestamp: String(row.createdAt ?? row.updatedAt ?? row.date ?? ''),
    })))
    .filter((item) => Number.isFinite(Date.parse(item.timestamp)))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 8);

  const digest = computeDigest({
    drawings: bySlug.engineering ?? [],
    dailyReports: bySlug.site ?? [],
    ncrs: bySlug.quality ?? [],
    permits: bySlug.hse ?? [],
    commissioning: bySlug.commissioning ?? [],
    documents: bySlug.documents ?? [],
  });
  const projectTitle = project?.title ?? 'Project 360';
  const schedule = Array.isArray(scheduleRows) ? scheduleRows[0] : null;
  const scheduleProgress = schedule?.tasks?.length ? Math.round(schedule.tasks.reduce((sum, task) => sum + (Number(task.percentComplete) || 0), 0) / schedule.tasks.length) : null;
  const approvedChanges = variationSummary?.impact ? variationSummary.impact.approvedAdditions - variationSummary.impact.approvedOmissions : null;
  const currentValue = variationSummary?.impact?.revisedValue ?? null;
  const closeout = Array.isArray(closeoutRows) ? closeoutRows[0] ?? null : null;
  const closeoutDone = closeout ? closeout.items.filter((item) => item.done).length : 0;

  const projectBase = `/project/${encodeURIComponent(projectId)}`;
  const healthProgress = scheduleProgress === null ? 'Not established' : `${scheduleProgress}%`;
  const scheduleHealth = evm?.plannedValueStatus === 'unavailable' || evm?.spi === null || evm?.spi === undefined ? 'Unavailable' : evm.spi >= 1 ? 'On track' : 'Behind schedule';
  const costValue = evm?.actualCost == null || evm?.budgetAtCompletion == null ? 'Not established' : `AED ${aed(evm.actualCost)} / AED ${aed(evm.budgetAtCompletion)}`;
  const completionValue = closeout ? `${closeoutDone}/${closeout.items.length} items` : 'Not established';
  const deliveryRows = [
    ...areaData.map(({ area, rows }) => ({ label: area.label, status: rows.length ? `${rows.length} connected` : 'Not established', href: `${projectBase}/${area.slug}${scopeQuery}` })),
    { label: 'Procurement', status: 'Not established', href: `/procurement/purchase-requests?projectId=${encodeURIComponent(projectId)}` },
    { label: 'Subcontracts', status: scopedSubcontracts === null ? 'Unavailable' : scopedSubcontracts.length ? `${openSubcontracts ?? scopedSubcontracts.length} open` : 'Not established', href: `/subcontracts/subcontracts?projectId=${encodeURIComponent(projectId)}` },
  ];
  const phases = [
    { label: 'Mobilization', state: 'Project linked' },
    { label: 'Engineering', state: bySlug.engineering?.length ? 'Evidence linked' : 'Not established' },
    { label: 'Procurement', state: 'Not established' },
    { label: 'Execution', state: bySlug.site?.length ? 'Evidence linked' : 'Not established' },
    { label: 'T&C', state: bySlug.commissioning?.length ? 'Evidence linked' : 'Not established' },
    { label: 'Handover', state: closeout ? 'Checklist linked' : 'Not established' },
  ];

  return (
    <main className={styles.page} data-testid="project-command-center">
      <header id="project-setup" className={styles.projectHeader}>
        <div className={styles.projectHeaderCopy}>
          <Link href="/projects/projects" className={styles.backLink}><ArrowRight size={14} aria-hidden /> All projects</Link>
          <div className={styles.eyebrow}>Project 360 / Overview</div>
          <div className={styles.titleRow}><h1>{projectTitle}</h1><span className={styles.projectStatus}>{project?.status ?? 'Unknown'}</span></div>
          <div className={styles.projectMetaLine}>
            {project?.reference ? <code>{project.reference}</code> : <span>Reference not established</span>}
            <span>{project?.accountName ?? 'Client not established'}</span>
            <span>{project?.contractTitle ?? 'Contract not linked'}</span>
            <span>Created {project?.createdAt ? fmt(project.createdAt) : 'not established'}</span>
          </div>
        </div>
        <details className={styles.actionMenu}>
          <summary><Wrench size={15} aria-hidden /> Project Action <span>⌄</span></summary>
          <div className={styles.actionMenuPanel}>
            <div className={styles.actionMenuIntro}><strong>Open a governed project action</strong><span>Each link opens the canonical owner with this project context.</span></div>
            <div className={styles.actionMenuGrid}>
              <ActionGroup title="Plan & control" links={[['Add task / milestone', `/projects/schedule?projectId=${projectId}`], ['Project controls', `${projectBase}/controls`], ['Record risk', `${projectBase}#needs-attention`]]} />
              <ActionGroup title="Engineering" links={[['Drawing / technical action', `/engineering?projectId=${projectId}`], ['RFI / submittal', `/engineering/drawings?projectId=${projectId}`]]} />
              <ActionGroup title="Procurement & subcontracts" links={[['Material requirement', `/procurement/purchase-requests?projectId=${projectId}`], ['New package / RFQ', `/subcontracts/subcontracts?projectId=${projectId}`]]} />
              <ActionGroup title="Site & quality" links={[['Work instruction', `/site/instructions?projectId=${projectId}`], ['Daily report / evidence', `/site/daily-reports?projectId=${projectId}`], ['Inspection / NCR', `/quality/ncrs?projectId=${projectId}`]]} />
              <ActionGroup title="Commercial & evidence" links={[['Variation', `${projectBase}/controls?tab=variations`], ['Documents', `${projectBase}/documents`], ['Team & ownership', `${projectBase}/team`]]} />
            </div>
          </div>
        </details>
      </header>

      <section className={styles.healthSection} aria-label="Project health">
        <div className={styles.sectionHeading}><div><span className={styles.sectionKicker}>Project health</span><h2>The few signals that matter now</h2></div><span className={styles.actionHint}>{discipline ? `Lens: ${discipline.label}` : 'Read from connected authorities'}</span></div>
        <div className={styles.healthGrid}>
          <HealthCard label="Progress" value={healthProgress} hint="From schedule activities" tone={scheduleProgress === null ? 'muted' : 'good'} />
          <HealthCard label="Schedule" value={scheduleHealth} hint={evm?.plannedValueStatus === 'unavailable' || evm?.spi == null ? 'No trusted SPI available' : `SPI ${evm.spi.toFixed(2)}`} tone={scheduleHealth === 'Behind schedule' ? 'bad' : scheduleHealth === 'Unavailable' ? 'muted' : 'good'} />
          <HealthCard label="Cost" value={costValue} hint="Cost Ledger / BAC" tone={costValue === 'Not established' ? 'muted' : 'accent'} />
          <HealthCard label="Completion" value={completionValue} hint="Closeout evidence" tone={completionValue === 'Not established' ? 'muted' : 'accent'} />
        </div>
      </section>

      <section id="needs-attention" className={styles.attentionSection} aria-label="Project attention">
        <div className={styles.sectionHeading}><div><span className={styles.sectionKicker}>Needs your attention</span><h2>Needs attention</h2></div><Link href={`${projectBase}/controls`} className={styles.sectionLink}>View all <ArrowRight size={14} aria-hidden /></Link></div>
        {digest.blockers.length === 0 ? <div className={styles.honestEmpty}><span className={styles.emptyMark}>i</span><div><strong>{digest.totalRecords ? 'No verified exceptions in connected records' : 'Attention is not established yet'}</strong><span>{digest.totalRecords ? 'The connected authorities do not currently expose an exception.' : 'No delivery records are connected yet, so the system cannot claim that the project has no blockers.'}</span><div className={styles.emptyActions}><Link href={`${projectBase}/controls`}>Open controls <ArrowRight size={13} aria-hidden /></Link><Link href={`${projectBase}/site`}>Open delivery <ArrowRight size={13} aria-hidden /></Link></div></div></div> : <ul className={styles.attentionList}>{digest.blockers.slice(0, 5).map((blocker, index) => <li key={`${blocker.text}-${index}`}>{blocker.href ? <Link href={blocker.href}><span className={blocker.severity === 'high' ? styles.severityHigh : styles.severityMedium}>{blocker.severity === 'high' ? 'Blocked' : 'Review'}</span><span className={styles.blockerText}>{blocker.text}</span><ArrowRight size={14} aria-hidden /></Link> : <div><span className={blocker.severity === 'high' ? styles.severityHigh : styles.severityMedium}>Review</span><span className={styles.blockerText}>{blocker.text}</span></div>}</li>)}</ul>}
      </section>

      <div className={styles.cockpitGrid}>
        <section className={styles.timelineSection} aria-label="Project timeline">
          <div className={styles.sectionHeading}><div><span className={styles.sectionKicker}>Project timeline</span><h2>Where the work is now</h2></div></div>
          <div className={styles.phaseTrack}>{phases.map((phase, index) => <div key={phase.label} className={styles.phase}><span className={phase.state === 'Not established' ? styles.phaseDotMuted : styles.phaseDot} aria-hidden /><strong>{phase.label}</strong><small>{phase.state}</small>{index < phases.length - 1 ? <i aria-hidden /> : null}</div>)}</div>
          <div className={styles.nextBlock}><span className={styles.sectionKicker}>Next evidenced activity</span>{activity.slice(0, 3).map((item) => <Link key={`${item.area.slug}-${item.timestamp}`} href={`${projectBase}/${item.area.slug}${scopeQuery}`} className={styles.nextItem}><time>{new Date(item.timestamp).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, day: '2-digit', month: 'short' })}</time><span>{item.label}</span><ArrowRight size={13} aria-hidden /></Link>)}{activity.length === 0 ? <p>Upcoming dates are not established from the connected authorities.</p> : null}</div>
        </section>
        <aside className={styles.deliveryStatusSection} aria-label="Delivery status"><div className={styles.sectionHeading}><div><span className={styles.sectionKicker}>Delivery status</span><h2>Connected workstreams</h2></div><Link href={`${projectBase}/site`} className={styles.sectionLink}>View delivery <ArrowRight size={14} aria-hidden /></Link></div><div className={styles.deliveryStatusList}>{deliveryRows.map((row) => <Link key={row.label} href={row.href} className={styles.deliveryStatusRow}><span>{row.label}</span><strong className={row.status === 'Not established' ? styles.toneMuted : undefined}>{row.status}</strong><ArrowRight size={13} aria-hidden /></Link>)}</div></aside>
      </div>

      <section className={styles.commercialSection} aria-label="Commercial and control summary"><div className={styles.sectionHeading}><div><span className={styles.sectionKicker}>Commercial &amp; control</span><h2>Authoritative value context</h2></div><Link href={`${projectBase}/controls?tab=cost`} className={styles.sectionLink}>View details <ArrowRight size={14} aria-hidden /></Link></div><div className={styles.commercialGrid}><Metric label="Original contract" value={project?.value && project.value > 0 ? `AED ${aed(project.value)}` : 'Not established'} /><Metric label="Approved changes" value={approvedChanges == null ? 'Not established' : `AED ${aed(approvedChanges)}`} /><Metric label="Current contract" value={currentValue == null ? 'Not established' : `AED ${aed(currentValue)}`} /><Metric label="Actual cost" value={evm?.actualCost == null ? 'Not established' : `AED ${aed(evm.actualCost)}`} /><Metric label="Certified" value={certificateSummary?.summary?.grossCertifiedToDate == null ? 'Not established' : `AED ${aed(certificateSummary.summary.grossCertifiedToDate)}`} /><Metric label="Open changes" value={variationSummary?.impact?.pendingCount == null ? 'Not established' : String(variationSummary.impact.pendingCount)} /></div></section>

      <section id="activity-history" className={styles.activitySection} aria-label="Recent project activity"><div className={styles.sectionHeading}><div><span className={styles.sectionKicker}>Recent activity</span><h2>What changed recently</h2></div><Link href={`${projectBase}#activity-history`} className={styles.sectionLink}>View history <ArrowRight size={14} aria-hidden /></Link></div>{activity.length === 0 ? <div className={styles.honestEmpty}><span className={styles.emptyMark}>i</span><div><strong>No activity is established yet</strong><span>New records from the owning domains will appear here when available.</span><div className={styles.emptyActions}><Link href={`${projectBase}/documents`}>Open documents <ArrowRight size={13} aria-hidden /></Link><Link href={`${projectBase}/team`}>Open team <ArrowRight size={13} aria-hidden /></Link></div></div></div> : <ol className={styles.activityList}>{activity.slice(0, 5).map((item, index) => <li key={`${item.area.slug}-${item.timestamp}-${index}`} className={styles.activityItem}><span className={styles.activityDot} aria-hidden /><div><strong>{item.label}</strong><span>{item.area.label} · {new Date(item.timestamp).toLocaleString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' })}</span></div><Link href={`${projectBase}/${item.area.slug}${scopeQuery}`}>Open →</Link></li>)}</ol>}</section>
    </main>
  );
}

function HealthCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: 'good' | 'bad' | 'accent' | 'muted' }) {
  return <article className={styles.healthCard}><span>{label}</span><strong className={tone === 'good' ? styles.toneGood : tone === 'bad' ? styles.toneBad : tone === 'accent' ? styles.toneAccent : styles.toneMuted}>{value}</strong><small>{hint}</small></article>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className={styles.metric}><span>{label}</span><strong className={value === 'Not established' ? styles.toneMuted : undefined}>{value}</strong></div>;
}

function ActionGroup({ title, links }: { title: string; links: Array<[string, string]> }) {
  return <div className={styles.actionGroup}><strong>{title}</strong>{links.map(([label, href]) => <Link key={label} href={href}>{label}<ArrowRight size={13} aria-hidden /></Link>)}</div>;
}
