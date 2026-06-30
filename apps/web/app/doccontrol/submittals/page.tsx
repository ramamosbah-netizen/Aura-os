import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SubmittalsClient from '../../../components/submittals-client';

export const dynamic = 'force-dynamic';

interface Submittal {
  id: string;
  projectId: string;
  reference: string;
  title: string;
  discipline: string;
  revision: number;
  status: string;
  reviewCode: string | null;
  reviewComments: string;
}

export default async function SubmittalsPage() {
  const submittals = await getJson<Submittal[]>('/api/doccontrol/submittals');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Doc Control · Submittals</h1>
      <p style={st.sub}>
        The document submittal register — shop drawings, material data and method statements submitted
        to the consultant for review. Track draft → submitted → returned, with the standard review code:
        <b> A</b> approved, <b>B</b> approved w/ comments, <b>C</b> revise &amp; resubmit, <b>D</b> rejected.
      </p>
      <section style={{ marginTop: 10 }}>
        {submittals === null ? <p style={st.muted}>API offline.</p> : <SubmittalsClient initialSubmittals={submittals ?? []} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
