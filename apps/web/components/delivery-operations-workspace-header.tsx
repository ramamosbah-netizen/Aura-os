import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import styles from './delivery-operations-workspace-header.module.css';

type WorkspaceKey = 'overview' | 'pre-execution' | 'engineering' | 'site' | 'quality' | 'hse' | 'commissioning' | 'handover' | 'reports';

export default function DeliveryOperationsWorkspaceHeader({
  active,
  title,
  description,
}: {
  active: WorkspaceKey;
  title: string;
  description: string;
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
    </header>
  );
}
