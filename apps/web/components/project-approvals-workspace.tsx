'use client';

import { useMemo } from 'react';
import { ArrowLeft, ArrowRight, Bell, CheckCircle2, Clock3, ExternalLink, ListChecks, ShieldCheck, Sparkles } from 'lucide-react';
import AuraTabLink from '@/components/aura-tab-link';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import { composeDecisionQueue, type ApiDecisionItem, type DecisionAssignment, type SharedDecisionDocument } from '@/lib/decision-assignments';
import styles from './project-approvals-workspace.module.css';

interface ProjectNotification {
  id: string;
  title: string;
  body: string;
  category: string;
  read: boolean;
  createdAt: string;
  refType: string | null;
  refId: string | null;
}

function isProjectDecision(item: DecisionAssignment): boolean {
  return item.domain === 'Projects' || /\bproject\s*:/i.test(item.detail);
}

function isProjectNotification(notification: ProjectNotification): boolean {
  return notification.refType?.startsWith('projects.') === true || /\bproject\b/i.test(`${notification.title} ${notification.body}`);
}

function weekStart(iso: string | null): string | null {
  if (!iso) return null;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const date = new Date(Date.UTC(values.year, values.month - 1, values.day));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function weekLabel(key: string): string {
  const start = new Date(`${key}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${start.toLocaleDateString(DISPLAY_LOCALE, { timeZone: 'UTC', day: '2-digit', month: 'short' })} – ${end.toLocaleDateString(DISPLAY_LOCALE, { timeZone: 'UTC', day: '2-digit', month: 'short' })}`;
}

function dateLabel(iso: string | null): string {
  if (!iso) return 'Date not supplied';
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? 'Date not supplied' : value.toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ProjectApprovalsWorkspace({ decisions, sharedDocuments, notifications }: { decisions: ApiDecisionItem[] | null; sharedDocuments: SharedDecisionDocument[] | null; notifications: ProjectNotification[] | null }) {
  const allItems = useMemo(() => composeDecisionQueue(decisions, sharedDocuments), [decisions, sharedDocuments]);
  const projectItems = useMemo(() => allItems.filter(isProjectDecision), [allItems]);
  const projectNotifications = useMemo(() => (notifications ?? []).filter(isProjectNotification), [notifications]);
  const unread = projectNotifications.filter((item) => !item.read);
  const workflowLinked = projectItems.filter((item) => item.workflow !== null).length;
  const sourceUnavailable = decisions === null || sharedDocuments === null;
  const weeks = useMemo(() => {
    const grouped = new Map<string, DecisionAssignment[]>();
    for (const item of projectItems) {
      const key = weekStart(item.createdAt) ?? 'undated';
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return [...grouped.entries()].sort((a, b) => a[0] === 'undated' ? 1 : b[0] === 'undated' ? -1 : b[0].localeCompare(a[0])).slice(0, 8);
  }, [projectItems]);

  return (
    <div className={styles.page}>
      <AuraTabLink href="/projects/dashboard" tabTitle="Projects" tabType="Projects" className={styles.back}><ArrowLeft aria-hidden />Projects dashboard</AuraTabLink>
      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>PROJECTS / APPROVALS &amp; ACTIONS</p><h1>Project decision room</h1><p>One project-suite view for the latest real approvals, your visible work pulse and the signals that need attention.</p></div>
        <div className={styles.heroActions}><AuraTabLink href="/my-work/approvals" tabTitle="Approvals" tabType="My Work" className={styles.secondaryAction}>My Work approvals <ExternalLink aria-hidden /></AuraTabLink></div>
      </header>

      {sourceUnavailable ? <div className={styles.warning} role="status"><ShieldCheck aria-hidden /><span><b>Source coverage is partial</b><small>Only verified sources are counted. A missing source is not represented as a false zero.</small></span></div> : null}

      <section className={styles.pulse} aria-label="My project work pulse">
        <div className={styles.pulseIntro}><span className={styles.eyebrow}>MY PROJECT WORK PULSE</span><h2>Work rate, grounded in real records</h2><p>This is an operational meter, not a performance ranking. It measures visible decisions, workflow linkage and unread project signals for the current user scope.</p></div>
        <div className={styles.meter}><div className={styles.meterTrack}><span style={{ width: `${projectItems.length ? Math.round((workflowLinked / projectItems.length) * 100) : 0}%` }} /></div><strong>{projectItems.length ? `${Math.round((workflowLinked / projectItems.length) * 100)}%` : '—'}</strong><small>{projectItems.length ? 'workflow coverage' : 'no measurable project decisions'}</small></div>
        <div className={styles.pulseStats}><Stat icon={ListChecks} value={String(projectItems.length)} label="Project decisions" /><Stat icon={CheckCircle2} value={String(workflowLinked)} label="Workflow-linked" /><Stat icon={Bell} value={String(unread.length)} label="Unread signals" /></div>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="weekly-title">
          <header className={styles.panelHead}><div><span className={styles.eyebrow}>DECISION RUNWAY</span><h2 id="weekly-title">Latest approvals by week</h2></div><span className={styles.count}>{sourceUnavailable ? '—' : `${projectItems.length} source item${projectItems.length === 1 ? '' : 's'}`}</span></header>
          {weeks.length ? <div className={styles.weekTable}>{weeks.map(([key, items]) => <article key={key} className={styles.weekRow}><div className={styles.weekDate}><strong>{key === 'undated' ? 'Date not supplied' : weekLabel(key)}</strong><small>{items.length} decision{items.length === 1 ? '' : 's'}</small></div><div className={styles.weekItems}>{items.slice(0, 5).map((item) => <AuraTabLink key={item.key} href={item.href} tabTitle={item.title} tabType={item.kind} className={styles.itemLink}><span><b>{item.displayAction}</b>{item.title}<small>{item.detail || item.domain}</small></span><ArrowRight aria-hidden /></AuraTabLink>)}</div></article>)}</div> : <Empty icon={Clock3} title={sourceUnavailable ? 'Project decision source unavailable' : 'No project approvals yet'} text={sourceUnavailable ? 'AURA cannot verify the complete project decision feed right now.' : 'When a real project approval enters your accessible queue, it will appear here with its calendar week.'} />}
        </section>

        <aside className={styles.side}>
          <section className={styles.panel} aria-labelledby="signals-title"><header className={styles.panelHead}><div><span className={styles.eyebrow}>WHAT NEEDS ATTENTION</span><h2 id="signals-title">Project work signals</h2></div><AuraTabLink href="/my-work/communication" tabTitle="Communication" tabType="My Work">View all <ExternalLink aria-hidden /></AuraTabLink></header>{projectNotifications.length ? <div className={styles.notifications}>{projectNotifications.slice(0, 6).map((item) => <AuraTabLink key={item.id} href={item.refId && item.refType === 'projects.project' ? `/project/${item.refId}` : '/notifications'} tabTitle={item.title} tabType="Notification" className={`${styles.notification} ${item.read ? '' : styles.unread}`}><Bell aria-hidden /><span><b>{item.title}</b><small>{item.body || item.category}</small><em>{dateLabel(item.createdAt)} · {item.read ? 'Read' : 'Unread'}</em></span><ArrowRight aria-hidden /></AuraTabLink>)}</div> : <Empty icon={Bell} title="No project signals" text="Unread project notifications will appear here when the source sends them." />}</section>
          <section className={styles.next}><Sparkles aria-hidden /><div><span className={styles.eyebrow}>NEXT ACTION</span><h2>Keep decisions in My Work</h2><p>Use My Work for your personal approval queue. This Projects page keeps the project context and weekly range together.</p><AuraTabLink href="/my-work/approvals" tabTitle="Approvals" tabType="My Work">Open My Work approvals <ArrowRight aria-hidden /></AuraTabLink></div></section>
        </aside>
      </div>
      <footer className={styles.footer}><ShieldCheck aria-hidden /><span><b>Projects owns context.</b> Approval records and final decisions remain in their canonical source workspaces.</span></footer>
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Bell; value: string; label: string }) {
  return <div className={styles.stat}><Icon aria-hidden /><span><strong>{value}</strong><small>{label}</small></span></div>;
}

function Empty({ icon: Icon, title, text }: { icon: typeof Clock3; title: string; text: string }) {
  return <div className={styles.empty}><Icon aria-hidden /><div><strong>{title}</strong><p>{text}</p></div></div>;
}
