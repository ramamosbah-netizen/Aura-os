import { currentUser, getJson } from '@/lib/api';
import MyWorkDashboard, {
  type MyWorkDay,
  type MyWorkDecision,
  type MyWorkNotification,
} from '@/components/my-work-dashboard';

export const dynamic = 'force-dynamic';

interface SavedViewLite { id: string; userId: string | null }
interface CommunicationUnreadSummary { chat: number; mail: number; whatsapp: number; total: number }

function displayName(subject: string | undefined): string {
  const base = subject?.replace(/^u-/, '').replace(/[-_.]+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, (character) => character.toUpperCase()) : 'AURA User';
}

export default async function MyWorkPage() {
  const user = await currentUser();
  const username = user?.sub;
  const dayPath = `/api/crm/my-day${username ? `?userId=${encodeURIComponent(username)}` : ''}`;
  const [day, decisions, notifications, favorites, communicationUnread] = await Promise.all([
    getJson<MyWorkDay>(dayPath),
    getJson<MyWorkDecision[]>('/api/inbox'),
    getJson<MyWorkNotification[]>('/api/notifications'),
    getJson<SavedViewLite[]>('/api/views'),
    getJson<CommunicationUnreadSummary>('/api/comms/unread'),
  ]);

  return (
    <MyWorkDashboard
      userName={displayName(username)}
      day={day}
      decisions={decisions}
      notifications={notifications}
      communicationUnread={communicationUnread}
      favoriteCount={favorites && username ? favorites.filter((favorite) => favorite.userId === username).length : null}
    />
  );
}
