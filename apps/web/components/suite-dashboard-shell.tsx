import type { ComponentType, ReactNode, SVGProps } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import AuraTabLink from './aura-tab-link';
import AuraTabAnchor from './aura-tab-anchor';
import styles from './suite-dashboard-shell.module.css';

/**
 * The shared design language for every AURA suite dashboard.
 *
 * One shell, many suites: My Work, Sales, Project Delivery … each COMPOSES this with its own real
 * data and renders identical UX (hero → KPI strip → attention panel → AURA brief → shortcuts →
 * ownership). The data logic — which numbers, from which endpoints — stays in each suite's own
 * `*-dashboard.tsx`; only the presentation is shared, so the nine suites cannot drift apart.
 */
type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export type MetricTone = 'teal' | 'blue' | 'green' | 'amber' | 'red';
export type ShortcutTone = 'teal' | 'blue' | 'amber' | 'green' | 'cyan' | 'violet' | 'slate';
export type SignalTone = 'bad' | 'warn' | 'good';

export interface SuiteMetric {
  label: string;
  value: string;
  sub: string;
  href: string;
  icon: IconType;
  tone: MetricTone;
}

/** One row in the "needs attention" panel — something that requires a decision or intervention now. */
export interface SuiteAttentionItem {
  id: string;
  href: string;
  tabTitle: string;
  tabType: string;
  signal: SignalTone;
  title: string;
  subtitle: string;
  /** Optional middle column: a single muted line, or an emphasized line + a muted reason. */
  detailPrimary?: string;
  detailSecondary?: string;
  trailing: string;
  /** Emphasize the trailing value (e.g. a money figure) rather than mute it (e.g. a due date). */
  trailingStrong?: boolean;
}

export interface SuiteShortcut {
  label: string;
  description: string;
  href: string;
  icon: IconType;
  tone: ShortcutTone;
  count?: number | null;
}

export interface SuiteDashboardProps {
  testId?: string;
  anchor: { href: string; title: string; type: string };
  hero: { eyebrow: string; title: ReactNode; lede: string };
  askAura: { tabType: string };
  metrics: SuiteMetric[];
  /** Optional full-width band under the KPIs (e.g. a pipeline stage strip). */
  band?: ReactNode;
  /** Optional "continue working" island (client-sourced from the AURA tab store). */
  continueWorking?: ReactNode;
  attention: {
    kicker: string;
    title: string;
    headerLink: { href: string; label: string; tabTitle: string; tabType: string };
    /** null = the source could not be loaded (distinct from a genuinely empty queue). */
    items: SuiteAttentionItem[] | null;
    unavailableLabel: string;
    emptyLabel: string;
    itemTestId?: string;
    /** Optional summary strip below the list (e.g. "N approvals waiting" + a review link). */
    strip?: {
      icon: IconType;
      text: string;
      link: { href: string; label: string; tabTitle: string; tabType: string };
    } | null;
  };
  brief: {
    kicker: string;
    title: string;
    body: string;
    cta: { href: string; label: string; tabTitle: string; tabType: string };
  };
  shortcuts: {
    kicker: string;
    title: string;
    items: SuiteShortcut[];
    itemTestId?: string;
    countLabel?: string;
  };
  ownership: ReactNode;
}

const TONE_CLASS: Record<MetricTone, string> = {
  teal: styles.metricTeal, blue: styles.metricBlue, green: styles.metricGreen, amber: styles.metricAmber, red: styles.metricRed,
};

export default function SuiteDashboardShell({
  testId, anchor, hero, askAura, metrics, band, continueWorking, attention, brief, shortcuts, ownership,
}: SuiteDashboardProps) {
  return (
    <div className={styles.page} data-testid={testId}>
      <AuraTabAnchor href={anchor.href} title={anchor.title} type={anchor.type} />
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{hero.eyebrow}</p>
          <h1>{hero.title}</h1>
          <p className={styles.lede}>{hero.lede}</p>
        </div>
        <AuraTabLink href="/ai" tabTitle="AURA AI" tabType={askAura.tabType} className={styles.askAura}><Sparkles aria-hidden />Ask AURA</AuraTabLink>
      </header>

      <section className={styles.metrics} aria-label={`${anchor.title} summary`}>
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <AuraTabLink key={metric.label} href={metric.href} tabTitle={metric.label} tabType={anchor.type} className={`${styles.metric} ${TONE_CLASS[metric.tone]}`}>
              <span className={styles.metricIcon} aria-hidden><Icon /></span>
              <span><strong>{metric.value}</strong><small>{metric.label} · {metric.sub}</small></span>
              <ArrowRight className={styles.metricArrow} aria-hidden />
            </AuraTabLink>
          );
        })}
      </section>

      {band}
      {continueWorking}

      <div className={styles.bodyGrid}>
        <section className={styles.todayPanel} aria-labelledby="suite-attention-title">
          <div className={styles.sectionHead}>
            <div><p className={styles.sectionKicker}>{attention.kicker}</p><h2 id="suite-attention-title">{attention.title}</h2></div>
            <AuraTabLink href={attention.headerLink.href} tabTitle={attention.headerLink.tabTitle} tabType={attention.headerLink.tabType}>{attention.headerLink.label} <ArrowRight aria-hidden /></AuraTabLink>
          </div>
          {attention.items === null ? (
            <div className={styles.empty}>{attention.unavailableLabel}</div>
          ) : attention.items.length === 0 ? (
            <div className={styles.empty}>{attention.emptyLabel}</div>
          ) : (
            <ol className={styles.attentionList}>
              {attention.items.map((item) => (
                <li key={item.id}>
                  <AuraTabLink href={item.href} tabTitle={item.tabTitle} tabType={item.tabType} className={styles.attentionRow} data-testid={attention.itemTestId}>
                    <i className={`${styles.signal} ${styles[item.signal]}`} aria-hidden />
                    <span className={styles.attentionMain}>
                      <strong>{item.title}</strong>
                      <small>{item.subtitle}</small>
                    </span>
                    {item.detailSecondary !== undefined ? (
                      <span className={styles.attentionDetail}>
                        <strong>{item.detailPrimary}</strong>
                        <small>{item.detailSecondary}</small>
                      </span>
                    ) : (
                      <span className={styles.attentionDetailMuted}>{item.detailPrimary ?? ''}</span>
                    )}
                    <span className={item.trailingStrong ? styles.attentionTimeStrong : styles.attentionTime}>{item.trailing}</span>
                    <ArrowRight aria-hidden />
                  </AuraTabLink>
                </li>
              ))}
            </ol>
          )}
          {attention.strip ? (
            <div className={styles.decisionStrip}>
              <span><attention.strip.icon aria-hidden />{attention.strip.text}</span>
              <AuraTabLink href={attention.strip.link.href} tabTitle={attention.strip.link.tabTitle} tabType={attention.strip.link.tabType}>{attention.strip.link.label} <ArrowRight aria-hidden /></AuraTabLink>
            </div>
          ) : null}
        </section>

        <aside className={styles.aiBrief} aria-labelledby="suite-brief-title">
          <span className={styles.aiMark} aria-hidden><Sparkles /></span>
          <p className={styles.sectionKicker}>{brief.kicker}</p>
          <h2 id="suite-brief-title">{brief.title}</h2>
          <p>{brief.body}</p>
          <AuraTabLink href={brief.cta.href} tabTitle={brief.cta.tabTitle} tabType={brief.cta.tabType}>{brief.cta.label} <ArrowRight aria-hidden /></AuraTabLink>
        </aside>
      </div>

      <section className={styles.workspaces} aria-labelledby="suite-tools-title">
        <div className={styles.sectionHead}>
          <div><p className={styles.sectionKicker}>{shortcuts.kicker}</p><h2 id="suite-tools-title">{shortcuts.title}</h2></div>
          <span className={styles.toolCount}>{shortcuts.countLabel ?? `${shortcuts.items.length} shortcuts`}</span>
        </div>
        <div className={styles.shortcutGrid}>
          {shortcuts.items.map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <AuraTabLink key={shortcut.label} href={shortcut.href} tabTitle={shortcut.label} tabType={anchor.type} className={`${styles.shortcut} ${styles[shortcut.tone]}`} data-testid={shortcuts.itemTestId}>
                <span className={styles.shortcutIcon} aria-hidden><Icon /></span>
                <span className={styles.shortcutCopy}><strong>{shortcut.label}</strong><small>{shortcut.description}</small></span>
                {shortcut.count !== null && shortcut.count !== undefined ? <span className={styles.shortcutCount}>{shortcut.count}</span> : null}
                <ArrowRight className={styles.shortcutArrow} aria-hidden />
              </AuraTabLink>
            );
          })}
        </div>
      </section>

      <footer className={styles.ownership}>{ownership}</footer>
    </div>
  );
}
