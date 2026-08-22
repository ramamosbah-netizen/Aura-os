import type { CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import AuraTabLink from './aura-tab-link';
import styles from './suite-dashboard-shell.module.css';

export interface PipelineStage {
  label: string;
  count: number;
  value: string;
  href: string;
  tabTitle: string;
  tabType: string;
}

/** The pipeline stage strip that sits under a suite Home's KPIs — count + value per stage, each a
 * link into that stage of the workspace. A relative bar shows where the value concentrates. */
export default function PipelineStrip({
  title,
  viewAll,
  stages,
}: {
  title: string;
  viewAll: { href: string; label: string; tabTitle: string; tabType: string };
  stages: PipelineStage[];
}) {
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  return (
    <section className={styles.band} aria-label={title}>
      <div className={styles.bandHead}>
        <h2>{title}</h2>
        <AuraTabLink href={viewAll.href} tabTitle={viewAll.tabTitle} tabType={viewAll.tabType}>{viewAll.label} <ArrowRight aria-hidden /></AuraTabLink>
      </div>
      <div className={styles.bandStages} style={{ '--stage-count': stages.length } as CSSProperties}>
        {stages.map((stage) => (
          <AuraTabLink key={stage.label} href={stage.href} tabTitle={stage.tabTitle} tabType={stage.tabType} className={styles.bandStage}>
            <small>{stage.label}</small>
            <b>{stage.count}</b>
            <span>{stage.value}</span>
            <i style={{ width: `${Math.round((stage.count / maxCount) * 100)}%` }} aria-hidden />
          </AuraTabLink>
        ))}
      </div>
    </section>
  );
}
