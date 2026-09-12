'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';

export interface TestSheetPoint {
  id: string;
  pointNo: string;
  description: string;
  expected: string | null;
  actual: string | null;
  result: string;
  remarks: string | null;
}

export interface TestSheetRun {
  id: string;
  testItemId: string;
  runNo: number;
  result: string;
  actual: string | null;
  remarks: string | null;
  testedBy: string | null;
  testedAt: string;
}

/**
 * The test sheet with its RUN LINEAGE (TC-GATE-1).
 *
 * A point used to show one result, and a retest overwrote it — so a system that failed and was
 * corrected looked like a system that had always passed. Every execution is now its own row beneath
 * the point: run #1 that failed stays visible, with the value it measured and the reason it failed,
 * beside the run that later passed. The point's own line shows where it STANDS; the runs show what
 * happened, and this page deliberately shows both at once so neither can be read without the other.
 *
 * Recording a run lives here too, because a lineage nobody can add to from the UI is a feature only
 * the API has: the retest half of the workflow would be invisible to the people doing the testing.
 */
export default function CommissioningTestSheet({
  recordId, points, runs, locked,
}: { recordId: string; points: TestSheetPoint[]; runs: TestSheetRun[]; locked: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [actual, setActual] = useState('');
  const [remarks, setRemarks] = useState('');

  const runsFor = (pointId: string) => runs.filter((r) => r.testItemId === pointId).sort((a, b) => a.runNo - b.runNo);

  async function record(pointId: string, result: 'pass' | 'fail'): Promise<void> {
    setBusy(pointId);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${recordId}/test-items/${pointId}/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ result, actual: actual || undefined, remarks: remarks || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Could not record the run (${res.status})`);
      }
      setActual('');
      setRemarks('');
      setOpen(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the run');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section style={st.section} data-testid="tab-tests">
      <h2 style={st.h2}>Test Sheet</h2>
      {error && <p style={st.error} data-testid="run-error">{error}</p>}
      {points.length === 0 ? (
        <p style={st.muted}>No test points yet.</p>
      ) : (
        <div style={st.points}>
          {points.map((point) => {
            const lineage = runsFor(point.id);
            const failedBefore = lineage.some((r) => r.result === 'fail');
            return (
              <div key={point.id} style={st.point} data-testid={`test-point-${point.pointNo}`}>
                <div style={st.pointHead}>
                  <span style={st.pointNo}>{point.pointNo}</span>
                  <span style={st.pointDesc}>
                    <strong>{point.description}</strong>
                    <small>Expected: {point.expected ?? '—'}</small>
                  </span>
                  <span style={st.pointResult}>
                    <b style={resultStyle(point.result)} data-testid={`point-result-${point.pointNo}`}>{point.result}</b>
                    <small>{point.actual ? `measured ${point.actual}` : 'no measurement'}</small>
                  </span>
                  {/* A point that reads pass having once failed is the case this whole gate exists
                      for — say so on the line itself, not only in the history below it. */}
                  {failedBefore && point.result === 'pass' && (
                    <span style={st.retested} data-testid={`retested-${point.pointNo}`}>passed on retest</span>
                  )}
                </div>

                <ol style={st.runs} data-testid={`runs-${point.pointNo}`}>
                  {lineage.length === 0 ? (
                    <li style={st.runEmpty}>Never executed.</li>
                  ) : (
                    lineage.map((run) => (
                      <li key={run.id} style={st.run} data-testid={`run-${point.pointNo}-${run.runNo}`}>
                        <span style={st.runNo}>Run #{run.runNo}</span>
                        <b style={resultStyle(run.result)}>{run.result}</b>
                        <span style={st.runDetail}>{run.actual ?? '—'}</span>
                        <span style={st.runDetail}>{run.remarks ?? '—'}</span>
                        <span style={st.runWhen}>{run.testedAt.slice(0, 10)}{run.testedBy ? ` · ${run.testedBy}` : ''}</span>
                      </li>
                    ))
                  )}
                </ol>

                {!locked && (
                  open === point.id ? (
                    <div style={st.form}>
                      <input
                        style={st.input}
                        placeholder="Measured value (e.g. 71.2 m)"
                        value={actual}
                        onChange={(e) => setActual(e.target.value)}
                        disabled={!hydrated || busy === point.id}
                        data-testid={`run-actual-${point.pointNo}`}
                      />
                      <input
                        style={st.input}
                        placeholder="Remarks (required for a fail)"
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        disabled={!hydrated || busy === point.id}
                        data-testid={`run-remarks-${point.pointNo}`}
                      />
                      <button style={st.pass} disabled={!hydrated || busy === point.id} data-testid={`run-pass-${point.pointNo}`} onClick={() => record(point.id, 'pass')}>Pass</button>
                      <button style={st.fail} disabled={!hydrated || busy === point.id} data-testid={`run-fail-${point.pointNo}`} onClick={() => record(point.id, 'fail')}>Fail</button>
                      <button style={st.cancel} disabled={busy === point.id} onClick={() => { setOpen(null); setError(null); }}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      style={st.recordBtn}
                      disabled={!hydrated}
                      data-testid={`record-run-${point.pointNo}`}
                      onClick={() => { setOpen(point.id); setActual(''); setRemarks(''); setError(null); }}
                    >
                      {lineage.length === 0 ? 'Record test' : `Record retest (run #${lineage.length + 1})`}
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const resultStyle = (r: string): CSSProperties => ({
  fontWeight: 700,
  color: r === 'pass' ? 'var(--good)' : r === 'fail' ? 'var(--bad)' : 'var(--muted)',
});

const st = {
  section: { marginTop: 24 } as CSSProperties,
  h2: { fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: '0 0 8px' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 13, fontWeight: 600, margin: '0 0 10px' } as CSSProperties,
  points: { display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  point: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  pointHead: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  pointNo: { fontFamily: 'var(--mono, ui-monospace, monospace)', fontWeight: 700, fontSize: 13 } as CSSProperties,
  pointDesc: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 180, fontSize: 13 } as CSSProperties,
  pointResult: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 12 } as CSSProperties,
  retested: { padding: '3px 9px', borderRadius: 999, background: 'var(--warn-soft, rgba(234,179,8,.15))', color: 'var(--warn)', fontSize: 11, fontWeight: 700 } as CSSProperties,
  runs: { listStyle: 'none', margin: 0, padding: '0 0 0 2px', display: 'flex', flexDirection: 'column', gap: 4, borderLeft: '2px solid var(--border, #e5e7eb)' } as CSSProperties,
  run: { display: 'grid', gridTemplateColumns: '80px 54px 1fr 1fr 150px', gap: 8, alignItems: 'center', padding: '5px 10px', fontSize: 12 } as CSSProperties,
  runEmpty: { padding: '5px 10px', fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  runNo: { color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  runDetail: { color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  runWhen: { color: 'var(--muted)', textAlign: 'right' } as CSSProperties,
  form: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 170 } as CSSProperties,
  pass: { padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--good)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as CSSProperties,
  fail: { padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--bad)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as CSSProperties,
  cancel: { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  recordBtn: { alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
};
