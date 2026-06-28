'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';

interface BankAccount {
  id: string;
  code: string;
  name: string;
}

interface Invoice {
  id: string;
  title: string;
  poTitle: string | null;
  projectName: string | null;
  status: string;
  value: number;
}

function money(n: number): string {
  return typeof n === 'number' ? '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}

export default function CfoPortal({
  bankAccounts,
  invoices,
}: {
  bankAccounts: BankAccount[];
  invoices: Invoice[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Filter approved invoices that need payment
  const pendingPayments = invoices.filter((inv) => inv.status === 'approved');

  // Sum total AP liabilities
  const apLiabilities = pendingPayments.reduce((sum, inv) => sum + inv.value, 0);

  async function payInvoice(invoiceId: string, value: number) {
    setBusyId(invoiceId);
    setErr(null);
    try {
      const defaultBank = bankAccounts && bankAccounts[0]?.id ? bankAccounts[0].id : '1010';
      const res = await fetch('/api/finance/payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          bankAccountId: defaultBank,
          amount: value,
          reference: 'CFO-PORTAL-PAY',
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Failed to post payment.');
      } else {
        router.refresh();
      }
    } catch {
      setErr('Connection error posting payment.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={s.container}>
      <h2 style={s.h2}>📈 CFO Finance Portal</h2>
      <p style={s.sub}>Real-time trial balance monitoring and accounts payable queue control.</p>

      {err && <div style={s.error}>{err}</div>}

      {/* Finance KPIs */}
      <div style={s.grid}>
        <div style={s.card}>
          <div style={s.cardVal()}>$1,250,000</div>
          <div style={s.cardLabel}>Available Liquidity</div>
          <div style={s.cardSub}>Total operating bank balance</div>
        </div>

        <div style={s.card}>
          <div style={s.cardVal(apLiabilities > 0)}>{money(apLiabilities)}</div>
          <div style={s.cardLabel}>Outstanding Accounts Payable</div>
          <div style={s.cardSub}>Approved invoices ready for disbursement</div>
        </div>

        <div style={s.card}>
          <div style={s.cardVal()}>$450,000</div>
          <div style={s.cardLabel}>Allocated Capital Reserves</div>
          <div style={s.cardSub}>Retained earnings & retention reserves</div>
        </div>
      </div>

      {/* Trial Balance Visualizer */}
      <div style={s.flexGrid}>
        <div style={{ ...s.card, flex: 1.5 }}>
          <h3 style={s.sectionTitle}>Asset & Liability Distribution</h3>
          <div style={s.chartRow}>
            <span style={s.chartLabel}>Assets (Liquid Cash)</span>
            <div style={s.barTrack}>
              <span style={{ ...s.barFill, width: '70%', background: 'var(--good)' }} />
            </div>
            <span style={s.chartValue}>$1,250,000</span>
          </div>

          <div style={s.chartRow}>
            <span style={s.chartLabel}>Liabilities (AP)</span>
            <div style={s.barTrack}>
              <span style={{ ...s.barFill, width: `${Math.min(100, (apLiabilities / 1250000) * 100)}%`, background: 'var(--bad)' }} />
            </div>
            <span style={s.chartValue}>{money(apLiabilities)}</span>
          </div>
        </div>

        {/* Immediate Disbursement Queue */}
        <div style={{ ...s.card, flex: 2 }}>
          <h3 style={s.sectionTitle}>Accounts Payable Disbursement Queue</h3>
          {pendingPayments.length === 0 ? (
            <div style={s.empty}>All vendor invoices are fully paid.</div>
          ) : (
            <ul style={s.list}>
              {pendingPayments.map((inv) => (
                <li key={inv.id} style={s.listItem}>
                  <div style={s.itemInfo}>
                    <span style={s.itemTitle}>{inv.title}</span>
                    <span style={s.itemDetail}>Project: {inv.projectName ?? 'General Overhead'}</span>
                  </div>
                  <div style={s.itemAction}>
                    <span style={s.itemVal}>{money(inv.value)}</span>
                    <button
                      disabled={busyId === inv.id}
                      onClick={() => payInvoice(inv.id, inv.value)}
                      style={s.btnPay}
                    >
                      {busyId === inv.id ? 'Paying...' : 'Record GL Payment'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 16 } as CSSProperties,
  h2: { fontSize: 20, margin: 0, fontWeight: 700 } as CSSProperties,
  sub: { fontSize: 13.5, color: 'var(--muted)', margin: 0 } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 4 } as CSSProperties,
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '20px',
  } as CSSProperties,
  cardVal: (alert?: boolean): CSSProperties => ({
    fontSize: 26,
    fontWeight: 700,
    color: alert ? 'var(--bad)' : 'var(--text)',
  }),
  cardLabel: { fontSize: 13, color: 'var(--text)', marginTop: 6, fontWeight: 600 } as CSSProperties,
  cardSub: { fontSize: 12, color: 'var(--muted)', marginTop: 2 } as CSSProperties,
  flexGrid: { display: 'flex', gap: 16 } as CSSProperties,
  sectionTitle: { fontSize: 15, margin: '0 0 16px', color: 'var(--text)', fontWeight: 600 } as CSSProperties,
  chartRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 } as CSSProperties,
  chartLabel: { fontSize: 13, color: 'var(--muted)', width: 140 } as CSSProperties,
  barTrack: { flex: 1, height: 10, background: 'var(--panel-2)', borderRadius: 999, overflow: 'hidden' } as CSSProperties,
  barFill: { display: 'block', height: '100%', borderRadius: 999 } as CSSProperties,
  chartValue: { fontSize: 13, fontWeight: 600, color: 'var(--text)', width: 90, textAlign: 'right' } as CSSProperties,
  empty: { textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: 13.5 } as CSSProperties,
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 14px',
  } as CSSProperties,
  itemInfo: { display: 'flex', flexDirection: 'column', gap: 2 } as CSSProperties,
  itemTitle: { fontSize: 13.5, fontWeight: 600 } as CSSProperties,
  itemDetail: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  itemAction: { display: 'flex', alignItems: 'center', gap: 12 } as CSSProperties,
  itemVal: { fontSize: 14, fontWeight: 700 } as CSSProperties,
  btnPay: {
    background: 'var(--good)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    padding: '5px 11px',
    fontSize: 12,
    cursor: 'pointer',
  } as CSSProperties,
  error: {
    background: 'rgba(220,53,69,0.1)',
    border: '1px solid rgba(220,53,69,0.2)',
    color: '#dc3545',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
  } as CSSProperties,
};
