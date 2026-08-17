'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Bell, Bot, CalendarClock, Check, CheckCircle2,
  ClipboardCheck, Clock3, ExternalLink, Plus, ShieldCheck, Sparkles, UserRound,
} from 'lucide-react';
import AuraTabAnchor from '@/components/aura-tab-anchor';
import AuraTabLink from '@/components/aura-tab-link';
import { PersonalTaskEditor, type TaskEditorInput } from '@/components/my-tasks-workspace';
import type { WorkItem, WorkItemAction, WorkItemsPayload } from '@/lib/work-items';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import styles from '@/components/my-day-command-center.module.css';

export interface DailyMeeting {
  id: string;
  type: string;
  subject: string;
  dueDate: string | null;
  relatedName: string | null;
  href: string | null;
}

export interface DailyDecision {
  id: string;
  module: string;
  kind: string;
  title: string;
  detail: string;
  action: string;
  href: string;
}

export interface DailyNotification {
  id: string;
  title: string;
  category: string;
  read: boolean;
  refType: string | null;
  refId: string | null;
}

const PRIORITY_RANK = { critical: 5, high: 4, medium: 3, normal: 2, low: 1 } as const;
const STATUS_LABEL = {
  todo: 'To do', in_progress: 'In progress', waiting: 'Waiting', blocked: 'Blocked',
  done: 'Done', cancelled: 'Cancelled',
} as const;

function dateOnly(value: string | null): string | null {
  return value?.slice(0, 10) ?? null;
}

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value: string | null, fallback = 'No time set'): string {
  if (!value) return fallback;
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, value.includes('T')
    ? { timeZone: DISPLAY_TIME_ZONE, hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }
    : { timeZone: DISPLAY_TIME_ZONE, day: 'numeric', month: 'short' }).format(parsed);
}

function originLabel(item: WorkItem): string {
  if (item.origin === 'system') return 'AURA / workflow';
  if (item.origin === 'other') return 'Assigned by another user';
  return 'Created by me';
}

function workItemTabKey(item: WorkItem): string | undefined {
  return item.href.startsWith('/my-work/tasks') ? '/my-work/tasks' : undefined;
}

const RECORD_HREF: Record<string, (id: string) => string> = {
  'crm.activity': (id) => `/my-work/tasks?task=${encodeURIComponent(id)}`,
  'crm.lead': (id) => `/crm/leads/${id}`,
  'crm.opportunity': (id) => `/crm/opportunities/${id}`,
  'crm.account': (id) => `/crm/accounts/${id}`,
  'crm.contact': (id) => `/crm/contacts/${id}`,
  'crm.quotation': (id) => `/crm/quotations/${id}`,
  'tendering.tender': (id) => `/tendering/tenders/${id}`,
  'contracts.contract': (id) => `/contracts/contracts/${id}`,
  'projects.project': (id) => `/project/${id}`,
};

function notificationHref(notification: DailyNotification): string | null {
  if (!notification.refType || !notification.refId) return null;
  return RECORD_HREF[notification.refType]?.(notification.refId) ?? null;
}

function responseError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const candidate = body as { message?: unknown; error?: unknown };
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.error === 'string') return candidate.error;
  }
  return fallback;
}

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Dubai',
  }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function DayWorkRow({ item, late, busy, error, onAction }: {
  item: WorkItem;
  late?: boolean;
  busy: boolean;
  error: string | null;
  onAction: (item: WorkItem, action: WorkItemAction) => Promise<void>;
}) {
  const action = item.actions.find((candidate) => candidate === 'complete') ?? item.actions[0] ?? null;
  const OriginIcon = item.origin === 'system' ? Bot : UserRound;
  return (
    <article className={styles.workRow} data-testid="my-day-work-item">
      <span className={`${styles.priorityRail} ${styles[`priority_${item.priority}`]}`} aria-label={`${item.priority} priority`} />
      <div className={styles.workMain}>
        <div className={styles.workMeta}>
          <span>{item.module}</span><span>{item.kind}</span>
          <span><OriginIcon aria-hidden />{originLabel(item)}</span>
        </div>
        <AuraTabLink href={item.href} tabTitle={item.title} tabType={item.module} tabKey={workItemTabKey(item)} className={styles.workTitle}>{item.title}</AuraTabLink>
        <p>{item.projectName ?? item.detail ?? item.memo ?? 'Personal work item'}</p>
        {error ? <small className={styles.rowError} role="alert">{error}</small> : null}
      </div>
      <div className={styles.workState}>
        <span className={`${styles.status} ${styles[`status_${item.status}`]}`}>{STATUS_LABEL[item.status]}</span>
        <span className={late ? styles.late : undefined}>{late ? 'Overdue · ' : ''}{formatDate(item.dueAt)}</span>
      </div>
      <div className={styles.workActions}>
        {action ? <button type="button" disabled={busy} onClick={() => void onAction(item, action)}>{action === 'complete' ? <Check aria-hidden /> : <Clock3 aria-hidden />}{busy ? 'Saving…' : action === 'complete' ? 'Complete' : action === 'start' ? 'Start' : 'Reopen'}</button> : null}
        <AuraTabLink href={item.href} tabTitle={item.title} tabType={item.module} tabKey={workItemTabKey(item)}>{item.href.startsWith('/my-work/tasks') ? 'Open task' : `Open in ${item.module}`}<ExternalLink aria-hidden /></AuraTabLink>
      </div>
    </article>
  );
}

function Empty({ children }: { children: string }) {
  return <div className={styles.empty}><CheckCircle2 aria-hidden /><span>{children}</span></div>;
}

export default function MyDayCommandCenter({
  userName, currentDate, initialWork, meetings, decisions, notifications,
}: {
  userName: string;
  currentDate: string;
  initialWork: WorkItemsPayload;
  meetings: DailyMeeting[];
  decisions: DailyDecision[];
  notifications: DailyNotification[];
}) {
  const [items, setItems] = useState(initialWork.items);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const weekEnd = addDays(currentDate, 7);
  const active = items.filter((item) => !['done', 'cancelled'].includes(item.status));
  const meetingIds = useMemo(() => new Set(meetings.map((meeting) => meeting.id)), [meetings]);
  const ordered = [...active]
    .filter((item) => !meetingIds.has(item.sourceId))
    .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  const overdue = ordered.filter((item) => !!dateOnly(item.dueAt) && dateOnly(item.dueAt)! < currentDate);
  const dueToday = ordered.filter((item) => dateOnly(item.dueAt) === currentDate);
  const thisWeek = ordered.filter((item) => {
    const due = dateOnly(item.dueAt);
    return !!due && due > currentDate && due <= weekEnd;
  });
  const unread = notifications.filter((notification) => !notification.read);
  const priority = overdue[0] ?? dueToday[0] ?? null;

  const act = async (item: WorkItem, action: WorkItemAction) => {
    setBusyId(item.id); setErrors((current) => ({ ...current, [item.id]: '' }));
    try {
      const response = await fetch(`/api/work-items/${encodeURIComponent(item.source)}/${encodeURIComponent(item.sourceId)}/${action}`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : 'The source record could not be updated.');
      setItems((current) => current.map((candidate) => candidate.id === item.id ? body as WorkItem : candidate));
    } catch (error) {
      setErrors((current) => ({ ...current, [item.id]: error instanceof Error ? error.message : 'The source record could not be updated.' }));
    } finally {
      setBusyId(null);
    }
  };

  const createTask = async (input: TaskEditorInput) => {
    setCreateBusy(true); setCreateError(null); setCreateNotice(null);
    try {
      const response = await fetch('/api/work-items', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseError(body, 'The task could not be created.'));
      const created = body as WorkItem;
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setCreating(false);
      setCreateNotice(`“${created.title}” was created and is now available in My Tasks.`);
      window.dispatchEvent(new CustomEvent('aura:work-items-changed', { detail: created }));
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'The task could not be created.');
    } finally {
      setCreateBusy(false);
    }
  };

  const brief = overdue.length
    ? `${overdue.length} overdue item${overdue.length === 1 ? '' : 's'} should be cleared first${priority ? `; “${priority.title}” has the strongest priority signal` : ''}.`
    : dueToday.length
      ? `${dueToday.length} item${dueToday.length === 1 ? '' : 's'} due today, with ${meetings.length} scheduled appointment${meetings.length === 1 ? '' : 's'}.`
      : decisions.length
        ? `Your dated work is clear. ${decisions.length} accessible decision${decisions.length === 1 ? '' : 's'} remain in the approval queue.`
        : 'Your dated work is clear. Use the open space to prepare the next important action.';

  return (
    <main className={styles.page} data-testid="my-day-page">
      <AuraTabAnchor href="/my-work/my-day" title="My Day" type="My Work" />
      <AuraTabLink href="/my-work" tabTitle="My Work" tabType="Workspace" className={styles.back}><ArrowLeft aria-hidden />My Work</AuraTabLink>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>MY WORK / DAILY COMMAND</p>
          <h1>{greeting()}, <span>{userName}</span></h1>
          <p>My Day owns today’s focus. My Tasks keeps the full register, and every domain workspace remains the authority for its records.</p>
        </div>
        <div className={styles.heroSide}>
          <time dateTime={currentDate}>{new Intl.DateTimeFormat(DISPLAY_LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: DISPLAY_TIME_ZONE }).format(new Date(`${currentDate}T12:00:00+04:00`))}</time>
          <div><button type="button" className={styles.createAction} onClick={() => { setCreateError(null); setCreateNotice(null); setCreating(true); }}><Plus aria-hidden />New task</button><AuraTabLink href="/my-work/tasks" tabTitle="Tasks" tabType="My Work" tabKey="/my-work/tasks">All tasks</AuraTabLink><AuraTabLink href="/ai" tabTitle="AURA AI" tabType="My Work" className={styles.auraAction}><Sparkles aria-hidden />Prepare with AURA</AuraTabLink></div>
        </div>
      </header>

      {createNotice ? <p className={styles.createNotice} role="status">{createNotice}<AuraTabLink href="/my-work/tasks" tabTitle="Tasks" tabType="My Work" tabKey="/my-work/tasks">Open My Tasks<ArrowRight aria-hidden /></AuraTabLink></p> : null}

      <section className={styles.metrics} aria-label="Daily work summary">
        <div className={`${styles.metric} ${overdue.length ? styles.metricHot : ''}`}><AlertTriangle aria-hidden /><strong>{overdue.length}</strong><span>Overdue</span></div>
        <div className={styles.metric}><ClipboardCheck aria-hidden /><strong>{dueToday.length}</strong><span>Due today</span></div>
        <div className={styles.metric}><CalendarClock aria-hidden /><strong>{meetings.length}</strong><span>Appointments</span></div>
        <div className={styles.metric}><Clock3 aria-hidden /><strong>{thisWeek.length}</strong><span>Next 7 days</span></div>
        <AuraTabLink href="/my-work/approvals" tabTitle="Approvals" tabType="My Work" className={styles.metric}><CheckCircle2 aria-hidden /><strong>{decisions.length}</strong><span>Accessible decisions</span></AuraTabLink>
        <AuraTabLink href="/my-work/communication" tabTitle="Communication" tabType="My Work" className={styles.metric}><Bell aria-hidden /><strong>{unread.length}</strong><span>Unread signals</span></AuraTabLink>
      </section>

      <aside className={styles.dailyBrief} aria-label="AURA daily brief">
        <span className={styles.briefMark}><Sparkles aria-hidden /></span>
        <div><strong>AURA DAILY BRIEF</strong><p>{brief}</p></div>
        {priority ? <AuraTabLink href={priority.href} tabTitle={priority.title} tabType={priority.module}>Open first priority<ArrowRight aria-hidden /></AuraTabLink> : <AuraTabLink href="/ai" tabTitle="AURA AI" tabType="My Work">Plan next action<ArrowRight aria-hidden /></AuraTabLink>}
      </aside>

      <div className={styles.layout}>
        <div className={styles.primaryColumn}>
          <section className={styles.panel} aria-labelledby="today-plan-title">
            <header className={styles.panelHead}><div><p>FOCUS QUEUE</p><h2 id="today-plan-title">Today’s plan</h2></div><span>{overdue.length + dueToday.length}</span></header>
            {overdue.length ? <div className={styles.group}><h3><AlertTriangle aria-hidden />Overdue <span>{overdue.length}</span></h3>{overdue.map((item) => <DayWorkRow key={item.id} item={item} late busy={busyId === item.id} error={errors[item.id] || null} onAction={act} />)}</div> : null}
            {dueToday.length ? <div className={styles.group}><h3><ClipboardCheck aria-hidden />Due today <span>{dueToday.length}</span></h3>{dueToday.map((item) => <DayWorkRow key={item.id} item={item} busy={busyId === item.id} error={errors[item.id] || null} onAction={act} />)}</div> : null}
            {!overdue.length && !dueToday.length ? <Empty>Nothing overdue or due today.</Empty> : null}
          </section>

          <section className={styles.panel} aria-labelledby="appointments-title">
            <header className={styles.panelHead}><div><p>TIME-BOUND</p><h2 id="appointments-title">Appointments</h2></div><span>{meetings.length}</span></header>
            {meetings.length ? <div className={styles.meetingList}>{meetings.map((meeting) => <AuraTabLink key={meeting.id} href={meeting.href ?? `/crm/activities?record=${encodeURIComponent(meeting.id)}`} tabTitle={meeting.subject} tabType={meeting.type} className={styles.meeting}><span className={styles.meetingTime}>{formatDate(meeting.dueDate, 'Today')}</span><span><strong>{meeting.subject}</strong><small>{meeting.relatedName ?? meeting.type.replace(/_/g, ' ')}</small></span><ArrowRight aria-hidden /></AuraTabLink>)}</div> : <Empty>No meetings, inspections, site visits or presentations are scheduled in the connected calendar source.</Empty>}
          </section>

          <section className={styles.panel} aria-labelledby="week-title">
            <header className={styles.panelHead}><div><p>LOOK AHEAD</p><h2 id="week-title">Next 7 days</h2></div><span>{thisWeek.length}</span></header>
            {thisWeek.length ? thisWeek.slice(0, 6).map((item) => <DayWorkRow key={item.id} item={item} busy={busyId === item.id} error={errors[item.id] || null} onAction={act} />) : <Empty>No dated work is scheduled for the next seven days.</Empty>}
          </section>
        </div>

        <aside className={styles.secondaryColumn}>
          <section className={styles.sidePanel} aria-labelledby="decisions-title">
            <header><div><p>DECISIONS</p><h2 id="decisions-title">Accessible approvals</h2></div><AuraTabLink href="/my-work/approvals" tabTitle="Approvals" tabType="My Work">View all</AuraTabLink></header>
            {decisions.length ? <ul>{decisions.slice(0, 5).map((decision) => <li key={`${decision.module}-${decision.id}`}><AuraTabLink href={decision.href} tabTitle={decision.title} tabType={decision.kind}><span>{decision.action}</span><strong>{decision.title}</strong><small>{decision.module} · {decision.kind}</small></AuraTabLink></li>)}</ul> : <Empty>No accessible decisions are waiting.</Empty>}
            <p className={styles.truthNote}>This queue is permission-accessible; assigned-to-you ownership is not yet verified for every source module.</p>
          </section>

          <section className={styles.sidePanel} aria-labelledby="signals-title">
            <header><div><p>WHAT CHANGED</p><h2 id="signals-title">Unread signals</h2></div><AuraTabLink href="/notifications" tabTitle="Notifications" tabType="My Work">View all</AuraTabLink></header>
            {unread.length ? <ul>{unread.slice(0, 6).map((notification) => { const href = notificationHref(notification); const content = <><span><Bell aria-hidden /></span><div><strong>{notification.title}</strong><small>{notification.category}</small></div>{href ? <ArrowRight aria-hidden /> : null}</>; return <li key={notification.id} className={styles.notification}>{href ? <AuraTabLink href={href} tabTitle={notification.title} tabType={notification.category} tabKey={notification.refType === 'crm.activity' ? '/my-work/tasks' : undefined}>{content}</AuraTabLink> : <div className={styles.notificationStatic}>{content}</div>}</li>; })}</ul> : <Empty>No unread signals.</Empty>}
          </section>

          <details className={styles.coverage}>
            <summary><ShieldCheck aria-hidden />Daily source coverage</summary>
            <div><p><strong>Connected:</strong> {initialWork.coverage.connected.join(', ') || 'No sources verified'}</p>{initialWork.coverage.notConnected.map((gap) => <p key={gap.module}><strong>{gap.module} — not connected:</strong> {gap.reason}</p>)}</div>
          </details>
        </aside>
      </div>

      <footer className={styles.ownership}><ShieldCheck aria-hidden /><span><strong>My Day owns focus.</strong> My Tasks owns the personal register. Engineering, Site, Quality, HSE, Procurement and other domain workspaces own their records and workflow state.</span></footer>
      {creating ? <PersonalTaskEditor state={{ mode: 'create', dueAt: currentDate }} busy={createBusy} error={createError} onClose={() => setCreating(false)} onSave={createTask} onDelete={async () => undefined} onReschedule={() => undefined} /> : null}
    </main>
  );
}
