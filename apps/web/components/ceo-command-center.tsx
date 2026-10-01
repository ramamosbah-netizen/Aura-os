'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { classifyStatus, type DataError } from '@/lib/data-error';
import DataStateNotice from './ui/data-state';
import ExecutiveDecisionsGrid, { type ExecutiveDecisionsView } from './executive-decisions-grid';

/**
 * The CEO perspective of the Business Command Center (F-10): the governed executive decision set —
 * the SAME read, and the same tiles, as /executive, so the two can never disagree.
 *
 * It replaces KPI cards that were computed here from whatever lists the shell had loaded: a dollar
 * sign on AED money, tender and project values summed as "active contract volume", approved supplier
 * invoices labelled accounts payable, and budget minus invoiced labelled variance — none of which
 * said what it counted or when.
 */
export default function CeoCommandCenter() {
  const [state, setState] = useState<{ view: ExecutiveDecisionsView } | { error: DataError } | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/intelligence/executive-decisions', { cache: 'no-store' })
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) { setState({ error: { kind: classifyStatus(res.status), status: res.status } }); return; }
        const view = (await res.json()) as ExecutiveDecisionsView;
        if (live) setState({ view });
      })
      .catch(() => { if (live) setState({ error: { kind: 'unreachable', status: 0 } }); });
    return () => { live = false; };
  }, []);

  return (
    <div style={s.container}>
      <div style={s.head}>
        <h2 style={s.h2}>Executive decisions</h2>
        <a href="/executive" style={s.open}>Open the full page →</a>
      </div>
      {state === null ? (
        <p style={s.loading}>Reading the decision set…</p>
      ) : 'error' in state ? (
        <DataStateNotice error={state.error} subject="the executive decisions" />
      ) : (
        <ExecutiveDecisionsGrid view={state.view} />
      )}
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 } as CSSProperties,
  h2: { fontSize: 20, margin: 0, fontWeight: 700 } as CSSProperties,
  open: { fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  loading: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
};
