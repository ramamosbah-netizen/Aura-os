'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Building2,
  Settings2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
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

const WORKSPACES: HomeWorkspace[] = [
  {
    id: 'my-work',
    number: '01',
    eyebrow: 'Personal workspace',
    title: 'My Work',
    description: 'Your priorities, decisions and collaboration in one focused view.',
    href: '/my-work',
    icon: UserRound,
    tone: 'teal',
  },
  {
    id: 'project-command-center',
    number: '02',
    eyebrow: 'Delivery workspace',
    title: 'Project Command Center',
    description: 'Run every project through one connected delivery context from engineering to handover.',
    href: '/suites/project-delivery',
    icon: Building2,
    tone: 'blue',
    featured: true,
  },
  {
    id: 'business',
    number: '03',
    eyebrow: 'Commercial workspace',
    title: 'Business',
    description: 'Move opportunities from first contact through award and commercial execution.',
    href: '/suites/sales-pre-award',
    icon: BriefcaseBusiness,
    tone: 'amber',
  },
  {
    id: 'management',
    number: '04',
    eyebrow: 'Executive workspace',
    title: 'Management',
    description: 'See portfolio signals, performance and risk without losing operating context.',
    href: '/suites/intelligence-reporting',
    icon: BarChart3,
    tone: 'green',
  },
  {
    id: 'aura-ai',
    number: '05',
    eyebrow: 'Intelligence workspace',
    title: 'AURA AI',
    description: 'Use governed assistance, knowledge search and decision support across AURA.',
    href: '/ai',
    icon: Bot,
    tone: 'violet',
  },
  {
    id: 'administration',
    number: '06',
    eyebrow: 'Governance workspace',
    title: 'Administration',
    description: 'Control access, organization, policy, integration and platform configuration.',
    href: '/suites/administration-governance',
    icon: Settings2,
    tone: 'slate',
  },
];

export default function AuraHomeGrid({ userName }: { userName: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const clock = useMemo(() => new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Dubai',
  }).format(now), [now]);
  const date = useMemo(() => new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Dubai',
  }).format(now), [now]);

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
