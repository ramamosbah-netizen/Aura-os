'use client';

import { useCallback, useEffect, useState } from 'react';

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

  const removeLine = (lineId: string) =>
    act(() => fetch(`/api/procurement/purchase-requests/${prId}/lines/${lineId}`, { method: 'DELETE' }));

  if (error && lines === null) {
    return <p style={s.error} data-testid="req-lines-error">{error}</p>;
  }
  if (lines === null) return <p style={s.muted}>Loading the materials…</p>;

  return (
    <div style={s.wrap} data-testid={`req-lines-${prId}`}>
      <h3 style={s.h3}>Materials requested</h3>

      {lines.length === 0 ? (
        <p style={s.muted} data-testid="req-lines-empty">
          No materials yet. A requisition needs at least one line before it can be submitted.
        </p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>#</th>
              <th style={s.th}>Material</th>
              <th style={s.thNum}>Quantity</th>
              <th style={s.thNum}>Est. unit cost</th>
              <th style={s.thNum}>Line total</th>
              <th style={s.th}>Needed by</th>
              {editable && <th style={s.th} />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} data-testid={`req-line-${l.lineNo}`}>
                <td style={s.td}>{l.lineNo}</td>
                <td style={s.td}>
                  <strong>{l.materialCode}</strong>
                  <div style={s.sub}>{l.materialName}</div>
                  {(l.manufacturer || l.model) && (
                    <div style={s.sub}>{[l.manufacturer, l.model].filter(Boolean).join(' · ')}</div>
                  )}
                </td>
                {/* The unit travels with the number, because a quantity without one is not a quantity. */}
                <td style={s.tdNum} data-testid={`req-line-qty-${l.lineNo}`}>{l.quantity} {l.uom}</td>
                <td style={s.tdNum} data-testid={`req-line-cost-${l.lineNo}`}>
                  {l.estimatedUnitCost === null
                    ? <span style={s.unpriced}>not priced</span>
                    : money(l.estimatedUnitCost)}
                </td>
                <td style={s.tdNum}>
                  {l.estimatedUnitCost === null ? <span style={s.unpriced}>—</span> : money(l.quantity * l.estimatedUnitCost)}
                </td>
                <td style={s.td}>{l.needByDate ?? <span style={s.muted}>—</span>}</td>
                {editable && (
                  <td style={s.td}>
                    <button type="button" style={s.link} disabled={busy}
                      onClick={() => void removeLine(l.id)} data-testid={`req-line-remove-${l.lineNo}`}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {summary && summary.total.lineCount > 0 && (
        <div style={s.totals} data-testid="req-lines-total">
          {summary.governing.value !== null ? (
            <strong data-testid="req-lines-value">{money(summary.governing.value)}</strong>
          ) : (
            <>
              {/* NOT presented as the requisition's value: it is the part that has been priced. */}
              <strong style={s.provisional} data-testid="req-lines-value">
                {money(summary.total.pricedSubtotal)} so far
              </strong>
              <span style={s.warn} data-testid="req-lines-incomplete">
                {summary.total.unpricedCount} of {summary.total.lineCount} lines are not priced — this
                requisition has no value yet
              </span>
            </>
          )}
          {!summary.submission.ready && summary.submission.reason && (
            <span style={s.warn} data-testid="req-lines-blocked">{summary.submission.reason}</span>
          )}
        </div>
      )}

      {editable && (
        <div style={s.form}>
          <select style={s.input} value={material} onChange={(e) => setMaterial(e.target.value)}
            data-testid="req-line-material" aria-label="Material">
            <option value="">Choose a material…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
            ))}
          </select>
          <div style={s.qtyWrap}>
            <input style={s.input} value={quantity} onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal" placeholder="Quantity" data-testid="req-line-quantity" aria-label="Quantity" />
            {/* The unit is shown, never entered — it belongs to the material. */}
            <span style={s.uom} data-testid="req-line-uom">{chosen?.uom ?? '—'}</span>
          </div>
          <input style={s.input} value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
            inputMode="decimal" placeholder={`Est. unit cost (${currency})`}
            data-testid="req-line-cost" aria-label={`Estimated unit cost in ${currency}`} />
          <input style={s.input} type="date" value={needBy} onChange={(e) => setNeedBy(e.target.value)}
            data-testid="req-line-needby" aria-label="Needed by" />
          <button type="button" style={s.btn} disabled={busy || !material || !quantity}
            onClick={() => void addLine()} data-testid="req-line-add">
            Add material
          </button>
        </div>
      )}

      {error && <p style={s.error} data-testid="req-lines-refusal">{error}</p>}
    </div>
  );
}

const s = {
  wrap: { marginTop: 14, border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'var(--panel)' },
  h3: { fontSize: 14, margin: '0 0 8px', letterSpacing: -0.2 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  thNum: { textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  td: { padding: '7px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' },
  tdNum: { padding: '7px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' },
  sub: { color: 'var(--muted)', fontSize: 11, marginTop: 2 },
  unpriced: { color: 'var(--warn, #b7791f)', fontSize: 12 },
  totals: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', marginTop: 10 },
  // Deliberately not the settled colour: a partial sum is not a total.
  provisional: { color: 'var(--warn, #b7791f)' },
  warn: { color: 'var(--warn, #b7791f)', fontSize: 12, textAlign: 'right', maxWidth: 520 },
  form: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' },
  qtyWrap: { display: 'flex', alignItems: 'center', gap: 6 },
  uom: { color: 'var(--muted)', fontSize: 12, minWidth: 28 },
  input: { padding: '6px 9px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)' },
  btn: { padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)' },
  link: { background: 'none', border: 'none', color: 'var(--bad)', fontSize: 12, cursor: 'pointer', padding: 0 },
  muted: { color: 'var(--muted)', fontSize: 12, margin: '4px 0' },
  error: { color: 'var(--bad)', fontSize: 12, margin: '8px 0 0' },
} as const satisfies Record<string, React.CSSProperties>;
