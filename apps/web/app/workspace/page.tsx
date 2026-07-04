import { getJson } from '@/lib/api';
import WorkspaceHubClient, {
  type HubChannel,
  type HubInboxItem,
  type HubMailbox,
  type HubNotification,
  type HubSavedView,
  type HubUser,
  type HubMe,
} from '../../components/workspace-hub-client';

export const dynamic = 'force-dynamic';

/**
 * My Workspace — one page for everything personal: team chat (company /
 * department / direct), internal mail, the approvals inbox, notifications,
 * saved views and global search. Live data is refreshed client-side.
 */
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { tab = 'chat', q = '' } = await searchParams;
  const [me, users, channels, mailbox, inbox, views, notifications] = await Promise.all([
    getJson<HubMe>('/api/workspace/me'),
    getJson<HubUser[]>('/api/workspace/users'),
    getJson<HubChannel[]>('/api/comms/channels'),
    getJson<HubMailbox>('/api/comms/mail'),
    getJson<HubInboxItem[]>('/api/inbox'),
    getJson<HubSavedView[]>('/api/views'),
    getJson<HubNotification[]>('/api/notifications'),
  ]);

  return (
    <WorkspaceHubClient
      me={me}
      users={users ?? []}
      initialChannels={channels ?? []}
      initialMailbox={mailbox ?? { inbox: [], sent: [], unread: 0 }}
      inboxItems={inbox ?? []}
      savedViews={views ?? []}
      initialNotifications={notifications ?? []}
      initialTab={tab}
      initialQuery={q}
    />
  );
}
