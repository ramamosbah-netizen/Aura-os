import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SnagClient, { type Snag } from '../../../components/snag-client';

export const dynamic = 'force-dynamic';

export default async function SnagPage() {
  const snags = await getJson<Snag[]>('/api/quality/snags');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Quality · Snagging / Punch List</h1>
      <p style={st.sub}>
        Log defects found during pre-handover walk-downs — the punch list the client signs off against.
        Move each item <b>open → resolved → closed</b>; high-severity snags stay flagged until closed so
        nothing outstanding slips through handover.
      </p>
      <section style={{ marginTop: 10 }}>
        {snags === null ? <p style={st.muted}>API offline.</p> : <SnagClient initial={snags ?? []} />}
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
