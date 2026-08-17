import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCheck,
  CheckSquare2,
  Clock3,
  FileText,
  FolderOpen,
  MessageSquareText,
  Sparkles,
  Star,
  UsersRound,
} from 'lucide-react';
import AuraTabLink from './aura-tab-link';
import AuraTabAnchor from './aura-tab-anchor';
import styles from './my-work-dashboard.module.css';

export interface MyWorkTask {
  id: string;
  type: string;
  subject: string;
  when: 'OVERDUE' | 'TODAY' | 'THIS_WEEK' | 'LATER' | 'UNDATED';
  dueDate: string | null;
  relatedName: string | null;
  href: string | null;
}

export interface MyWorkDay {
  date: string;
  counts: { overdue: number; today: number; thisWeek: number; meetingsToday: number };
  meetings: MyWorkTask[];
  now: MyWorkTask[];
  next: MyWorkTask[];
}

export interface MyWorkDecision {
  id: string;
  module: string;
  kind: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  createdAt: string | null;
}

export interface MyWorkNotification {
  id: string;
  title: string;
  category: string;
  read: boolean;
}

interface Shortcut {
  label: string;
  description: string;
  href: string;
  icon: typeof CheckSquare2;
  tone: string;
}

const SHORTCUTS: Shortcut[] = [
  { label: 'My Day', description: 'Today’s plan, meetings and priorities', href: '/my-work/my-day', icon: CalendarDays, tone: 'green' },
  { label: 'Tasks', description: 'Done, in progress and to do', href: '/my-work/tasks', icon: CheckSquare2, tone: 'teal' },
  { label: 'Approvals', description: 'Decisions and document reviews', href: '/my-work/approvals', icon: CheckCheck, tone: 'blue' },
  { label: 'Communication', description: 'Mail, chat, sharing and contacts', href: '/my-work/communication', icon: MessageSquareText, tone: 'amber' },
  { label: 'Contacts', description: 'People and company directory', href: '/crm/contacts', icon: UsersRound, tone: 'cyan' },
  { label: 'Files', description: 'Documents and shared records', href: '/documents/control', icon: FolderOpen, tone: 'violet' },
  { label: 'Favorites', description: 'Your saved functions and pages', href: '/my-work/favorites', icon: Star, tone: 'slate' },
];

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Dubai',
  }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function taskTone(task: MyWorkTask): string {
  if (task.when === 'OVERDUE') return styles.bad;
  if (task.when === 'TODAY') return styles.warn;
  return styles.good;
}

export default function MyWorkDashboard({
  userName,
  day,
  decisions,
  notifications,
  favoriteCount,
}: {
  userName: string;
  day: MyWorkDay | null;
  decisions: MyWorkDecision[] | null;
  notifications: MyWorkNotification[] | null;
  favoriteCount: number | null;
}) {
  const tasks = day ? [...day.now, ...day.meetings, ...day.next] : [];
  const uniqueTasks = tasks.filter((task, index) => tasks.findIndex((candidate) => candidate.id === task.id) === index);
  const today = uniqueTasks.slice(0, 4);
  const pendingDecisions = decisions?.length ?? 0;
  const unread = notifications?.filter((notification) => !notification.read).length ?? 0;
  const mentions = notifications?.filter((notification) => !notification.read && (
    notification.category.toLowerCase() === 'mention' || notification.title.includes('@')
  )).length ?? 0;
  const activeTaskCount = day ? day.counts.overdue + day.counts.today + day.counts.thisWeek : 0;
  const overdue = day?.counts.overdue ?? 0;
  const firstPriority = uniqueTasks.find((task) => task.when === 'OVERDUE') ?? uniqueTasks[0] ?? null;
  const metrics = [
    { label: 'Active tasks', value: day ? activeTaskCount : '—', href: '/my-work/tasks', icon: CheckSquare2, tone: styles.metricTeal },
    { label: 'Approvals', value: decisions ? pendingDecisions : '—', href: '/my-work/approvals', icon: CheckCheck, tone: styles.metricBlue },
    { label: 'Overdue', value: day ? overdue : '—', href: '/my-work/tasks', icon: Clock3, tone: overdue > 0 ? styles.metricRed : styles.metricGreen },
    { label: mentions > 0 ? 'Mentions' : 'Unread', value: notifications ? (mentions || unread) : '—', href: '/my-work/communication', icon: Bell, tone: styles.metricAmber },
  ];

  return (
    <div className={styles.page} data-testid="my-work-dashboard">
      <AuraTabAnchor href="/my-work" title="My Work" />
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>AURA OS / MY WORK</p>
          <h1>{greeting()}, <span>{userName}</span></h1>
          <p className={styles.lede}>Everything requiring your attention, composed from its source workspace.</p>
        </div>
        <AuraTabLink href="/ai" tabTitle="AURA AI" tabType="My Work" className={styles.askAura}><Sparkles aria-hidden />Ask AURA</AuraTabLink>
      </header>

      <section className={styles.metrics} aria-label="My work summary">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <AuraTabLink key={metric.label} href={metric.href} tabTitle={metric.label} tabType="My Work" className={`${styles.metric} ${metric.tone}`}>
              <span className={styles.metricIcon} aria-hidden><Icon /></span>
              <span><strong>{metric.value}</strong><small>{metric.label}</small></span>
              <ArrowRight className={styles.metricArrow} aria-hidden />
            </AuraTabLink>
          );
        })}
      </section>

      <div className={styles.bodyGrid}>
        <section className={styles.todayPanel} aria-labelledby="today-title">
          <div className={styles.sectionHead}>
            <div><p className={styles.sectionKicker}>{day?.date ? `Latest plan · ${day.date}` : 'Latest plan'}</p><h2 id="today-title">Continue Today</h2></div>
            <AuraTabLink href="/my-work/my-day" tabTitle="My Day" tabType="My Work">Open My Day <ArrowRight aria-hidden /></AuraTabLink>
          </div>
          {day === null ? (
            <div className={styles.empty}>Your personal task feed is unavailable. Open Tasks to check the source workspace.</div>
          ) : today.length === 0 ? (
            <div className={styles.empty}>Your personal task queue is clear for today.</div>
          ) : (
            <ol className={styles.attentionList}>
              {today.map((task) => (
                <li key={task.id}>
                  <AuraTabLink href={task.href ?? '/crm/activities'} tabTitle={task.subject} tabType={task.type.replace(/_/g, ' ')} className={styles.attentionRow} data-testid="today-attention-item">
                    <i className={`${styles.signal} ${taskTone(task)}`} aria-hidden />
                    <span className={styles.attentionMain}>
                      <strong>{task.subject}</strong>
                      <small>{task.type.replace(/_/g, ' ')}</small>
                    </span>
                    <span className={styles.attentionContext}>{task.relatedName ?? 'My Tasks'}</span>
                    <span className={styles.attentionTime}>{task.dueDate ?? (task.when === 'UNDATED' ? 'No date' : task.when.replace('_', ' '))}</span>
                    <ArrowRight aria-hidden />
                  </AuraTabLink>
                </li>
              ))}
            </ol>
          )}
          {decisions && decisions.length > 0 ? (
            <div className={styles.decisionStrip}>
              <span><CheckCheck aria-hidden />{decisions.length} accessible decision{decisions.length === 1 ? '' : 's'} waiting across AURA</span>
              <AuraTabLink href={decisions[0]!.href} tabTitle={decisions[0]!.title} tabType={decisions[0]!.kind}>Review highest item <ArrowRight aria-hidden /></AuraTabLink>
            </div>
          ) : null}
        </section>

        <aside className={styles.aiBrief} aria-labelledby="aura-brief-title">
          <span className={styles.aiMark} aria-hidden><Sparkles /></span>
          <p className={styles.sectionKicker}>Live work signals</p>
          <h2 id="aura-brief-title">AURA brief</h2>
          <p>
            {day === null
              ? 'Your personal work feed could not be loaded. I can still help you search AURA and prepare your next action.'
              : overdue > 0
                ? `You have ${overdue} overdue item${overdue === 1 ? '' : 's'}. ${firstPriority ? `“${firstPriority.subject}” is the first item to review.` : 'Open Tasks to prioritize the queue.'}`
                : pendingDecisions > 0
                  ? `Your task queue has no overdue items. ${pendingDecisions} accessible decision${pendingDecisions === 1 ? ' is' : 's are'} waiting across the platform.`
                  : 'Your current attention queue is clear. Use Ask AURA to prepare the day or find information across your permitted records.'}
          </p>
          <AuraTabLink href="/ai" tabTitle="AURA AI" tabType="My Work">Continue with AURA <ArrowRight aria-hidden /></AuraTabLink>
        </aside>
      </div>

      <section className={styles.workspaces} aria-labelledby="my-work-tools">
        <div className={styles.sectionHead}>
          <div><p className={styles.sectionKicker}>Personal workspace</p><h2 id="my-work-tools">My Work</h2></div>
          <span className={styles.toolCount}>7 shortcuts</span>
        </div>
        <div className={styles.shortcutGrid}>
          {SHORTCUTS.map((shortcut) => {
            const Icon = shortcut.icon;
            const count = shortcut.label === 'Favorites' ? favoriteCount : null;
            return (
              <AuraTabLink key={shortcut.label} href={shortcut.href} tabTitle={shortcut.label} tabType="My Work" className={`${styles.shortcut} ${styles[shortcut.tone]}`} data-testid="my-work-shortcut">
                <span className={styles.shortcutIcon} aria-hidden><Icon /></span>
                <span className={styles.shortcutCopy}><strong>{shortcut.label}</strong><small>{shortcut.description}</small></span>
                {count !== null ? <span className={styles.shortcutCount}>{count}</span> : null}
                <ArrowRight className={styles.shortcutArrow} aria-hidden />
              </AuraTabLink>
            );
          })}
        </div>
      </section>

      <footer className={styles.ownership}>
        <FileText aria-hidden />
        <span><strong>My Work owns attention.</strong> Each record and workflow remains owned by its source workspace.</span>
      </footer>
    </div>
  );
}
