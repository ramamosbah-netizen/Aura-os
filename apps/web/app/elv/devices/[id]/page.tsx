import { notFound } from 'next/navigation';
import { getJson } from '@/lib/api';
import ElvDevice360Client from '@/components/elv-device-360-client';
import type { ElvDevice } from '@/lib/elv';

export const dynamic = 'force-dynamic';

interface Project { id: string; title: string }

export default async function ElvDevice360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const device = await getJson<ElvDevice>(`/api/elv/devices/${id}`);
  if (!device || !device.id) notFound();

  const projects = await getJson<Project[]>('/api/projects/projects');
  const projectName = projects?.find((p) => p.id === device.projectId)?.title ?? device.projectId;

  return <ElvDevice360Client device={device} projectName={projectName} />;
}
