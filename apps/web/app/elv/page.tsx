import { getJson } from '@/lib/api';
import ElvDashboardClient from '@/components/elv-dashboard-client';
import type { ElvDevice } from '@/lib/elv';

export const dynamic = 'force-dynamic';

/** ELV Overview — the cockpit over the whole device schedule: per-system commissioning progress,
 *  status counts, and an evidence-based "needs attention" list that deep-links straight into the
 *  filtered register. All derived from the live `/api/elv/devices` list; no new backend. */
export default async function ElvDashboardPage() {
  const devices = await getJson<ElvDevice[]>('/api/elv/devices');
  return <ElvDashboardClient devices={devices ?? []} />;
}
