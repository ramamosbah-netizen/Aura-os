import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileStack,
  FilePlus2,
  Gauge,
  HardHat,
  RadioTower,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { getJson } from '@/lib/api';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import { filterAreaRows, PROJECT_AREAS } from '@/lib/project-areas';
import { computeDigest, type Tone } from '@/lib/project-digest';
import { ELV_DISCIPLINES } from '@/lib/project-scope';
import styles from './project-overview.module.css';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown> & { projectId?: string };

const AREA_ICONS: Record<string, LucideIcon> = {
  engineering: RadioTower,
  site: HardHat,
  quality: ClipboardCheck,
  hse: ShieldCheck,
  commissioning: Wrench,
  documents: FileStack,
};

const AREA_DESCRIPTIONS: Record<string, string> = {
  engineering: 'Design intent and approved information',
  site: 'Daily execution and installed progress',
  quality: 'Inspections, NCRs and acceptance',
  hse: 'Permits and safe-work controls',
  commissioning: 'Testing, proof and system readiness',
  documents: 'Controlled delivery record',
};

async function areaRows(endpoint: string, projectId: string, disciplineId?: string): Promise<Row[]> {
  const data = await getJson<Row[]>(endpoint);
  const scoped = (Array.isArray(data) ? data : []).filter((row) => row.projectId === projectId);
  return filterAreaRows(scoped, disciplineId);
}

function summarise(rows: Row[], key: string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[key] ?? 'unknown');
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

const toneClass = (tone: Tone): string =>
  tone === 'bad' ? styles.toneBad
    : tone === 'good' ? styles.toneGood
      : tone === 'accent' ? styles.toneAccent
        : styles.toneMuted;

export default async function ProjectOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ discipline?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const disciplineId = query.discipline;
  const discipline = ELV_DISCIPLINES.find((item) => item.id === disciplineId);
  const scopeQuery = disciplineId ? `?discipline=${encodeURIComponent(disciplineId)}` : '';

  const areaData = await Promise.all(
    PROJECT_AREAS.map(async (area) => ({
      area,
      rows: await areaRows(area.endpoint, projectId, disciplineId),
    })),
  );
  const bySlug: Record<string, Row[]> = Object.fromEntries(areaData.map((data) => [data.area.slug, data.rows]));

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
  const highCount = digest.blockers.filter((blocker) => blocker.severity === 'high').length;

  return (
    <main className={styles.page} data-testid="project-command-center">
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} aria-hidden />
            Project office
          </div>
          <h1>Delivery pulse</h1>
          <p>
            One project context for planning, coordination, delivery decisions and closeout.
            {discipline ? ` Currently focused on ${discipline.label}.` : ''}
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href={`/project/${projectId}/controls`} className={styles.secondaryAction}>
            Project controls
          </Link>
          <Link href={`/project/${projectId}/team${scopeQuery}`} className={styles.primaryAction}>
            <Users size={15} aria-hidden /> Project team
          </Link>
        </div>
      </header>

      <section className={styles.statusBand} aria-label="Project status summary">
        <div className={styles.statusLead}>
          <Gauge size={20} aria-hidden />
          <div>
            <span>Live delivery record</span>
            <strong>{digest.totalRecords} connected records</strong>
          </div>
        </div>
        <div className={styles.statusDivider} />
        <div className={styles.statusFact}>
          <span>Attention queue</span>
          <strong className={digest.blockers.length ? styles.toneBad : styles.toneGood}>
            {digest.blockers.length} items
          </strong>
        </div>
        <div className={styles.statusFact}>
          <span>Critical blockers</span>
          <strong className={highCount ? styles.toneBad : styles.toneGood}>{highCount}</strong>
        </div>
        <div className={styles.statusFact}>
          <span>Connected delivery areas</span>
          <strong>{PROJECT_AREAS.length}</strong>
        </div>
      </section>

      <section className={styles.actionPanel} aria-label="Project actions">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionKicker}>Project action center</span>
            <h2>Move the project forward</h2>
          </div>
          <span className={styles.actionHint}>Actions open the owning domain; Project 360 keeps the context.</span>
        </div>
        <div className={styles.actionGrid}>
          <Link href={`/project/${projectId}/controls`} className={styles.actionCard}>
            <strong>Plan &amp; control</strong>
            <span>WBS, CBS, quantities, cost, changes and closeout</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href={`/projects/schedule?projectId=${encodeURIComponent(projectId)}`} className={styles.actionCard}>
            <CalendarRange size={16} aria-hidden />
            <strong>Plan &amp; schedule</strong>
            <span>Create the project Gantt, add activities and set the governed baseline.</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href={`/site/instructions?projectId=${encodeURIComponent(projectId)}`} className={styles.actionCard}>
            <ClipboardList size={16} aria-hidden />
            <strong>Work instruction</strong>
            <span>Issue and track a formal site instruction in the owning Site workflow.</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href={`/site/daily-reports?projectId=${encodeURIComponent(projectId)}`} className={styles.actionCard}>
            <Camera size={16} aria-hidden />
            <strong>Daily report &amp; photos</strong>
            <span>Record work, manpower, equipment and progress-photo evidence.</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href={`/engineering/drawings?projectId=${encodeURIComponent(projectId)}`} className={styles.actionCard}>
            <RadioTower size={16} aria-hidden />
            <strong>Engineering evidence</strong>
            <span>Open drawings and controlled engineering information for this project.</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href={`/quality/ncrs?projectId=${encodeURIComponent(projectId)}`} className={styles.actionCard}>
            <ClipboardCheck size={16} aria-hidden />
            <strong>Quality action</strong>
            <span>Raise and follow an NCR through the canonical Quality workflow.</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href={`/project/${projectId}/documents${scopeQuery}`} className={styles.actionCard}>
            <FilePlus2 size={16} aria-hidden />
            <strong>Upload evidence</strong>
            <span>Open the project document context and use the controlled DMS path.</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href={`/project/${projectId}/site${scopeQuery}`} className={styles.actionCard}>
            <strong>Progress &amp; execution</strong>
            <span>Open the project-scoped Site delivery context</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href={`/project/${projectId}/documents${scopeQuery}`} className={styles.actionCard}>
            <strong>Evidence &amp; documents</strong>
            <span>Open the controlled project record and its evidence</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href={`/project/${projectId}/team${scopeQuery}`} className={styles.actionCard}>
            <strong>Team &amp; ownership</strong>
            <span>Review project roles and delivery responsibility</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </section>

      <section className={styles.kpiGrid} aria-label="Delivery indicators">
        {digest.kpis.map((kpi) => {
          const Icon = AREA_ICONS[kpi.area] ?? Gauge;
          return (
            <Link key={kpi.area} href={`/project/${projectId}/${kpi.area}${scopeQuery}`} className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.iconBox}><Icon size={17} aria-hidden /></span>
                <span>{kpi.label}</span>
                <ArrowRight size={14} className={styles.cardArrow} aria-hidden />
              </div>
              <strong className={toneClass(kpi.tone)}>{kpi.value}</strong>
            </Link>
          );
        })}
      </section>

      <div className={styles.commandGrid}>
        <section id="needs-attention" className={styles.attentionPanel}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.sectionKicker}>Decision queue</span>
              <h2>Needs attention</h2>
            </div>
            <span className={styles.countBadge}>{digest.blockers.length}</span>
          </div>

          {digest.blockers.length === 0 ? (
            <div className={styles.clearState}>
              <CheckCircle2 size={20} aria-hidden />
              <div>
                <strong>No active delivery blockers</strong>
                <span>The connected records do not currently surface an exception.</span>
              </div>
            </div>
          ) : (
            <ul className={styles.attentionList}>
              {digest.blockers.slice(0, 10).map((blocker, index) => {
                const content = (
                  <>
                    <span className={blocker.severity === 'high' ? styles.severityHigh : styles.severityMedium}>
                      {blocker.severity === 'high' ? 'Critical' : 'Review'}
                    </span>
                    <span className={styles.blockerText}>{blocker.text}</span>
                    {blocker.href ? <ArrowRight size={15} aria-hidden /> : null}
                  </>
                );
                return (
                  <li key={`${blocker.text}-${index}`}>
                    {blocker.href ? <Link href={blocker.href}>{content}</Link> : <div>{content}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className={styles.contextPanel}>
          <span className={styles.sectionKicker}>Current context</span>
          <h2>{discipline?.label ?? 'All systems'}</h2>
          <p>The same project and system lens is preserved as you move between delivery areas.</p>
          <div className={styles.contextRule}>
            <AlertTriangle size={16} aria-hidden />
            <span>Each area remains the owner of its records. This workspace only connects and presents them.</span>
          </div>
        </aside>
      </div>

      <section className={styles.deliverySection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionKicker}>Connected delivery context</span>
            <h2>Project signals by owning domain</h2>
          </div>
        </div>
        <div className={styles.areaGrid}>
          {areaData.map(({ area, rows }, index) => {
            const Icon = AREA_ICONS[area.slug] ?? Gauge;
            const breakdown = summarise(rows, area.statusKey);
            return (
              <Link key={area.slug} href={`/project/${projectId}/${area.slug}${scopeQuery}`} className={styles.areaCard}>
                <div className={styles.areaSequence}>{String(index + 1).padStart(2, '0')}</div>
                <div className={styles.areaIcon}><Icon size={19} aria-hidden /></div>
                <div className={styles.areaMain}>
                  <div className={styles.areaTitleRow}>
                    <h3>{area.label}</h3>
                    <strong>{rows.length}</strong>
                  </div>
                  <p>{AREA_DESCRIPTIONS[area.slug]}</p>
                  <div className={styles.statusChips}>
                    {rows.length === 0 ? (
                      <span>No connected records</span>
                    ) : breakdown.slice(0, 3).map(([status, count]) => (
                      <span key={status}>{status.replace(/_/g, ' ')} <b>{count}</b></span>
                    ))}
                  </div>
                </div>
                <ArrowRight size={16} className={styles.areaArrow} aria-hidden />
              </Link>
            );
          })}
        </div>
      </section>

      <section id="activity-history" className={styles.deliverySection} aria-label="Project activity and history">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionKicker}>Activity &amp; history</span>
            <h2>Recent project activity</h2>
          </div>
          <span className={styles.actionHint}>Read-only context from the owning delivery records.</span>
        </div>
        {activity.length === 0 ? (
          <div className={styles.clearState}>
            <div>
              <strong>No recorded activity yet</strong>
              <span>New schedule, site, engineering, quality, HSE and document records will appear here when available.</span>
            </div>
          </div>
        ) : (
          <ol className={styles.activityList}>
            {activity.map((item, index) => (
              <li key={`${item.area.slug}-${item.timestamp}-${index}`} className={styles.activityItem}>
                <span className={styles.activityDot} aria-hidden />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.area.label} · {new Date(item.timestamp).toLocaleString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                <Link href={`/project/${projectId}/${item.area.slug}${scopeQuery}`}>Open context →</Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
