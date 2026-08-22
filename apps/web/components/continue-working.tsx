'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, History } from 'lucide-react';
import { type RecordTab, readTabs, TABS_EVENT } from '@/lib/tabs';
import AuraTabLink from './aura-tab-link';
import styles from './suite-dashboard-shell.module.css';

/**
 * "Continue working" — the most recent record the user actually had open in THIS suite, read from
 * the client-side AURA tab store (`aura.record-tabs`). It is a real signal, not a guess: if no
 * matching record has been opened, the section renders nothing rather than inventing one.
 *
 * `match` is the set of href prefixes the suite owns as records (e.g. Sales → opportunities,
 * quotations, accounts, contacts). The home page stays a server component; this island hydrates
 * on the client where localStorage lives.
 */
export default function ContinueWorking({ match, kicker = 'Continue working' }: { match: string[]; kicker?: string }) {
  const [tab, setTab] = useState<RecordTab | null>(null);

  useEffect(() => {
    const pick = () => {
      const tabs = readTabs().filter((candidate) => match.some((prefix) => candidate.href === prefix || candidate.href.startsWith(`${prefix}/`)));
      setTab(tabs.length ? tabs[tabs.length - 1]! : null);
    };
    pick();
    window.addEventListener(TABS_EVENT, pick);
    return () => window.removeEventListener(TABS_EVENT, pick);
  }, [match]);

  if (!tab) return null;

  return (
    <section className={styles.continueSection} aria-label={kicker}>
      <p className={styles.sectionKicker}>{kicker}</p>
      <AuraTabLink href={tab.href} tabTitle={tab.title} tabType={tab.type} className={styles.continueCard}>
        <span className={styles.continueIcon} aria-hidden><History /></span>
        <span className={styles.continueBody}>
          <strong>{tab.title}</strong>
          <small><b>{tab.type}</b> · pick up where you left off</small>
        </span>
        <span className={styles.continueCta}>Continue <ArrowRight aria-hidden /></span>
      </AuraTabLink>
    </section>
  );
}
