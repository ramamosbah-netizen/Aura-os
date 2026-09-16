'use client';

import { type CSSProperties, Fragment, useState } from 'react';
import ReceiptLinesPanel from './receipt-lines-panel';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

/**
 * The goods receipt register, with the receiving itself on it.
 *
 * A note used to be created and then never said what was on it — the register listed a title and a
 * value, and the one place a storekeeper could record a delivery took a single number for the whole
 * order. So "three of the twelve cameras arrived" had nowhere to be written, and the order it was
 * against read as fully received.
 *
 * Opening a note here is how what arrived gets recorded, line by line, against the ordered lines it
 * answers.
 */

interface GoodsReceipt {
  id: string;
  title: string;
  poId: string | null;
  poTitle: string | null;
  supplierName: string | null;
  projectName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

/**
 * The SHARED locale and time zone, not the ambient ones.
 *
 * This table is server-rendered and then hydrated, so a date formatted with the runtime's own
 * defaults is formatted twice — once in the server's locale and time zone, once in the browser's —
 * and React discards the markup on the mismatch. Worse than the warning: the date a reader sees can
 * differ from the date the server sent. Caught by a hydration error in the browser run.
 */
function money(n: number): string {
  return n ? n.toLocaleString(DISPLAY_LOCALE, { maximumFractionDigits: 0 }) : '—';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE });
}

export default function GrnList({ grns }: { grns: GoodsReceipt[] }) {
  /** One open at a time: the register stays readable. */
  const [openId, setOpenId] = useState<string | null>(null);

  if (grns.length === 0) {
    return <p style={s.muted}>No goods receipts yet — record one against an issued PO above.</p>;
  }

  return (
    <table style={s.table}>
      <thead>
        <tr>
          {['Goods', 'Against PO', 'Supplier', 'Project', 'Status', 'Value', 'Created', ''].map((h) => (
            <th key={h} style={s.th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grns.map((g) => (
          <Fragment key={g.id}>
            <tr>
              <td style={s.td}>{g.title}</td>
              <td style={s.tdMuted}>{g.poTitle ?? '—'}</td>
              <td style={s.tdMuted}>{g.supplierName ?? '—'}</td>
              <td style={s.tdMuted}>{g.projectName ?? '—'}</td>
              <td style={s.td}><span style={s.tag}>{g.status}</span></td>
              <td style={s.td}>{money(g.value)}</td>
              <td style={s.tdMuted}>{fmt(g.createdAt)}</td>
              <td style={s.td}>
                <div style={s.actions}>
                  <button
                    type="button"
                    style={s.btn}
                    onClick={() => setOpenId(openId === g.id ? null : g.id)}
                    data-testid={`grn-receive-toggle-${g.id}`}
                  >
                    {openId === g.id ? 'Hide' : 'What arrived'}
                  </button>
                  {/* The receipt note print view was routable but unreachable — a GRN could be
                      recorded and never produced as the document a supplier is paid against. */}
                  <a
                    href={`/inventory/grns/${g.id}/print`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Print goods receipt note (PDF)"
                    style={s.print}
                  >
                    Print
                  </a>
                </div>
              </td>
            </tr>
            {openId === g.id && (
              <tr>
                <td colSpan={8} style={s.linesCell}>
                  <ReceiptLinesPanel grnId={g.id} poId={g.poId} />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

const s = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: {
    textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 12,
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  td: { padding: '11px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdMuted: { padding: '11px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  linesCell: { padding: 0, background: 'var(--bg)' } as CSSProperties,
  actions: { display: 'flex', gap: 10, alignItems: 'center' } as CSSProperties,
  btn: {
    background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)',
    borderRadius: 8, padding: '5px 10px', fontSize: 12.5, cursor: 'pointer',
  } as CSSProperties,
  print: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: 12.5 } as CSSProperties,
  tag: {
    fontSize: 12, background: 'var(--panel-2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '2px 8px', textTransform: 'capitalize',
  } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
