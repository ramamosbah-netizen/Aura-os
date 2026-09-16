'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';

/**
 * The materials on a requisition (`BUY-01`, gap record `J3-05`).
 *
 * The screen this replaces offered a title, a value and a project, and labelled the money `$` while
 * the company's own record says AED. It could not say WHAT was needed, HOW MUCH, in WHAT UNIT or BY
 * WHEN — so a buyer worked from a conversation and a supplier quoted against a description.
 *
 * Two things here are the point, and both are about not showing a number that is not true:
 *
 *   THE UNIT IS NEVER TYPED. It comes from the material, so "10" is always ten of something the
 *   catalogue counts that way.
 *
 *   AN UNPRICED LINE LEAVES THE REQUISITION WITH NO VALUE. Not zero, and not the partial sum shown
 *   as if it were the total — because the value decides who may approve it, and a smaller total
 *   needs a less senior approver. The partial figure is still shown, labelled as incomplete, so a
 *   half-written draft is still useful to work from.
 */

interface Line {
  id: string;
  lineNo: number;
  materialId: string;
  materialCode: string;
  materialName: string;
  specification: string | null;
  manufacturer: string | null;
  model: string | null;
  uom: string;
  quantity: number;
  needByDate: string | null;
  estimatedUnitCost: number | null;
}

interface Summary {
  total: { lineCount: number; pricedCount: number; unpricedCount: number; pricedSubtotal: number; complete: boolean; value: number | null };
  governing: { value: number | null; derived: boolean };
  submission: { ready: boolean; reason?: string };
}

interface MaterialOption {
  id: string;
  code: string;
  name: string;
  uom: string;
  manufacturer: string | null;
  model: string | null;
}

export default function RequisitionLinesPanel({ prId, currency, editable }: {
  prId: string;
  /** The company's base currency. Never a hardcoded symbol — `$` was the defect J3-05 records. */
  currency: string;
  /** Lines are only authored while the requisition is a draft; the server enforces it regardless. */
  editable: boolean;
}) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [material, setMaterial] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [needBy, setNeedBy] = useState('');

  const money = (n: number): string =>
    `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const load = useCallback(async () => {
    try {
      const [linesRes, summaryRes] = await Promise.all([
        fetch(`/api/procurement/purchase-requests/${prId}/lines`, { cache: 'no-store' }),
        fetch(`/api/procurement/purchase-requests/${prId}/lines/summary`, { cache: 'no-store' }),
      ]);
      const linesBody = await linesRes.json().catch(() => []);
      const summaryBody = await summaryRes.json().catch(() => ({}));
      if (!linesRes.ok) throw new Error(linesBody?.message || linesBody?.error || 'Could not read the lines');
      setLines(linesBody as Line[]);
      setSummary(summaryRes.ok ? (summaryBody as Summary) : null);
    } catch (e: unknown) {
      // Says it could not answer rather than rendering an empty list, which would read as
      // "this requisition asks for nothing".
      setError(e instanceof Error ? e.message : 'Could not read the lines');
      setLines(null);
    }
  }, [prId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/inventory/materials', { cache: 'no-store' });
      if (res.ok) setMaterials((await res.json().catch(() => [])) as MaterialOption[]);
    })();
  }, []);

  const chosen = materials.find((m) => m.id === material) ?? null;

  const act = async (run: () => Promise<Response>): Promise<void> => {
    setBusy(true); setError(null);
    try {
      const res = await run();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || 'The requisition refused that');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The requisition refused that');
    } finally {
      setBusy(false);
    }
  };

  const addLine = () =>
    act(async () => {
      const res = await fetch(`/api/procurement/purchase-requests/${prId}/lines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          material,
          quantity: Number(quantity),
          estimatedUnitCost: unitCost.trim() === '' ? null : Number(unitCost),
          needByDate: needBy || null,
        }),
      });
      if (res.ok) { setMaterial(''); setQuantity(''); setUnitCost(''); setNeedBy(''); }
      return res;
    });

  if (error && lines === null) {
    return (
      <section className="panel" style={st.section}>
        <div style={st.head}>Materials requested</div>
        <p style={st.bad} data-testid="req-lines-error">{error}</p>
      </section>
    );
  }
  if (lines === null) {
    return (
      <section className="panel" style={st.section}>
        <div style={st.head}>Materials requested</div>
        <p style={st.muted}>Loading…</p>
      </section>
    );
  }

  return (
    <section className="panel" style={st.section} data-testid={`req-lines-${prId}`}>
      <div style={st.head}>
        Materials requested
        {summary && summary.total.lineCount > 0 && (
          <span className={summary.submission.ready ? 'badge badge-good' : 'badge badge-warn'}>
            {summary.submission.ready ? 'ready to submit' : 'incomplete'}
          </span>
        )}
      </div>

      {lines.length === 0 ? (
        <p style={st.muted} data-testid="req-lines-empty">
          No materials yet. A requisition needs at least one line before it can be submitted.
        </p>
      ) : (
        <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th style={st.wNum}>#</th>
              <th>Material</th>
              <th style={st.right}>Quantity</th>
              <th style={st.right}>Est. unit cost</th>
              <th style={st.right}>Line total</th>
              <th>Needed by</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} data-testid={`req-line-${l.lineNo}`}>
                <td style={st.wNum}>{l.lineNo}</td>
                <td>
                  <div style={st.strong}>{l.materialCode}</div>
                  <div style={st.sub}>{l.materialName}</div>
                  {(l.manufacturer || l.model) && (
                    <div style={st.sub}>{[l.manufacturer, l.model].filter(Boolean).join(' · ')}</div>
                  )}
                </td>
                {/* The unit travels with the number, because a quantity without one is not a quantity. */}
                <td style={st.right} data-testid={`req-line-qty-${l.lineNo}`}>{l.quantity} {l.uom}</td>
                <td style={st.right} data-testid={`req-line-cost-${l.lineNo}`}>
                  {l.estimatedUnitCost === null
                    ? <span style={st.warnText}>not priced</span>
                    : money(l.estimatedUnitCost)}
                </td>
                <td style={st.right}>
                  {l.estimatedUnitCost === null ? <span style={st.warnText}>—</span> : money(l.quantity * l.estimatedUnitCost)}
                </td>
                <td>{l.needByDate ?? <span style={st.mutedCell}>—</span>}</td>
                {editable && (
                  <td style={st.nowrap}>
                    <button type="button" className="btn btn-ghost" style={st.sm} disabled={busy}
                      onClick={() => void act(() => fetch(`/api/procurement/purchase-requests/${prId}/lines/${l.id}`, { method: 'DELETE' }))}
                      data-testid={`req-line-remove-${l.lineNo}`}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {summary && summary.total.lineCount > 0 && (
        <div style={st.foot} data-testid="req-lines-total">
          {summary.governing.value !== null ? (
            <strong data-testid="req-lines-value">{money(summary.governing.value)}</strong>
          ) : (
            <>
              {/* NOT presented as the requisition's value: it is the part that has been priced. */}
              <strong style={st.warnText} data-testid="req-lines-value">
                {money(summary.total.pricedSubtotal)} so far
              </strong>
              <span style={st.warnLine} data-testid="req-lines-incomplete">
                {summary.total.unpricedCount} of {summary.total.lineCount} lines are not priced — this
                requisition has no value yet
              </span>
            </>
          )}
          {!summary.submission.ready && summary.submission.reason && (
            <span style={st.warnLine} data-testid="req-lines-blocked">{summary.submission.reason}</span>
          )}
        </div>
      )}

      {editable && (
        <div style={st.form}>
          <select className="select" value={material} onChange={(e) => setMaterial(e.target.value)}
            data-testid="req-line-material" aria-label="Material">
            <option value="">Choose a material…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
            ))}
          </select>
          <div style={st.qty}>
            <input className="input" style={st.narrow} value={quantity} onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal" placeholder="Quantity" data-testid="req-line-quantity" aria-label="Quantity" />
            {/* The unit is shown, never entered — it belongs to the material. */}
            <span style={st.uom} data-testid="req-line-uom">{chosen?.uom ?? '—'}</span>
          </div>
          <input className="input" style={st.narrow} value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
            inputMode="decimal" placeholder={`Est. unit cost (${currency})`}
            data-testid="req-line-cost" aria-label={`Estimated unit cost in ${currency}`} />
          <input className="input" style={st.narrow} type="date" value={needBy} onChange={(e) => setNeedBy(e.target.value)}
            data-testid="req-line-needby" aria-label="Needed by" />
          <button type="button" className="btn btn-primary" disabled={busy || !material || !quantity}
            onClick={() => void addLine()} data-testid="req-line-add">
            Add material
          </button>
        </div>
      )}

      {error && <p style={st.bad} data-testid="req-lines-refusal">{error}</p>}
    </section>
  );
}

const st = {
  section: { marginTop: 14, padding: '12px 14px' } as CSSProperties,
  head: { display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14, marginBottom: 8 } as CSSProperties,
  strong: { fontWeight: 600 } as CSSProperties,
  sub: { color: 'var(--muted)', fontSize: 11.5, marginTop: 2 } as CSSProperties,
  right: { textAlign: 'right', whiteSpace: 'nowrap' } as CSSProperties,
  nowrap: { whiteSpace: 'nowrap' } as CSSProperties,
  wNum: { width: 44 } as CSSProperties,
  // Deliberately not the settled colour: some is not all.
  warnText: { color: 'var(--warn, #b7791f)', fontWeight: 600 } as CSSProperties,
  warnLine: { color: 'var(--warn, #b7791f)', fontSize: 12, textAlign: 'right', maxWidth: 520 } as CSSProperties,
  mutedCell: { color: 'var(--muted)' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13, margin: '6px 0' } as CSSProperties,
  bad: { color: 'var(--bad)', fontSize: 12.5, margin: '10px 0 0' } as CSSProperties,
  foot: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', marginTop: 12 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'center' } as CSSProperties,
  qty: { display: 'flex', alignItems: 'center', gap: 6 } as CSSProperties,
  narrow: { maxWidth: 175 } as CSSProperties,
  uom: { color: 'var(--muted)', fontSize: 12.5, minWidth: 26 } as CSSProperties,
  sm: { padding: '4px 10px', fontSize: 12 } as CSSProperties,
};
