import { getJson } from '@/lib/api';
import ElvDevicesClient from '@/components/elv-devices-client';
import type { ElvDevice } from '@/lib/elv';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

/** ELV device schedule — the register that makes AURA an ELV ERP. First adopter of the operational
 *  data-table foundation: search / faceted filters (system, status) / pagination / deep-link to the
 *  Device 360 / responsive cards, all inherited from `AuraDataTable`. */
export default async function ElvDevicesPage() {
  const [devices, projects] = await Promise.all([
    getJson<ElvDevice[]>('/api/elv/devices'),
    getJson<Project[]>('/api/projects/projects'),
  ]);

  return <ElvDevicesClient initialDevices={devices ?? []} projects={projects ?? []} />;
}
