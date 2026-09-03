import { getJson } from '@/lib/api';
import VariationsClient from '../../../components/variations-client';

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

export default async function VariationsPage() {
  const [projects, variations] = await Promise.all([
    getJson<Project[]>('/api/projects/projects'),
    getJson<Variation[]>('/api/projects/variations'),
  ]);

  return (
    <VariationsClient projects={projects ?? []} initialVariations={variations ?? []} />
  );
}
