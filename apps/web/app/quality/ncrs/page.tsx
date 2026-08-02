import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import NcrClient, { type Ncr } from '../../../components/ncr-client';

export const dynamic = 'force-dynamic';

export default async function NcrPage() {
  const ncrs = await getJson<Ncr[]>('/api/quality/ncrs');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Quality · Non-Conformance Reports</h1>
      <p style={st.sub}>
        Raise an NCR when installed work fails to meet the specification or drawing. Record the root
        cause and correction, then move it through <b>raised → corrected → closed</b>. Major NCRs stay
        flagged until the correction is verified and the report is closed.
      </p>
      <section style={{ marginTop: 10 }}>
        {ncrs === null ? <p style={st.muted}>API offline.</p> : <NcrClient initial={ncrs ?? []} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 760, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
