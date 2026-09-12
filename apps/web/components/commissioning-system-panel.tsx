'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';
import CommissioningActions from './commissioning-actions';
import CommissioningTestSheet, { type TestSheetPoint, type TestSheetRun } from './commissioning-test-sheet';

interface PunchRow { id: string; description: string; severity: string; status: string; resolution: string | null; testItemId: string | null }
interface RecordRow { id: string; code: string; title: string; status: string; pointsTotal: number; pointsPassed: number }
interface Detail { record: RecordRow; testItems: TestSheetPoint[]; testRuns: TestSheetRun[]; punchItems: PunchRow[] }

/**
 * One system's testing work, opened in place inside the workspace (TC-GATE-2).
 *
 * The whole job lives here — author a point, execute it, read its run history, see what blocks
 * sign-off, then sign off — so a tester does not have to leave the list, lose their filter and find
 * their way back for every system. `/commissioning/[id]` remains the record's own address for deep
 * links; both read the SAME detail payload, so the two surfaces cannot drift.
 *
 * The detail is fetched on expand rather than shipped with the list: a project with fifty systems
 * would otherwise send fifty test sheets nobody asked for. That fetch is what the loading state
 * below is for, and it is a real state, not a decoration.
 */
export default function CommissioningSystemPanel({ recordId, onChanged }: { recordId: string; onChanged?: () => void }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Authoring a test point.
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pointNo, setPointNo] = useState('');
  const [description, setDescription] = useState('');
  const [expected, setExpected] = useState('');

  // The sheet-less tally: legitimate ONLY where no test point exists (see the service guard).
  const [tallyPassed, setTallyPassed] = useState('');
  const [tallyTotal, setTallyTotal] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${recordId}/detail`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Could not load this system (${res.status})`);
      setDetail((await res.json()) as Detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this system');
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => { void load(); }, [load]);

  /** Reconcile both halves: this panel's detail, and the totals on the page above it. */
  const reconcile = useCallback(async () => {
    await load();
    router.refresh();
    onChanged?.();
  }, [load, router, onChanged]);

  async function addPoint(): Promise<void> {
    if (busy) return; // double-submit guard: the request is in flight, not the button's problem
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${recordId}/test-items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pointNo, description, expected: expected || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Could not add the test point (${res.status})`);
      }
      setPointNo('');
      setDescription('');
      setExpected('');
      setAdding(false);
      await reconcile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the test point');
    } finally {
      setBusy(false);
    }
  }

  async function recordTally(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${recordId}/test`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pointsPassed: Number(tallyPassed), pointsTotal: Number(tallyTotal || tallyPassed) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Could not record the tally (${res.status})`);
      }
      setTallyPassed('');
      setTallyTotal('');
      await reconcile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the tally');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div style={st.state} data-testid="system-panel-loading" role="status">Loading test sheet…</div>;
  }
  if (error && !detail) {
    return (
      <div style={st.state} data-testid="system-panel-error" role="alert">
        {error}{' '}
        <button style={st.retry} onClick={() => { setLoading(true); void load(); }}>Retry</button>
      </div>
    );
  }
  if (!detail) return null;

  const locked = detail.record.status === 'commissioned';
  const openPunch = detail.punchItems.filter((p) => p.status === 'open');

  return (
    <div style={st.panel} data-testid={`system-panel-${detail.record.code}`}>
      {error && <p style={st.error} role="alert">{error}</p>}

      <CommissioningActions
        id={detail.record.id}
        status={detail.record.status}
        openPunch={openPunch.map((p) => ({ id: p.id, description: p.description, severity: p.severity }))}
        allPassed={detail.testItems.length > 0 && detail.testItems.every((t) => t.result === 'pass')}
        onChanged={reconcile}
      />

      <CommissioningTestSheet
        recordId={detail.record.id}
        points={detail.testItems}
        runs={detail.testRuns}
        locked={locked}
        onChanged={reconcile}
      />

      {!locked && (
        adding ? (
          <div style={st.addForm}>
            <input style={st.input} placeholder="Point no (e.g. PL-034)" value={pointNo} onChange={(e) => setPointNo(e.target.value)} disabled={busy} data-testid="point-no" aria-label="Test point number" />
            <input style={{ ...st.input, flex: 1 }} placeholder="What is being proven" value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} data-testid="point-description" aria-label="Test point description" />
            <input style={st.input} placeholder="Acceptance value (optional)" value={expected} onChange={(e) => setExpected(e.target.value)} disabled={busy} data-testid="point-expected" aria-label="Acceptance value" />
            <button style={st.primary} onClick={addPoint} disabled={busy || !hydrated} data-testid="point-save">{busy ? 'Adding…' : 'Add point'}</button>
            <button style={st.cancel} onClick={() => { setAdding(false); setError(null); }} disabled={busy}>Cancel</button>
          </div>
        ) : (
          <button style={st.addBtn} onClick={() => setAdding(true)} disabled={!hydrated} data-testid="add-test-point">+ Add test point</button>
        )
      )}

      {/* The tally by hand, offered ONLY where there is no sheet to contradict — a small system
          proven by a supplier certificate rather than point by point. The moment a point exists the
          service refuses this, so the control disappears before the refusal can be reached. */}
      {!locked && detail.testItems.length === 0 && (
        <div style={st.addForm} data-testid="tally-form">
          <span style={st.tallyNote}>No test sheet on this system. Add points above, or record the tally from an external test certificate:</span>
          <input style={st.input} type="number" min={0} placeholder="Points passed" value={tallyPassed} onChange={(e) => setTallyPassed(e.target.value)} disabled={busy} data-testid="tally-passed" aria-label="Points passed" />
          <input style={st.input} type="number" min={0} placeholder="Points total" value={tallyTotal} onChange={(e) => setTallyTotal(e.target.value)} disabled={busy} data-testid="tally-total" aria-label="Points total" />
          <button style={st.primary} onClick={recordTally} disabled={busy || !hydrated || !tallyPassed} data-testid="tally-save">{busy ? 'Recording…' : 'Record tally'}</button>
        </div>
      )}
    </div>
  );
}

const st = {
  panel: { display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 16px', borderTop: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
  state: { padding: '14px 16px', color: 'var(--muted)', fontSize: 13, borderTop: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
  retry: { marginLeft: 8, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 13, fontWeight: 600, margin: 0 } as CSSProperties,
  addForm: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 150 } as CSSProperties,
  primary: { padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as CSSProperties,
  cancel: { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  tallyNote: { fontSize: 11, color: 'var(--muted)', flexBasis: '100%' } as CSSProperties,
  addBtn: { alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 8, border: '1px dashed var(--border-strong, #cbd5e1)', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
};
