import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import ItpClient from '../../../components/itp-client';

export const dynamic = 'force-dynamic';

interface ItpPoint { activity: string; pointType: string; acceptanceCriteria: string; result: string }
interface Itp {
  id: string;
  projectId: string;
  reference: string;
  title: string;
  discipline: string;
  status: string;
  points: ItpPoint[];
}

export default async function ItpPage() {
  const itps = await getJson<Itp[]>('/api/quality/itps');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Quality · Inspection &amp; Test Plans</h1>
      <p style={st.sub}>
        ITPs define the inspection points per work activity — Hold / Witness / Review / Surveillance —
        with acceptance criteria. Build the plan, activate it, sign off each point pass/fail, then close
        once every point is resolved.
      </p>
      <section style={{ marginTop: 10 }}>
        {itps === null ? <p style={st.muted}>API offline.</p> : <ItpClient initialItps={itps ?? []} />}
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
