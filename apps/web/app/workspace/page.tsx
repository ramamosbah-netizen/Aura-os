import { redirect } from 'next/navigation';
import { getJson } from '@/lib/api';
import WorkspaceHubClient, {
  type HubChannel,
  type HubMailbox,
  type HubNotification,
  type HubSavedView,
  type HubUser,
  type HubMe,
} from '../../components/workspace-hub-client';

export const dynamic = 'force-dynamic';

/**
 * Compatibility hub for personal utilities. Communication owns chat and mail; My Work owns the
 * approval queue. Notifications, saved views and search remain here temporarily behind their
 * stable aliases while the shell is simplified.
 */
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { tab = 'chat', q = '' } = await searchParams;
  // Communication owns chat and mail, while My Work owns approvals. Keep the remaining utility tabs
  // behind this compatibility hub until they receive dedicated shell surfaces.
  if (tab === 'chat' || tab === 'mail') redirect('/my-work/communication');
  if (tab === 'inbox') redirect('/my-work/approvals');
  const [me, users, channels, mailbox, views, notifications] = await Promise.all([
    getJson<HubMe>('/api/workspace/me'),
    getJson<HubUser[]>('/api/workspace/users'),
    getJson<HubChannel[]>('/api/comms/channels'),
    getJson<HubMailbox>('/api/comms/mail'),
    getJson<HubSavedView[]>('/api/views'),
    getJson<HubNotification[]>('/api/notifications'),
  ]);

  return (
    <WorkspaceHubClient
      me={me}
      users={users ?? []}
      initialChannels={channels ?? []}
      initialMailbox={mailbox ?? { inbox: [], sent: [], unread: 0 }}
      savedViews={views ?? []}
      initialNotifications={notifications ?? []}
      initialTab={tab}
      initialQuery={q}
    />
  );
}
