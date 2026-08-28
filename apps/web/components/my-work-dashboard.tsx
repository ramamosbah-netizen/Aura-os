import {
  Bell,
  CalendarDays,
  CheckCheck,
  CheckSquare2,
  Clock3,
  FileText,
  Star,
} from 'lucide-react';
import SuiteDashboardShell, {
  type SuiteAttentionItem,
  type SuiteMetric,
  type SuiteShortcut,
} from './suite-dashboard-shell';

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

export interface CommunicationUnreadSummary {
  chat: number;
  mail: number;
  whatsapp: number;
  total: number;
}

/**
 * My Work is a PERSONAL EXECUTION center, not a launcher for links that already live in the sidebar.
 * Three tiles were removed because each duplicated somewhere else rather than adding a personal view:
 *
 *   Files         -> `/documents/control` is a module register in the sidebar, and the personal half
 *                    (documents shared with me) is ALREADY inside Approvals, which fetches
 *                    `/api/documents/shared-with-me` alongside `/api/inbox`. Hence the label below.
 *   Contacts      -> `/crm/contacts` is a Customers entry in the sidebar. A duplicate here bought
 *                    nothing; contacts belong with the accounts they work for.
 *   Communication -> now a sidebar center in its own right. It was removed only AFTER that entry
 *                    existed: before it, this tile was one of the few ways to reach the page at all.
 *                    Contextual links from Account/Lead/Opportunity 360 are unchanged — those point
 *                    at a conversation about that record, which is a different thing from a shortcut.
 */
const SHORTCUTS: SuiteShortcut[] = [
  { label: 'My Day', description: 'Today’s plan, meetings and priorities', href: '/my-work/my-day', icon: CalendarDays, tone: 'green' },
  { label: 'Tasks', description: 'Done, in progress and to do', href: '/my-work/tasks', icon: CheckSquare2, tone: 'teal' },
  { label: 'Approvals & shared documents', description: 'Decisions awaiting you, and documents shared with you', href: '/my-work/approvals', icon: CheckCheck, tone: 'blue' },
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

function taskSignal(task: MyWorkTask): 'bad' | 'warn' | 'good' {
  if (task.when === 'OVERDUE') return 'bad';
  if (task.when === 'TODAY') return 'warn';
  return 'good';
}

export default function MyWorkDashboard({
  userName,
  day,
  decisions,
  notifications,
  communicationUnread,
  favoriteCount,
}: {
  userName: string;
  day: MyWorkDay | null;
  decisions: MyWorkDecision[] | null;
  notifications: MyWorkNotification[] | null;
  communicationUnread: CommunicationUnreadSummary | null;
  favoriteCount: number | null;
}) {
  const tasks = day ? [...day.now, ...day.meetings, ...day.next] : [];
  const uniqueTasks = tasks.filter((task, index) => tasks.findIndex((candidate) => candidate.id === task.id) === index);
  const today = uniqueTasks.slice(0, 4);
  const pendingDecisions = decisions?.length ?? 0;
  const unread = notifications?.filter((notification) => !notification.read).length ?? 0;
  const communicationUnreadCount = communicationUnread?.total ?? 0;
  const activeTaskCount = day ? day.counts.overdue + day.counts.today + day.counts.thisWeek : 0;
  const overdue = day?.counts.overdue ?? 0;
  const firstPriority = uniqueTasks.find((task) => task.when === 'OVERDUE') ?? uniqueTasks[0] ?? null;

  const metrics: SuiteMetric[] = [
    { label: 'Active tasks', value: day ? String(activeTaskCount) : '—', sub: 'open across AURA', href: '/my-work/tasks', icon: CheckSquare2, tone: 'teal' },
    { label: 'Approvals', value: decisions ? String(pendingDecisions) : '—', sub: 'accessible decisions', href: '/my-work/approvals', icon: CheckCheck, tone: 'blue' },
    { label: 'Overdue', value: day ? String(overdue) : '—', sub: 'past due date', href: '/my-work/tasks', icon: Clock3, tone: overdue > 0 ? 'red' : 'green' },
    { label: 'Unread communication', value: communicationUnread ? String(communicationUnreadCount) : notifications ? String(unread) : '—', sub: communicationUnread ? 'chat · mail · WhatsApp' : 'notification center', href: '/my-work/communication?view=unread', icon: Bell, tone: 'amber' },
  ];

  const attentionItems: SuiteAttentionItem[] | null = day === null ? null : today.map((task) => ({
    id: task.id,
    href: task.href ?? '/crm/activities',
    tabTitle: task.subject,
    tabType: task.type.replace(/_/g, ' '),
    signal: taskSignal(task),
    title: task.subject,
    subtitle: task.type.replace(/_/g, ' '),
    detailPrimary: task.relatedName ?? 'My Tasks',
    trailing: task.dueDate ?? (task.when === 'UNDATED' ? 'No date' : task.when.replace('_', ' ')),
  }));

  const briefBody = day === null
    ? 'Your personal work feed could not be loaded. I can still help you search AURA and prepare your next action.'
    : overdue > 0
      ? `You have ${overdue} overdue item${overdue === 1 ? '' : 's'}. ${firstPriority ? `“${firstPriority.subject}” is the first item to review.` : 'Open Tasks to prioritize the queue.'}`
      : pendingDecisions > 0
        ? `Your task queue has no overdue items. ${pendingDecisions} accessible decision${pendingDecisions === 1 ? ' is' : 's are'} waiting across the platform.`
        : 'Your current attention queue is clear. Use Ask AURA to prepare the day or find information across your permitted records.';

  return (
    <SuiteDashboardShell
      testId="my-work-dashboard"
      anchor={{ href: '/my-work', title: 'My Work', type: 'My Work' }}
      hero={{
        eyebrow: 'AURA OS / MY WORK',
        title: <>{greeting()}, <span>{userName}</span></>,
        lede: 'Everything requiring your attention, composed from its source workspace.',
      }}
      askAura={{ tabType: 'My Work' }}
      metrics={metrics}
      attention={{
        kicker: day?.date ? `Latest plan · ${day.date}` : 'Latest plan',
        title: 'Continue Today',
        headerLink: { href: '/my-work/my-day', label: 'Open My Day', tabTitle: 'My Day', tabType: 'My Work' },
        items: attentionItems,
        unavailableLabel: 'Your personal task feed is unavailable. Open Tasks to check the source workspace.',
        emptyLabel: 'Your personal task queue is clear for today.',
        itemTestId: 'today-attention-item',
        strip: decisions && decisions.length > 0
          ? {
              icon: CheckCheck,
              text: `${decisions.length} accessible decision${decisions.length === 1 ? '' : 's'} waiting across AURA`,
              link: { href: decisions[0]!.href, label: 'Review highest item', tabTitle: decisions[0]!.title, tabType: decisions[0]!.kind },
            }
          : communicationUnread && communicationUnreadCount > 0
            ? {
                icon: Bell,
                text: `${communicationUnreadCount} unread communication item${communicationUnreadCount === 1 ? '' : 's'} waiting`,
                link: { href: '/my-work/communication?view=unread', label: 'Open unread', tabTitle: 'Unread Communication', tabType: 'Communication' },
              }
            : null,
      }}
      brief={{
        kicker: 'Live work signals',
        title: 'AURA brief',
        body: briefBody,
        cta: { href: '/ai', label: 'Continue with AURA', tabTitle: 'AURA AI', tabType: 'My Work' },
      }}
      shortcuts={{
        kicker: 'Personal workspace',
        title: 'My Work',
        countLabel: `${SHORTCUTS.length} shortcuts`,
        itemTestId: 'my-work-shortcut',
        items: SHORTCUTS.map((shortcut) => shortcut.label === 'Favorites' ? { ...shortcut, count: favoriteCount } : shortcut),
      }}
      ownership={<><FileText aria-hidden /><span><strong>My Work owns attention.</strong> Each record and workflow remains owned by its source workspace.</span></>}
    />
  );
}
