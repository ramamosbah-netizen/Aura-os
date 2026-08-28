import { currentUser, getJson } from '@/lib/api';
import AuraHomeGrid from '@/components/aura-home-grid';
import { displayName } from '@/components/aura-command-center';

export const dynamic = 'force-dynamic';

interface CommunicationUnreadSummary {
  chat: number;
  mail: number;
  whatsapp: number;
  total: number;
}

export default async function AuraHomePage() {
  const user = await currentUser();
  const unread = await getJson<CommunicationUnreadSummary>('/api/comms/unread');
  return <AuraHomeGrid userName={displayName(user?.sub) ?? 'AURA User'} communicationUnread={unread} />;
}
