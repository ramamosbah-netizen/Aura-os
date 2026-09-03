import { getJson } from '@/lib/api';
import VariationsClient from '../../../components/variations-client';
import ProjectsSuiteChrome from '../../../components/projects-suite-chrome';
import ProjectChangeControlBand, { type DeliveryVariation } from '../../../components/project-change-control-band';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
  value: number;
}

interface Variation {
  id: string;
  projectId: string;
  projectTitle: string | null;
  title: string;
  type: 'addition' | 'omission';
  amount: number;
  signedAmount: number;
  status: string;
  createdAt: string;
}

export default async function VariationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [projects, variations] = await Promise.all([
    getJson<Project[]>('/api/projects/projects'),
    getJson<Variation[]>('/api/projects/variations'),
  ]);

  const requestedStatus = (await searchParams).status;
  const initialFilter = requestedStatus === 'draft' || requestedStatus === 'submitted' || requestedStatus === 'approved' || requestedStatus === 'rejected'
    ? requestedStatus
    : 'all';

  return (
    <ProjectsSuiteChrome active="changes" title="Changes & variations" description="Control project change from first draft through review, approval and commercial readback.">
      <ProjectChangeControlBand variations={(variations ?? []) as DeliveryVariation[]} />
      <VariationsClient projects={projects ?? []} initialVariations={variations ?? []} initialFilter={initialFilter} />
    </ProjectsSuiteChrome>
  );
}
