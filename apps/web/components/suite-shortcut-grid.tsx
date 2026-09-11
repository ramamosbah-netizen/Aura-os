import { ArrowRight } from 'lucide-react';
import AuraTabLink from './aura-tab-link';
import styles from './suite-dashboard-shell.module.css';
import type { SuiteShortcut } from './suite-dashboard-shell';

/**
 * The shared "workspaces" shortcut grid — the tone-coloured cards at the foot of every suite
 * dashboard (Sales, My Work, …). Extracted from `SuiteDashboardShell` so a page that is NOT built on
 * the shell (e.g. the Delivery Operations overview) can render the identical UI rather than a second
 * hand-rolled variant that would drift. The shell composes this too, so the two cannot diverge.
 */
export default function SuiteShortcutGrid({
  kicker,
  title,
  items,
  itemTestId,
  countLabel,
  tabType,
  titleId = 'suite-tools-title',
  newWindow = false,
}: {
  kicker: string;
  title: string;
  items: SuiteShortcut[];
  itemTestId?: string;
  countLabel?: string;
  tabType: string;
  titleId?: string;
  /** Open each shortcut in a new browser tab (keeping the launching page open) rather than
   * navigating the current window and registering an in-app AURA tab. */
  newWindow?: boolean;
}) {
  return (
    <section className={styles.workspaces} aria-labelledby={titleId}>
      <div className={styles.sectionHead}>
        <div><p className={styles.sectionKicker}>{kicker}</p><h2 id={titleId}>{title}</h2></div>
        <span className={styles.toolCount}>{countLabel ?? `${items.length} shortcuts`}</span>
      </div>
      <div className={styles.shortcutGrid}>
        {items.map((shortcut) => {
          const Icon = shortcut.icon;
          const inner = (
            <>
              <span className={styles.shortcutIcon} aria-hidden><Icon /></span>
              <span className={styles.shortcutCopy}><strong>{shortcut.label}</strong><small>{shortcut.description}</small></span>
              {shortcut.count !== null && shortcut.count !== undefined ? <span className={styles.shortcutCount}>{shortcut.count}</span> : null}
              <ArrowRight className={styles.shortcutArrow} aria-hidden />
            </>
          );
          const className = `${styles.shortcut} ${styles[shortcut.tone]}`;
          return newWindow ? (
            <a key={shortcut.label} href={shortcut.href} target="_blank" rel="noopener noreferrer" className={className} data-testid={itemTestId}>{inner}</a>
          ) : (
            <AuraTabLink key={shortcut.label} href={shortcut.href} tabTitle={shortcut.label} tabType={tabType} className={className} data-testid={itemTestId}>{inner}</AuraTabLink>
          );
        })}
      </div>
    </section>
  );
}
