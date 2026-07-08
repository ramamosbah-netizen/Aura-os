import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import NumberingAdminClient, { type NumberSequence } from '@/components/numbering-admin-client';

export const dynamic = 'force-dynamic';

export default async function NumberingPage() {
  const sequences = await getJson<NumberSequence[]>('/api/admin/numbering');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Administration · Document Numbering</h1>
      <p style={st.sub}>
        Each document type has a gapless sequence per fiscal year (e.g. <code style={st.code}>INV-2026-000042</code>).
        Review the current counters and set the next number, prefix, or padding.
      </p>
      {sequences === null ? (
        <p style={st.muted}>Numbering API offline.</p>
      ) : (
        <NumberingAdminClient initialSequences={sequences} />
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 960, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 12.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
