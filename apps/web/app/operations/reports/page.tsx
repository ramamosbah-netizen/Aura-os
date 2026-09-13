import Link from 'next/link';
import { ArrowUpRight, BarChart3, ClipboardCheck, FileCheck2, HardHat, PencilRuler, ShieldCheck, Wrench } from 'lucide-react';
import { getJson } from '@/lib/api';
import DeliveryOperationsWorkspaceHeader from '@/components/delivery-operations-workspace-header';
import ProjectScopeFilter from '@/components/project-scope-filter';
import styles from './operations-reports.module.css';

export const dynamic = 'force-dynamic';

interface Row { status?: string; severity?: string; }
const open = <T extends Row>(rows: T[] | null, done: string[]): number | null => rows === null ? null : rows.filter((row) => !done.includes((row.status ?? '').toLowerCase())).length;
const value = (n: number | null) => n === null ? 'Unavailable' : String(n);

export default async function DeliveryOperationsReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string }>;
}) {
  // Scoped on the SERVER, like every other delivery workspace. `/api/projects/projects` stays whole
  // on purpose: it is what the selector offers, and "Projects in delivery" is a portfolio count that
  // would be meaningless narrowed to the one project already named in the picker.
  const filters = (await searchParams) ?? {};
  const project = filters.project ?? '';
  const scoped = project ? `?projectId=${encodeURIComponent(project)}` : '';

  const [projects, drawings, rfis, reports, ncrs, permits, commissioning] = await Promise.all([
    getJson<Row[]>('/api/projects/projects'),
    getJson<Row[]>(`/api/engineering/drawings${scoped}`),
    getJson<Row[]>(`/api/engineering/rfis${scoped}`),
    getJson<Row[]>(`/api/site/daily-reports${scoped}`),
    getJson<Row[]>(`/api/quality/ncrs${scoped}`),
    getJson<Row[]>(`/api/hse/ptws${scoped}`),
    getJson<Row[]>(`/api/commissioning/records${scoped}`),
  ]);
  const cards = [
    /**
     * PORTFOLIO ONLY. A count of projects is a cross-project answer, and inside one project's
     * context it is both meaningless and wrong to show: the reader asked about this project. It is
     * also the one card whose source is not project-scoped, so leaving it in a project view would
     * be the single place this page could report beyond the project selected.
     *
     * Dropped rather than blanked, so the row does not carry an empty box implying missing data.
     */
    ...(project
      ? []
      : [{ label: 'Projects in delivery', value: value(projects?.length ?? null), detail: 'Portfolio source', href: '/projects/projects', icon: BarChart3 }]),
    { label: 'Engineering queue', value: value(open(drawings, ['approved', 'rejected'])), detail: 'Drawings not closed', href: '/engineering', icon: PencilRuler },
    { label: 'RFIs open', value: value(open(rfis, ['closed', 'resolved'])), detail: 'Technical decisions', href: '/engineering', icon: FileCheck2 },
    { label: 'Site reports in progress', value: value(open(reports, ['submitted', 'approved'])), detail: 'Field evidence', href: '/site/daily-reports', icon: HardHat },
    { label: 'Quality exceptions', value: value(open(ncrs, ['closed', 'resolved'])), detail: 'NCR source', href: '/quality/ncrs', icon: ClipboardCheck },
    { label: 'Active permits', value: value(open(permits, ['closed', 'expired'])), detail: 'HSE source', href: '/hse/permits', icon: ShieldCheck },
    { label: 'Commissioning queue', value: value(open(commissioning, ['commissioned', 'failed'])), detail: 'Testing source', href: '/commissioning', icon: Wrench },
  ];
  // Full width across the delivery suite: the fixed column left the display empty on both sides
  // while the cards, which stretch with their container, were squeezed. The header caps its own
  // description at 760px, so the prose is still a readable measure.
  return (
    <div style={{ padding: '28px 28px 64px' }} data-testid="delivery-operations-reports">
      <DeliveryOperationsWorkspaceHeader active="reports" title="Delivery reports" description="Cross-project operational views built from the same discipline authorities. These are read models, not a second reporting database." />
      <ProjectScopeFilter projects={(projects ?? []) as { id: string; title: string }[]} selected={project} path="/operations/reports" />
      <section className={styles.hero}><div><span className={styles.kicker}>OPERATING PICTURE</span><h2>What needs a decision?</h2><p>Use the live signals below to open the source workspace, inspect the record and take the governed action there.</p></div><Link href="/my-work" className={styles.heroLink}>Open My Work <ArrowUpRight size={14} aria-hidden /></Link></section>
      <section className={styles.grid} aria-label="Delivery operations reports">{cards.map((card) => { const Icon = card.icon; return <Link key={card.label} href={card.href} className={styles.card}><span className={styles.icon}><Icon size={17} aria-hidden /></span><span><small>{card.detail}</small><strong>{card.value}</strong><b>{card.label}</b></span><ArrowUpRight size={14} aria-hidden /></Link>; })}</section>
      <section className={styles.links}><span className={styles.kicker}>CANONICAL REPORT SURFACES</span><div><Link href="/projects/controls">Project controls / WBS / cost <ArrowUpRight size={13} aria-hidden /></Link><Link href="/projects/schedule">Plan vs actual / baseline <ArrowUpRight size={13} aria-hidden /></Link><Link href="/quality/control">Quality inspections and NCR <ArrowUpRight size={13} aria-hidden /></Link><Link href="/handover">Handover readiness <ArrowUpRight size={13} aria-hidden /></Link></div></section>
      <p className={styles.note}>Unavailable means the owning source did not return evidence. No zero, readiness checkbox or duplicate domain report is created by this page.</p>
    </div>
  );
}
