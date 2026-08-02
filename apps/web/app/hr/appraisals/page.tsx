import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import AppraisalClient, { type Appraisal } from '../../../components/appraisal-client';

export const dynamic = 'force-dynamic';

export default async function AppraisalsPage() {
  const appraisals = await getJson<Appraisal[]>('/api/hr/appraisals');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>HR · Performance Appraisals</h1>
      <p style={st.sub}>
        Score each competency by weight to produce a weighted <b>0–100</b> overall rating for the
        period, capture strengths and improvement areas, then <b>submit</b> for the employee to
        <b> acknowledge</b>.
      </p>
      <section style={{ marginTop: 10 }}>
        {appraisals === null ? <p style={st.muted}>API offline.</p> : <AppraisalClient initial={appraisals ?? []} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 780, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
