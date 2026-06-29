import type { CSSProperties } from 'react';
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
    <div style={st.page}>
      <h1 style={st.h1}>Projects · Variation Orders</h1>
      <p style={st.sub}>
        Raise change orders against a project — additions (+) or omissions (−) — and carry them through
        approval. Approved variations roll up into the project&apos;s revised contract value.
      </p>
      <section style={{ marginTop: 10 }}>
        <VariationsClient projects={projects ?? []} initialVariations={variations ?? []} />
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 700, lineHeight: 1.5 } as CSSProperties,
};
