import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileStack,
  Gauge,
  HardHat,
  RadioTower,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { getJson } from '@/lib/api';
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
            Project command center
          </div>
          <h1>Delivery pulse</h1>
          <p>
            One project context across engineering, field execution, quality, HSE and commissioning.
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
          <span>Project areas</span>
          <strong>{PROJECT_AREAS.length}</strong>
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
        <section className={styles.attentionPanel}>
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
            <span className={styles.sectionKicker}>Project delivery spine</span>
            <h2>Move through the work, not through modules</h2>
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
    </main>
  );
}
