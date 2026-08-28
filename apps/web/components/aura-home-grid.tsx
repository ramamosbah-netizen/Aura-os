'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Inbox,
  Landmark,
  MessagesSquare,
  Scale,
  Settings2,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { AURA_SUITES } from '@/lib/suites';
import styles from './aura-home-grid.module.css';

interface HomeWorkspace {
  id: string;
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tone: 'teal' | 'blue' | 'amber' | 'green' | 'violet' | 'slate';
  featured?: boolean;
}

interface CommunicationUnreadSummary {
  chat: number;
  mail: number;
  whatsapp: number;
  total: number;
}

// One icon per suite; the launcher is DERIVED from the same AURA_SUITES taxonomy the sidebar uses,
// so a new/renamed suite appears here automatically and never drifts into a broken link.
const SUITE_ICON: Record<string, LucideIcon> = {
  'my-work': UserRound,
  communication: MessagesSquare,
  sales: BriefcaseBusiness,
  'pre-award': ClipboardList,
  'project-delivery': Building2,
  commercial: Scale,
  'supply-chain': Boxes,
  finance: Landmark,
  'assets-service': Wrench,
  people: Users,
  intelligence: BarChart3,
  'administration-governance': Settings2,
};
const TONES: HomeWorkspace['tone'][] = ['teal', 'blue', 'amber', 'green', 'violet', 'slate'];
const SECTION_EYEBROW: Record<string, string> = { work: 'Work center', business: 'Business suite', system: 'System' };

const WORKSPACES: HomeWorkspace[] = AURA_SUITES.map((suite, i) => ({
  id: suite.id,
  number: String(i + 1).padStart(2, '0'),
  eyebrow: SECTION_EYEBROW[suite.section] ?? 'Workspace',
  title: suite.name,
  description: suite.description,
  href: suite.entryHref,
  icon: SUITE_ICON[suite.id] ?? BriefcaseBusiness,
  tone: TONES[i % TONES.length],
  featured: suite.id === 'sales',
}));

export default function AuraHomeGrid({ userName, communicationUnread }: { userName: string; communicationUnread: CommunicationUnreadSummary | null }) {
  // The clock is CLIENT-ONLY on purpose. Seeding `now` from `new Date()` would run on the server at
  // SSR time and again in the browser at hydration time — a few minutes apart — so the two renders
  // disagree and React throws a hydration mismatch on the clock text. Start null (identical on server
  // and first client render → a stable placeholder), then fill in the live time after mount.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const [liveUnread, setLiveUnread] = useState<CommunicationUnreadSummary | null>(communicationUnread);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch('/api/comms/unread', { cache: 'no-store' });
        if (!response.ok) return;
        const next = await response.json() as CommunicationUnreadSummary;
        if (!cancelled && Number.isFinite(next.total)) setLiveUnread(next);
      } catch {
        // Keep the last known value during a transient API outage.
      }
    };
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  const clock = useMemo(() => (now ? new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Dubai',
  }).format(now) : '––:––'), [now]);
  const date = useMemo(() => (now ? new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Dubai',
  }).format(now) : '––'), [now]);

  return (
    <div className={styles.page} data-testid="aura-home-board">
      <div className={styles.ambient} aria-hidden />
      <header className={styles.masthead}>
        <div className={styles.brandBlock}>
          <span className={styles.brandMark} aria-hidden>◆</span>
          <div>
            <p className={styles.product}>AURA OS</p>
            <p className={styles.productMeta}>Enterprise operating system</p>
          </div>
        </div>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Workspace launcher</p>
          <h1 className={styles.title}>Where would you<br />like to work?</h1>
          <p className={styles.intro}>Choose a workspace to enter its tools, records and live operations.</p>
        </div>
        <div className={styles.session} aria-label={`Signed in as ${userName}`}>
          <span className={styles.sessionLabel}>Welcome back</span>
          <strong className={styles.userName}>{userName}</strong>
          <span className={styles.sessionRule} aria-hidden />
          <span className={styles.clock}>{clock}</span>
          <span className={styles.date}>{date} · GST</span>
        </div>
      </header>

      <Link href="/my-work/communication?view=unread" className={styles.communicationPulse} data-testid="home-communication-unread">
        <span className={styles.communicationPulseIcon} aria-hidden><Inbox size={17} /></span>
        <span className={styles.communicationPulseCopy}>
          <strong>{liveUnread === null ? 'Communication status unavailable' : liveUnread.total === 0 ? 'Communication is all caught up' : `${liveUnread.total} unread communication${liveUnread.total === 1 ? '' : 's'}`}</strong>
          <small>{liveUnread === null ? 'Open Communication to retry the live sources' : `${liveUnread.chat} chat · ${liveUnread.mail} mail · ${liveUnread.whatsapp} WhatsApp`}</small>
        </span>
        <ArrowUpRight aria-hidden />
      </Link>

      <main className={styles.launcher} aria-label="AURA workspaces">
        <div className={styles.sectionHead}>
          <h2>Workspaces</h2>
          <span>Select to enter</span>
        </div>
        <div className={styles.grid}>
          {WORKSPACES.map((workspace) => {
            const Icon = workspace.icon;
            return (
              <Link
                key={workspace.id}
                href={workspace.href}
                className={`${styles.card} ${styles[workspace.tone]} ${workspace.featured ? styles.featured : ''}`}
                data-testid={`workspace-card-${workspace.id}`}
                aria-label={`Open ${workspace.title} workspace`}
              >
                <span className={styles.cardNumber}>{workspace.number}</span>
                <span className={styles.iconFrame} aria-hidden><Icon strokeWidth={1.65} /></span>
                <span className={styles.cardBody}>
                  <span className={styles.eyebrow}>{workspace.eyebrow}</span>
                  <span className={styles.cardTitle}>{workspace.title}</span>
                  <span className={styles.description}>{workspace.description}</span>
                </span>
                <span className={styles.openAction} aria-hidden>
                  <span>Enter workspace</span>
                  <ArrowUpRight strokeWidth={1.8} />
                </span>
              </Link>
            );
          })}
        </div>
      </main>

      <footer className={styles.footer}>
        <span><i className={styles.liveDot} />AURA workspace gateway</span>
        <Link href="/suites">View all suites <ArrowUpRight aria-hidden /></Link>
      </footer>
    </div>
  );
}
