'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

interface Row {
  boqItemCode: string | null; boqDescription: string | null; prLineNo: number; materialCode: string; materialName: string;
  supplierName: string; revisionNo: number; supplierRevisionRef: string | null; quotationLineId: string; response: string;
  offered: { manufacturer: string | null; model: string | null; partNumber: string | null; description: string | null };
  complianceClaim: string | null; deviations: string | null;
  verdict: string | null; rationale: string | null; evaluatedBy: string | null; evaluatedAt: string | null;
}
interface Summary { requirements: number; offers: number; compliant: number; compliantWithDeviation: number; nonCompliant: number; noBid: number }
interface Issue {
  id: string; matrixNumber: string; revision: number; issuedBy: string; issuedAt: string; reason: string | null;
  summary: Summary; supersededBy: string | null;
}
interface View {
  live: { rows: Row[]; summary: Summary; awaiting: number };
  current: Issue | null;
  issues: Issue[];
  canIssue: boolean;
}

const VERDICT: Record<string, string> = { compliant: 'Compliant', compliant_with_deviation: 'Compliant with deviation', non_compliant: 'Not compliant' };
const when = (iso: string): string => new Date(iso).toLocaleString(DISPLAY_LOCALE, { dateStyle: 'medium', timeStyle: 'short', timeZone: DISPLAY_TIME_ZONE });
const workbookHref = (tenderId: string, issueId: string) => `/api/tendering/tenders/${tenderId}/compliance-matrix/issues/${issueId}/workbook`;

/**
 * EST-12 — THE TECHNICAL COMPLIANCE MATRIX, where the Technical Manager issues it and the tender team
 * reads it. Every verdict, count and permission here is the server's; the screen renders them and
 * offers the issue only to the reader the server says may make it. The matrix carries no price.
 */
export default function TenderComplianceMatrix({ tenderId, compact = false }: { tenderId: string; compact?: boolean }) {
  const [view, setView] = useState<View | null>(null);
  const [hidden, setHidden] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tendering/tenders/${tenderId}/compliance-matrix`, { cache: 'no-store' });
    if (res.status === 403 || res.status === 404) { setHidden(true); return; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.message ?? body.error ?? 'The compliance matrix could not be read.'); return; }
    setView(body as View);
  }, [tenderId]);

  useEffect(() => { void load(); }, [load]);

  if (hidden) return null;
  const current = view?.current ?? null;

  if (compact) {
    return (
      <div data-testid="compliance-matrix-current" style={st.compact}>
        <b>Technical compliance matrix</b>{' '}
        {!view ? '…' : current ? (
          <>
            {current.matrixNumber} Rev {current.revision} · issued by {current.issuedBy} · {when(current.issuedAt)} ·{' '}
            <a href={workbookHref(tenderId, current.id)} style={st.link}>Download (.xlsx)</a>
          </>
        ) : 'not issued yet — the Technical Manager issues it once every supplier line is judged.'}
      </div>
    );
  }

  const issue = async (): Promise<void> => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/tendering/tenders/${tenderId}/compliance-matrix/issue`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(current ? { reason } : {}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.message ?? body.error ?? 'The matrix could not be issued.'); return; }
      setReason('');
      setNotice(`${body.matrixNumber} Rev ${body.revision} issued and filed in the tender dossier.`);
      await load();
    } finally { setBusy(false); }
  };

  const live = view?.live;
  const blocked = !live ? 'Loading…'
    : live.rows.length === 0 ? 'No supplier offers on the pricing requisition yet.'
      : live.awaiting > 0 ? `${live.awaiting} quoted supplier line(s) still need a verdict.`
        : current && !reason.trim() ? 'Say why the matrix is being re-issued.' : null;

  return (
    <section data-testid="compliance-matrix" style={st.wrap} aria-labelledby="compliance-matrix-heading">
      <h2 id="compliance-matrix-heading" style={st.h2}>Technical compliance matrix</h2>
      <p style={st.muted}>
        Internal tender dossier · technical only — supplier, quotation revision and line, BOQ and requisition lineage, the Technical
        Manager&apos;s verdict with its rationale. No prices. Not part of the client submission.
      </p>
      {error && <p role="alert" style={st.err}>{error}</p>}
      {notice && <p role="status" style={st.ok}>{notice}</p>}

      {live && (
        <p data-testid="compliance-matrix-summary" style={st.summary}>
          {live.summary.offers} supplier line(s) on {live.summary.requirements} requirement(s): {live.summary.compliant} compliant,{' '}
          {live.summary.compliantWithDeviation} compliant with deviation, {live.summary.nonCompliant} not compliant, {live.summary.noBid} no bid
          {live.awaiting > 0 && <> · <b>{live.awaiting} awaiting a verdict</b></>}
        </p>
      )}

      {live && live.rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={st.table}>
            <thead>
              <tr>{['BOQ item', 'PR line', 'Material', 'Supplier', 'Revision', 'Offered', 'Supplier claim', 'Deviations', 'Verdict', 'Rationale', 'Evaluated'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {live.rows.map((r) => (
                <tr key={r.quotationLineId} data-testid="compliance-matrix-row">
                  <td style={st.td}>{r.boqItemCode ?? '—'}{r.boqDescription ? ` · ${r.boqDescription}` : ''}</td>
                  <td style={st.td}>{r.prLineNo}</td>
                  <td style={st.td}>{r.materialCode} — {r.materialName}</td>
                  <td style={st.td}>{r.supplierName}</td>
                  <td style={st.td}>Rev {r.revisionNo}{r.supplierRevisionRef ? ` · supplier ref ${r.supplierRevisionRef}` : ''}</td>
                  <td style={st.td}>{[r.offered.manufacturer, r.offered.model, r.offered.partNumber].filter(Boolean).join(' · ') || (r.response === 'no_bid' ? 'No bid' : '—')}</td>
                  <td style={st.td}>{r.complianceClaim?.replaceAll('_', ' ') ?? '—'}</td>
                  <td style={st.td}>{r.deviations ?? '—'}</td>
                  <td style={{ ...st.td, fontWeight: 700 }}>{r.verdict ? VERDICT[r.verdict] : r.response === 'no_bid' ? '—' : 'Awaiting'}</td>
                  <td style={st.td}>{r.rationale ?? '—'}</td>
                  <td style={st.td}>{r.evaluatedBy ? `${r.evaluatedBy} · ${when(r.evaluatedAt!)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view?.canIssue && (
        <div style={st.issue}>
          {current && (
            <>
              <label htmlFor="compliance-matrix-reason" style={{ fontWeight: 600, fontSize: 13 }}>Why is the matrix being re-issued?</label>
              <textarea id="compliance-matrix-reason" data-testid="compliance-matrix-reason" rows={2} value={reason}
                onChange={(e) => setReason(e.target.value)} style={st.textarea} />
            </>
          )}
          <button type="button" data-testid="compliance-matrix-issue" style={st.primary} disabled={busy || Boolean(blocked)}
            title={blocked ?? undefined} onClick={() => void issue()}>
            {current ? `Re-issue as Rev ${current.revision + 1}` : 'Issue the matrix — Rev 0'}
          </button>
          {blocked && <span style={st.mutedSmall}>{blocked}</span>}
        </div>
      )}

      {view && view.issues.length > 0 && (
        <div data-testid="compliance-matrix-issues" style={{ display: 'grid', gap: 6 }}>
          <b style={{ fontSize: 13 }}>Issued revisions</b>
          {view.issues.map((i) => (
            <div key={i.id} data-testid="compliance-matrix-issued" data-revision={i.revision} style={st.issued}>
              <span><b>{i.matrixNumber} Rev {i.revision}</b>{!i.supersededBy ? ' · current' : ' · superseded'}</span>
              <span>issued by {i.issuedBy} · {when(i.issuedAt)}</span>
              <span>{i.reason ?? 'First issue'}</span>
              <a href={workbookHref(tenderId, i.id)} data-testid={`compliance-matrix-download-${i.revision}`} style={st.link}>Download (.xlsx)</a>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const st: Record<string, CSSProperties> = {
  wrap: { marginTop: 24, display: 'grid', gap: 10, padding: 16, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' },
  h2: { fontSize: 17, margin: 0 },
  muted: { margin: 0, fontSize: 12.5, color: 'var(--muted)' },
  mutedSmall: { fontSize: 12, color: 'var(--muted)' },
  summary: { margin: 0, fontSize: 13 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' },
  issue: { display: 'grid', gap: 6, maxWidth: 560 },
  textarea: { padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit' },
  primary: { justifySelf: 'start', padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent, #fff)', fontWeight: 600, cursor: 'pointer' },
  issued: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8 },
  link: { color: 'var(--accent)', fontWeight: 600 },
  compact: { marginTop: 10, fontSize: 12.5, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 },
  err: { margin: 0, color: 'var(--bad, #b91c1c)' },
  ok: { margin: 0, color: 'var(--good, #15803d)' },
};
