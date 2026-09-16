'use client';

import { type CSSProperties, Fragment, useState } from 'react';
import ReceiptLinesPanel from './receipt-lines-panel';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import { RegisterKpis, RegisterPanel, RegisterToolbar } from './ui/register-view';

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

export default function GrnList({ grns, currency, create }: {
  grns: GoodsReceipt[];
  currency: string;
  /** The register's own create control, placed where every Sales register puts it. */
  create?: React.ReactNode;
}) {
  /** One open at a time: the register stays readable. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<'all' | 'against_po' | 'unlinked'>('all');
  const [q, setQ] = useState('');

  /**
   * A note NOT against a purchase order is the one worth surfacing: nothing it records can settle
   * an ordered line, so it is goods arriving that no order is expecting.
   */
  const inView = (g: GoodsReceipt, key: typeof view) =>
    key === 'all' || (key === 'against_po' ? Boolean(g.poId) : !g.poId);
  const matches = (g: GoodsReceipt) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return [g.title, g.poTitle, g.supplierName, g.projectName].some((f) => (f ?? '').toLowerCase().includes(needle));
  };
  const visible = grns.filter((g) => inView(g, view) && matches(g));
  const count = (key: typeof view) => grns.filter((g) => inView(g, key)).length;
  const unlinked = count('unlinked');

  return (
    <>
      <RegisterKpis
        items={[
          { label: 'Receipt notes', value: String(grns.length) },
          { label: 'Against an order', value: String(count('against_po')) },
          { label: 'Not against an order', value: String(unlinked), tone: unlinked > 0 ? 'warn' : undefined },
          { label: 'Value received', value: `${currency} ${grns.reduce((sum, g) => sum + (g.value || 0), 0).toLocaleString(DISPLAY_LOCALE, { maximumFractionDigits: 0 })}`, tone: 'accent' },
        ]}
      />

      <RegisterToolbar
        views={[
          { key: 'all' as const, label: 'All', count: count('all') },
          { key: 'against_po' as const, label: 'Against an order', count: count('against_po') },
          { key: 'unlinked' as const, label: 'Not against an order', count: unlinked },
        ]}
        active={view}
        onView={setView}
        search={q}
        onSearch={setQ}
        placeholder="Search notes, orders, suppliers, projects…"
      >
        {create}
      </RegisterToolbar>

      {visible.length === 0 ? (
        <RegisterPanel scroll={false}>
          <p style={s.empty}>
            {grns.length === 0
              ? 'No goods receipts yet — record one against an issued PO above.'
              : 'No receipt note matches this view.'}
          </p>
        </RegisterPanel>
      ) : (
        <RegisterPanel testId="goods-receipts">
    <table className="data-table">
      <thead>
        <tr>
          {['Goods', 'Against PO', 'Supplier', 'Project', 'Status', 'Value', 'Created', ''].map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {visible.map((g) => (
          <Fragment key={g.id}>
            <tr>
              <td>{g.title}</td>
              <td style={s.muted}>{g.poTitle ?? '—'}</td>
              <td style={s.muted}>{g.supplierName ?? '—'}</td>
              <td style={s.muted}>{g.projectName ?? '—'}</td>
              <td><span className="badge">{g.status}</span></td>
              <td style={s.right}>{money(g.value)}</td>
              <td style={s.muted}>{fmt(g.createdAt)}</td>
              <td style={s.nowrap}>
                <div style={s.actions}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={s.sm}
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
                    style={s.link}
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
        </RegisterPanel>
      )}
    </>
  );
}

const s = {
  linesCell: { padding: 0 } as CSSProperties,
  actions: { display: 'flex', gap: 12, alignItems: 'center' } as CSSProperties,
  sm: { padding: '4px 10px', fontSize: 12 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: 12.5 } as CSSProperties,
  muted: { color: 'var(--muted)' } as CSSProperties,
  right: { textAlign: 'right', whiteSpace: 'nowrap' } as CSSProperties,
  nowrap: { whiteSpace: 'nowrap' } as CSSProperties,
  empty: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
