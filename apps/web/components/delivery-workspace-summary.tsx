import Link from 'next/link';
import { ArrowUpRight, CircleAlert, ListChecks } from 'lucide-react';
import styles from './delivery-workspace-summary.module.css';

export interface WorkspaceMetric {
  label: string;
  value: number | null;
  hint: string;
  tone?: 'accent' | 'warning' | 'critical' | 'good';
}

export interface WorkspaceAttention {
  /**
   * The identity of the RECORD behind the row, and the React key.
   *
   * It used to be keyed on `label`-`detail`, which are both prose — two draft daily reports for one
   * project on one date, or two major snags on one project, compose the same string and React then
   * warns that it may duplicate or drop a child. A record id cannot collide.
   */
  id: string;
  label: string;
  detail: string;
  href: string;
  tone?: 'warning' | 'critical';
}

/**
 * A compact level-1 operating picture for specialist workspaces. It composes
 * source-owned records; it never creates a second operational record store.
 */
export default function DeliveryWorkspaceSummary({
  eyebrow,
  title,
  description,
  metrics,
  attention,
  emptyMessage,
}: {
  eyebrow: string;
  title: string;
  description: string;
  metrics: WorkspaceMetric[];
  attention: WorkspaceAttention[] | null;
  emptyMessage: string;
}) {
  return (
    <section className={styles.shell} aria-label={`${title} operating picture`}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={styles.source}><span aria-hidden /> Source-owned records</span>
      </div>
      <div className={styles.metrics}>
        {metrics.map((metric) => (
          <div key={metric.label} className={`${styles.metric} ${styles[`metric${(metric.tone ?? 'accent')[0].toUpperCase()}${(metric.tone ?? 'accent').slice(1)}`]}`}>
            <span>{metric.label}</span>
            <strong>{metric.value === null ? 'Unavailable' : metric.value === 0 ? 'No records' : metric.value}</strong>
            <small>{metric.hint}</small>
          </div>
        ))}
      </div>
      <div className={styles.attention}>
        <div className={styles.attentionHead}><div><span className={styles.eyebrow}>Exception lane</span><h3>Needs attention</h3></div><ListChecks size={18} aria-hidden /></div>
        {attention === null ? (
          <div className={styles.empty}><CircleAlert size={16} aria-hidden /> Source evidence is unavailable. Retry when the owning workspace responds.</div>
        ) : attention.length === 0 ? (
          <div className={styles.empty}><ListChecks size={16} aria-hidden /> {emptyMessage}</div>
        ) : (
          <div className={styles.attentionList}>
            {attention.slice(0, 5).map((item) => <Link key={item.id} href={item.href} className={styles.attentionRow}><span className={`${styles.dot} ${item.tone === 'critical' ? styles.dotCritical : ''}`} aria-hidden /><span><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowUpRight size={14} aria-hidden /></Link>)}
          </div>
        )}
      </div>
    </section>
  );
}
