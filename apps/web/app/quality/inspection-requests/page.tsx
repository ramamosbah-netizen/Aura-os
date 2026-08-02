import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import InspectionRequestClient, { type InspectionRequest } from '../../../components/inspection-request-client';

export const dynamic = 'force-dynamic';

export default async function InspectionRequestPage() {
  const irs = await getJson<InspectionRequest[]>('/api/quality/irs');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Quality · Inspection Requests</h1>
      <p style={st.sub}>
        Raise an IR to call the consultant or QA engineer for a hold/witness inspection before the
        works are covered up. The inspector then <b>approves</b> or <b>rejects</b> with comments — a
        rejected point drives an NCR or rework before the next inspection.
      </p>
      <section style={{ marginTop: 10 }}>
        {irs === null ? <p style={st.muted}>API offline.</p> : <InspectionRequestClient initial={irs ?? []} />}
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
