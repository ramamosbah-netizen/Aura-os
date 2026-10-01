import type { CSSProperties } from 'react';
import { fetchJson } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import ExecutiveDecisionsGrid, { type ExecutiveDecisionsView } from '@/components/executive-decisions-grid';

export const dynamic = 'force-dynamic';

/**
 * EXECUTIVE DECISIONS (F-10) — the governed decision set, read live from the system of record.
 *
 * Its own page rather than only a perspective inside the Business Command Center: that page decides
 * entry from /workspace/me, which every shipped role is refused, so a real Senior Management user was
 * redirected away from the CEO view. This page is governed by the API's own permission
 * (`intelligence.executive-decision.read`) — the read either answers or says the role may not see it.
 */
export default async function ExecutiveDecisionsPage() {
  const result = await fetchJson<ExecutiveDecisionsView>('/api/intelligence/executive-decisions');
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Executive decisions</h1>
      <p style={st.sub}>
        Each decision is answered from the records that own it. Every figure says when it was read, what it counted and
        what it left out, and opens the exact records behind it. Where a decision cannot be measured yet, it says why.
      </p>
      {result.ok
        ? <ExecutiveDecisionsGrid view={result.data} />
        : <DataStateNotice error={result.error} subject="the executive decisions" />}
    </div>
  );
}

const st = {
  page: { padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 18px', maxWidth: 760, lineHeight: 1.5 } as CSSProperties,
};
