import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import ClauseLibraryClient, { type Clause } from '../../../components/clause-library-client';

export const dynamic = 'force-dynamic';

export default async function ClauseLibraryPage() {
  const clauses = await getJson<Clause[]>('/api/contracts/clauses');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Contracts · Clause library</h1>
      <p style={st.sub}>
        The reusable contract language your estimators and contract admins draw on — payment terms, retention,
        LD/penalty, warranty, indemnity, insurance. Each clause carries a code, a category and tags for search,
        and is versioned: revising one bumps its revision rather than losing what it used to say.
      </p>
      <section style={{ marginTop: 10 }}>
        <ClauseLibraryClient initialClauses={clauses ?? []} />
      </section>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { padding: '28px 32px', maxWidth: 1180, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 6, maxWidth: 760, lineHeight: 1.5 },
};
