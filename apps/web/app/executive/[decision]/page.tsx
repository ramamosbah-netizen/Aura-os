import type { CSSProperties } from 'react';
import { fetchJson } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import RecordChrome from '@/components/record-chrome';
import { asOfLabel, figureText, type DecisionSummary } from '@/components/executive-decisions-grid';
import ExecutiveDecisionRecords, { type DecisionRecord } from '@/components/executive-decision-records';

export const dynamic = 'force-dynamic';

type Decision = Omit<DecisionSummary, 'recordCount'> & { currency: string; records: DecisionRecord[] };

/**
 * ONE DECISION AND THE EXACT RECORDS IT COUNTED (F-10). The API computes the figure and this list in
 * the same pass, so the list is never a filter that happens to match the tile — it IS the population.
 */
export default async function ExecutiveDecisionPage({ params }: { params: Promise<{ decision: string }> }) {
  const { decision } = await params;
  const result = await fetchJson<Decision>(`/api/intelligence/executive-decisions/${encodeURIComponent(decision)}`);
  if (!result.ok) {
    return (
      <div style={st.page}>
        <a href="/executive" style={st.back}>← Executive decisions</a>
        <DataStateNotice error={result.error} subject="this decision" />
      </div>
    );
  }
  const d = result.data;
  return (
    <div style={st.page}>
      <RecordChrome type="Executive decision" title={d.title} />
      <a href="/executive" style={st.back}>← Executive decisions</a>
      <h1 style={st.h1}>{d.title} <span style={st.cap}>{d.capability}</span></h1>
      <p style={st.sub}>{d.question}</p>
      <p style={st.meta} data-testid="decision-lineage">
        Read {asOfLabel(d.asOf)} · Source: {d.source} · Counted {d.population.counted} — {d.population.of}
      </p>
      {d.population.excluded.map((e) => <p key={e.reason} style={st.excluded}>Left out: {e.count} — {e.reason}</p>)}
      {d.basis && <p style={st.basis}>{d.basis}</p>}
      {d.state === 'unavailable' ? (
        <p style={st.unavailable}>Not measured: {d.unavailableReason}</p>
      ) : (
        <>
          <p style={st.figures}>{d.figures.map((f) => `${figureText(f, d.currency)} ${f.label}`).join(' · ')}</p>
          {d.records.length === 0
            ? <p style={st.basis}>Nothing to count right now.</p>
            : <ExecutiveDecisionRecords records={d.records} currency={d.currency} />}
        </>
      )}
    </div>
  );
}

const st = {
  page: { padding: '28px 28px 64px' } as CSSProperties,
  back: { fontSize: 13, color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  h1: { fontSize: 26, margin: '10px 0 4px', letterSpacing: -0.4 } as CSSProperties,
  cap: { fontSize: 13, color: 'var(--muted)', fontWeight: 500 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 10px' } as CSSProperties,
  meta: { fontSize: 12.5, margin: '0 0 6px' } as CSSProperties,
  excluded: { fontSize: 12, margin: '0 0 4px', color: 'var(--warn, var(--muted))' } as CSSProperties,
  basis: { fontSize: 12, margin: '0 0 10px', color: 'var(--muted)', maxWidth: 820, lineHeight: 1.45 } as CSSProperties,
  figures: { fontSize: 14, fontWeight: 650, margin: '6px 0 14px' } as CSSProperties,
  unavailable: { fontSize: 14, color: 'var(--bad)' } as CSSProperties,
};
