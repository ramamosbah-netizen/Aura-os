import { currentUser, getJson } from '@/lib/api';
import MyDayCommandCenter, {
  type DailyDecision, type DailyMeeting, type DailyNotification,
} from '@/components/my-day-command-center';
import type { WorkItemsPayload } from '@/lib/work-items';

export const dynamic = 'force-dynamic';

interface MyDaySource {
  date: string;
  meetings: DailyMeeting[];
}

function displayName(subject: string | undefined): string {
  const base = subject?.replace(/^u-/, '').replace(/[-_.]+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, (character) => character.toUpperCase()) : 'AURA User';
}

function dubaiDate(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Dubai',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export default async function MyWorkMyDayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, query] = await Promise.all([currentUser(), searchParams]);
  const requestedUser = typeof query.userId === 'string' ? query.userId : null;
  const username = requestedUser ?? session?.sub ?? null;
  const dayPath = `/api/crm/my-day${username ? `?userId=${encodeURIComponent(username)}` : ''}`;
  const [work, day, decisions, notifications] = await Promise.all([
    getJson<WorkItemsPayload>('/api/work-items'),
    getJson<MyDaySource>(dayPath),
    getJson<DailyDecision[]>('/api/inbox'),
    getJson<DailyNotification[]>('/api/notifications'),
  ]);
  const currentDate = day?.date ?? dubaiDate();
  const safeWork: WorkItemsPayload = work ?? {
    generatedAt: new Date().toISOString(),
    items: [],
    coverage: {
      connected: [],
      notConnected: [{ module: 'My Work', reason: 'The cross-module work feed is currently unavailable or not authorized.' }],
    },
  };

  return (
    <MyDayCommandCenter
      userName={displayName(username ?? undefined)}
      currentDate={currentDate}
      initialWork={safeWork}
      meetings={day?.meetings ?? []}
      decisions={decisions ?? []}
      notifications={notifications ?? []}
    />
  );
}
