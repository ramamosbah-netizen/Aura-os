'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

type StudyItem = { id: string; statement?: string; name?: string };
type ApprovedStudy = {
  id: string; revisionNo: number; inputRevision: string; scopeSummary: string;
  requirements: StudyItem[]; systems: StudyItem[];
};
type TakeoffLine = { lineId: string; description: string; unit: string; quantity: number | null; sourceLineId: string };
type Takeoff = {
  id: string; revisionNo: number; sourceRevRef: string | null; status: 'draft' | 'approved' | 'superseded';
  approvedAt: string | null; lines: TakeoffLine[];
};
type View = { approvedStudy: ApprovedStudy | null; revisions: Takeoff[] };

const messageOf = (body: any, fallback: string) => body?.message || body?.error || fallback;

export default function TenderTakeoffPanel({
  tenderId,
  projectedBasisId,
  onProjected,
}: {
  tenderId: string;
  projectedBasisId: string | null;
  onProjected: () => Promise<void>;
}) {
  const [view, setView] = useState<View | null>(null);
  const [lines, setLines] = useState<TakeoffLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tendering/tenders/${tenderId}/quantity-takeoff`, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(messageOf(body, 'Could not load quantity take-off'));
    setView(body);
    const current = body.revisions?.at(-1) ?? null;
    setLines(current?.lines ?? []);
  }, [tenderId]);

  useEffect(() => { void load().catch((cause) => setError(cause.message)); }, [load]);
  const current = view?.revisions.at(-1) ?? null;
  const unknown = lines.filter((line) => line.quantity === null).length;
  const projected = Boolean(current && projectedBasisId === current.id);

  const seedLines = useMemo(() => {
    if (!view?.approvedStudy) return [];
    const requirements = view.approvedStudy.requirements ?? [];
    const systems = view.approvedStudy.systems ?? [];
    const source = requirements.length ? requirements : systems;
    if (source.length) return source.map((item) => ({
      description: item.statement || item.name || 'Study scope item', unit: 'no', quantity: null,
      sourceStudyItemId: item.id,
    }));
    return [{ description: view.approvedStudy.scopeSummary || 'Approved study scope', unit: 'lot', quantity: null, sourceStudyItemId: view.approvedStudy.id }];
  }, [view]);

  async function command(url: string, method: 'POST' | 'PATCH', body?: unknown) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(messageOf(payload, 'The action could not be completed'));
      await load();
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The action could not be completed');
      return null;
    } finally { setBusy(false); }
  }

  async function start() {
    const created = await command(`/api/tendering/tenders/${tenderId}/quantity-takeoff`, 'POST', { lines: seedLines });
    if (created) setNotice('Draft quantity take-off created from the approved technical study. Enter every quantity before approval.');
  }

  async function save() {
    if (!current) return;
    const saved = await command(`/api/tendering/tenders/${tenderId}/quantity-takeoff/${current.id}/lines`, 'PATCH', { lines });
    if (saved) setNotice('Draft quantities saved with their technical-study source.');
  }

  async function approve() {
    if (!current) return;
    const approved = await command(`/api/tendering/tenders/${tenderId}/quantity-takeoff/${current.id}/approve`, 'POST');
    if (approved) setNotice('Quantity take-off approved and locked. It is ready for BOQ projection.');
  }

  async function project() {
    if (!current) return;
    const result = await command(`/api/tendering/tenders/${tenderId}/quantity-takeoff/${current.id}/project-to-boq`, 'POST');
    if (result) {
      await onProjected();
      setNotice('Approved quantities projected into the Tender BOQ. Costing can now begin.');
    }
  }

  return (
    <section aria-label="Tender quantity take-off workflow" style={styles.shell}>
      <div style={styles.heading}>
        <div>
          <span style={styles.eyebrow}>TECHNICAL STUDY → QUANTITY TAKE-OFF → BOQ</span>
          <h2 style={styles.title}>Prepare quantities before pricing</h2>
          <p style={styles.help}>Every quantity stays linked to the approved study revision. Approval locks the take-off; projection creates the commercial BOQ without retyping.</p>
        </div>
        {current && <span style={styles.status(current.status)}>QTO-{String(current.revisionNo).padStart(3, '0')} · {current.status}</span>}
      </div>

      <div style={styles.steps}>
        <span style={view?.approvedStudy ? styles.done : styles.wait}>1 {view?.approvedStudy ? '✓' : '○'} Approved study</span>
        <span style={current ? styles.done : styles.wait}>2 {current ? '✓' : '○'} Quantity take-off</span>
        <span style={current?.status === 'approved' ? styles.done : styles.wait}>3 {current?.status === 'approved' ? '✓' : '○'} Technical approval</span>
        <span style={projected ? styles.done : styles.wait}>4 {projected ? '✓' : '○'} BOQ ready</span>
      </div>

      {error && <div role="alert" style={styles.error}>{error}</div>}
      {notice && <div role="status" style={styles.notice}>{notice}</div>}

      {!view ? <p style={styles.help}>Loading quantity workflow…</p> : !view.approvedStudy ? (
        <div style={styles.empty}>
          <strong>Technical Study approval is required first.</strong>
          <span>Return to the Tender dashboard, complete the structured study and obtain independent technical approval.</span>
          <a href={`/tendering/tenders/${tenderId}#study`} style={styles.link}>Open Technical Study</a>
        </div>
      ) : !current ? (
        <div style={styles.empty}>
          <strong>Approved input: S-{String(view.approvedStudy.revisionNo).padStart(3, '0')} · {view.approvedStudy.inputRevision}</strong>
          <span>Start a draft from its requirements and systems, then enter measured quantities.</span>
          <button type="button" disabled={busy || seedLines.length === 0} onClick={() => void start()} style={styles.primary}>Start quantity take-off</button>
        </div>
      ) : (
        <>
          <div style={styles.source}>Source: <strong>{current.sourceRevRef}</strong> · {lines.length} line(s) · {unknown ? `${unknown} quantity(s) unknown` : 'all quantities entered'}</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>#</th><th style={styles.th}>Description</th><th style={styles.th}>Unit</th><th style={styles.thRight}>Quantity</th><th style={styles.th}>Source</th></tr></thead>
              <tbody>{lines.map((line, index) => <tr key={line.lineId}>
                <td style={styles.td}>{index + 1}</td>
                <td style={styles.td}><input aria-label={`Description ${index + 1}`} disabled={current.status !== 'draft'} value={line.description} onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} style={styles.inputWide} /></td>
                <td style={styles.td}><input aria-label={`Unit ${index + 1}`} disabled={current.status !== 'draft'} value={line.unit} onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, unit: e.target.value } : item))} style={styles.input} /></td>
                <td style={styles.tdRight}><input aria-label={`Quantity ${index + 1}`} disabled={current.status !== 'draft'} type="number" min="0" step="any" value={line.quantity ?? ''} placeholder="Required" onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, quantity: e.target.value === '' ? null : Number(e.target.value) } : item))} style={styles.number} /></td>
                <td style={styles.td}><span title={line.sourceLineId} style={styles.sourceTag}>Study</span></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div style={styles.actions}>
            {current.status === 'draft' && <>
              <button type="button" disabled={busy} onClick={() => void save()} style={styles.secondary}>Save draft</button>
              <button type="button" disabled={busy || unknown > 0} onClick={() => void approve()} title={unknown ? 'Enter every quantity first' : 'Requires Technical Manager approval'} style={styles.primary}>Approve quantity take-off</button>
            </>}
            {current.status === 'approved' && !projected && <button type="button" disabled={busy} onClick={() => void project()} style={styles.primary}>Create BOQ from approved quantities</button>}
            {projected && <strong style={styles.good}>BOQ is linked and ready for costing ✓</strong>}
          </div>
        </>
      )}
    </section>
  );
}

const styles = {
  shell: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 } as CSSProperties,
  heading: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' } as CSSProperties,
  eyebrow: { color: 'var(--accent)', fontWeight: 800, letterSpacing: 1, fontSize: 10 } as CSSProperties,
  title: { margin: '5px 0 4px', fontSize: 18 } as CSSProperties,
  help: { margin: 0, color: 'var(--muted)', fontSize: 13, maxWidth: 720 } as CSSProperties,
  status: (status: string) => ({ border: '1px solid var(--border)', borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: status === 'approved' ? 'var(--good)' : 'var(--accent)' }) as CSSProperties,
  steps: { display: 'flex', flexWrap: 'wrap', gap: 8, padding: '14px 0', marginTop: 12, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' } as CSSProperties,
  done: { color: 'var(--good)', background: 'var(--good-soft)', borderRadius: 999, padding: '5px 9px', fontSize: 11.5, fontWeight: 700 } as CSSProperties,
  wait: { color: 'var(--muted)', background: 'var(--panel-2)', borderRadius: 999, padding: '5px 9px', fontSize: 11.5 } as CSSProperties,
  error: { marginTop: 12, color: 'var(--bad)', background: 'var(--bad-soft)', borderRadius: 8, padding: '9px 11px', fontSize: 12.5 } as CSSProperties,
  notice: { marginTop: 12, color: 'var(--good)', background: 'var(--good-soft)', borderRadius: 8, padding: '9px 11px', fontSize: 12.5 } as CSSProperties,
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '20px 0 4px', fontSize: 13 } as CSSProperties,
  link: { color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' } as CSSProperties,
  source: { margin: '14px 0 9px', fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 } as CSSProperties,
  th: { background: 'var(--panel-2)', color: 'var(--muted)', textAlign: 'left', padding: '8px 10px', fontSize: 10.5, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' } as CSSProperties,
  thRight: { background: 'var(--panel-2)', color: 'var(--muted)', textAlign: 'right', padding: '8px 10px', fontSize: 10.5, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '7px 9px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdRight: { padding: '7px 9px', borderBottom: '1px solid var(--border)', textAlign: 'right' } as CSSProperties,
  input: { width: 75, color: 'var(--text)', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 7px' } as CSSProperties,
  inputWide: { width: '100%', minWidth: 280, color: 'var(--text)', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 7px' } as CSSProperties,
  number: { width: 100, color: 'var(--text)', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 7px', textAlign: 'right' } as CSSProperties,
  sourceTag: { color: 'var(--info)', background: 'var(--info-soft)', borderRadius: 5, padding: '2px 6px', fontSize: 10.5 } as CSSProperties,
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', marginTop: 12, flexWrap: 'wrap' } as CSSProperties,
  primary: { background: 'var(--accent)', color: 'var(--accent-ink)', border: 0, borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  secondary: { background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  good: { color: 'var(--good)', fontSize: 12.5 } as CSSProperties,
};
