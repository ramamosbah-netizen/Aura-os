import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import RiskAssessmentClient, { type RiskAssessment } from '../../../components/risk-assessment-client';

export const dynamic = 'force-dynamic';

export default async function RiskAssessmentPage() {
  const ras = await getJson<RiskAssessment[]>('/api/hse/risk-assessments');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>HSE · Risk Assessments (JSA)</h1>
      <p style={st.sub}>
        Assess the hazards of each high-risk activity before work starts. Score every hazard
        likelihood × severity (1–5), record the controls, then re-score the residual risk. The
        assessment carries the highest residual band and must be <b>approved</b> before the task begins.
      </p>
      <section style={{ marginTop: 10 }}>
        {ras === null ? <p style={st.muted}>API offline.</p> : <RiskAssessmentClient initial={ras ?? []} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 800, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
