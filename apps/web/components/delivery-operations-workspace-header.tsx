import Link from 'next/link';
import { ArrowRight, BarChart3, ClipboardCheck, FileCheck2, HardHat, LayoutDashboard, PencilRuler, ShieldAlert, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';
import styles from './delivery-operations-workspace-header.module.css';

type WorkspaceKey = 'overview' | 'pre-execution' | 'engineering' | 'site' | 'quality' | 'hse' | 'commissioning' | 'handover' | 'reports';

const WORKSPACES: Array<{ key: WorkspaceKey; label: string; href: string; icon: LucideIcon }> = [
  { key: 'overview', label: 'Operations overview', href: '/operations/overview', icon: LayoutDashboard },
  { key: 'pre-execution', label: 'Pre-execution', href: '/operations/pre-execution', icon: ShieldAlert },
  { key: 'engineering', label: 'Engineering', href: '/engineering', icon: PencilRuler },
  { key: 'site', label: 'Site', href: '/site/control', icon: HardHat },
  { key: 'quality', label: 'Quality', href: '/quality/control', icon: ClipboardCheck },
  { key: 'hse', label: 'HSE', href: '/hse/control', icon: ShieldCheck },
  { key: 'commissioning', label: 'Testing & commissioning', href: '/commissioning', icon: Wrench },
  { key: 'handover', label: 'Handover', href: '/handover', icon: FileCheck2 },
  { key: 'reports', label: 'Reports', href: '/operations/reports', icon: BarChart3 },
];

export default function DeliveryOperationsWorkspaceHeader({
  active,
  title,
  description,
  owner,
}: {
  active: WorkspaceKey;
  title: string;
  description: string;
  owner: string;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.topline}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}><i aria-hidden /> AURA OS / DELIVERY OPERATIONS / {active.toUpperCase()}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className={styles.actions}>
          <Link href="/projects/dashboard" className={styles.secondary}>Projects <ArrowRight size={13} aria-hidden /></Link>
          <Link href="/my-work" className={styles.primary}>My Work <ArrowRight size={13} aria-hidden /></Link>
        </div>
      </div>
      <div className={styles.contextBar}>
        <span className={styles.owner}><span className={styles.ownerDot} aria-hidden /> Source owner: <strong>{owner}</strong></span>
        <nav aria-label="Delivery Operations workspaces" className={styles.nav}>
          {WORKSPACES.map((workspace) => { const Icon = workspace.icon; return <Link key={workspace.key} href={workspace.href} className={workspace.key === active ? styles.navActive : styles.navItem} aria-current={workspace.key === active ? 'page' : undefined}><Icon size={13} aria-hidden /><span>{workspace.label}</span></Link>; })}
        </nav>
      </div>
    </header>
  );
}
