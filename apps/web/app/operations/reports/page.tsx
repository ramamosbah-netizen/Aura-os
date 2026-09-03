import Link from 'next/link';
import { ArrowUpRight, BarChart3, ClipboardCheck, FileCheck2, HardHat, PencilRuler, ShieldCheck, Wrench } from 'lucide-react';
import { getJson } from '@/lib/api';
import DeliveryOperationsWorkspaceHeader from '@/components/delivery-operations-workspace-header';
import styles from './operations-reports.module.css';

export const dynamic = 'force-dynamic';

interface Row { status?: string; severity?: string; }
const open = <T extends Row>(rows: T[] | null, done: string[]): number | null => rows === null ? null : rows.filter((row) => !done.includes((row.status ?? '').toLowerCase())).length;
const value = (n: number | null) => n === null ? 'Unavailable' : String(n);

export default async function DeliveryOperationsReportsPage() {
  const [projects, drawings, rfis, reports, ncrs, permits, commissioning] = await Promise.all([
    getJson<Row[]>('/api/projects/projects'),
    getJson<Row[]>('/api/engineering/drawings'),
    getJson<Row[]>('/api/engineering/rfis'),
    getJson<Row[]>('/api/site/daily-reports'),
    getJson<Row[]>('/api/quality/ncrs'),
    getJson<Row[]>('/api/hse/ptws'),
    getJson<Row[]>('/api/commissioning/records'),
  ]);
  const cards = [
    { label: 'Projects in delivery', value: value(projects?.length ?? null), detail: 'Portfolio source', href: '/projects/projects', icon: BarChart3 },
    { label: 'Engineering queue', value: value(open(drawings, ['approved', 'rejected'])), detail: 'Drawings not closed', href: '/engineering', icon: PencilRuler },
    { label: 'RFIs open', value: value(open(rfis, ['closed', 'resolved'])), detail: 'Technical decisions', href: '/engineering', icon: FileCheck2 },
    { label: 'Site reports in progress', value: value(open(reports, ['submitted', 'approved'])), detail: 'Field evidence', href: '/site/daily-reports', icon: HardHat },
    { label: 'Quality exceptions', value: value(open(ncrs, ['closed', 'resolved'])), detail: 'NCR source', href: '/quality/ncrs', icon: ClipboardCheck },
    { label: 'Active permits', value: value(open(permits, ['closed', 'expired'])), detail: 'HSE source', href: '/hse/permits', icon: ShieldCheck },
    { label: 'Commissioning queue', value: value(open(commissioning, ['commissioned', 'failed'])), detail: 'Testing source', href: '/commissioning', icon: Wrench },
  ];
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 28px 64px' }} data-testid="delivery-operations-reports">
      <DeliveryOperationsWorkspaceHeader active="reports" title="Delivery reports" description="Cross-project operational views built from the same discipline authorities. These are read models, not a second reporting database." owner="Delivery Operations composition layer" />
      <section className={styles.hero}><div><span className={styles.kicker}>OPERATING PICTURE</span><h2>What needs a decision?</h2><p>Use the live signals below to open the source workspace, inspect the record and take the governed action there.</p></div><Link href="/my-work" className={styles.heroLink}>Open My Work <ArrowUpRight size={14} aria-hidden /></Link></section>
      <section className={styles.grid} aria-label="Delivery operations reports">{cards.map((card) => { const Icon = card.icon; return <Link key={card.label} href={card.href} className={styles.card}><span className={styles.icon}><Icon size={17} aria-hidden /></span><span><small>{card.detail}</small><strong>{card.value}</strong><b>{card.label}</b></span><ArrowUpRight size={14} aria-hidden /></Link>; })}</section>
      <section className={styles.links}><span className={styles.kicker}>CANONICAL REPORT SURFACES</span><div><Link href="/projects/controls">Project controls / WBS / cost <ArrowUpRight size={13} aria-hidden /></Link><Link href="/projects/schedule">Plan vs actual / baseline <ArrowUpRight size={13} aria-hidden /></Link><Link href="/quality/control">Quality inspections and NCR <ArrowUpRight size={13} aria-hidden /></Link><Link href="/handover">Handover readiness <ArrowUpRight size={13} aria-hidden /></Link></div></section>
      <p className={styles.note}>Unavailable means the owning source did not return evidence. No zero, readiness checkbox or duplicate domain report is created by this page.</p>
    </div>
  );
}
