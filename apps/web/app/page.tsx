import { currentUser } from '@/lib/api';
import AuraHomeGrid from '@/components/aura-home-grid';
import { displayName } from '@/components/aura-command-center';

export const dynamic = 'force-dynamic';

export default async function AuraHomePage() {
  const user = await currentUser();
  return <AuraHomeGrid userName={displayName(user?.sub) ?? 'AURA User'} />;
}
