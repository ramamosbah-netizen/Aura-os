'use client';

import type { CSSProperties } from 'react';

interface Funnel {
  accounts: number;
  tenders: number;
  contracts: number;
  projects: number;
  tenderValue: number;
  contractValue: number;
  projectValue: number;
}

interface ProjectLedger {
  projectId: string;
  projectName: string | null;
  budget: number;
  committed: number;
  invoiced: number;
  variance: number;
}

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

export default function CeoCommandCenter({
  funnel,
  winRate,
  ledgers,
  bankAccounts,
  invoices,
}: {
  funnel: Funnel | null;
  winRate: number | null;
  ledgers: ProjectLedger[];
  bankAccounts: BankAccount[];
  invoices: Invoice[];
}) {
  // Sum unpaid approved invoices as current liabilities
  const apLiabilities = invoices
    .filter((inv) => inv.status === 'approved')
    .reduce((sum, inv) => sum + inv.value, 0);

  // Compute overall contract/project portfolio value
  const contractVolume = funnel?.contractValue ?? 0;
  const projectVolume = funnel?.projectValue ?? 0;

  return (
    <div style={s.container}>
      <h2 style={s.h2}>👔 Executive CEO Command Center</h2>
      <p style={s.sub}>High-level oversight of cash position, win rate, and project execution health.</p>

      {/* KPI Cards Grid */}
      <div style={s.grid}>
        <div style={s.card}>
          <div style={s.cardVal()}>{money(contractVolume + projectVolume)}</div>
          <div style={s.cardLabel}>Active Contract Volume</div>
          <div style={s.cardSub}>Signed contracts & live project values</div>
        </div>

        <div style={s.card}>
          <div style={s.cardVal(apLiabilities > 0)}>{money(apLiabilities)}</div>
          <div style={s.cardLabel}>Accounts Payable (AP)</div>
          <div style={s.cardSub}>Approved unpaid supplier invoices</div>
        </div>

        <div style={s.card}>
          <div style={s.cardVal()}>
            {winRate === null ? 'N/A' : `${Math.round(winRate * 100)}%`}
          </div>
          <div style={s.cardLabel}>Tender Win Rate</div>
          <div style={s.cardSub}>Conversion ratio of pipeline tenders</div>
        </div>
      </div>

      {/* Project KPI Health Monitor */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Global Project Performance Monitor</h3>
        {ledgers.length === 0 ? (
          <div style={s.empty}>No projects registered.</div>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Project</th>
                  <th style={s.thNum}>Revenue Budget</th>
                  <th style={s.thNum}>Committed (POs)</th>
                  <th style={s.thNum}>Invoiced Actuals</th>
                  <th style={s.thNum}>Variance</th>
                  <th style={s.thStatus}>Financial Health</th>
                </tr>
              </thead>
              <tbody>
                {ledgers.map((l) => {
                  const isHealthy = l.variance >= 0;
                  return (
                    <tr key={l.projectId} style={s.tr}>
                      <td style={s.td}>{l.projectName ?? l.projectId}</td>
                      <td style={s.tdNum}>{money(l.budget)}</td>
                      <td style={s.tdNum}>{money(l.committed)}</td>
                      <td style={s.tdNum}>{money(l.invoiced)}</td>
                      <td style={{ ...s.tdNum, color: isHealthy ? 'var(--good)' : 'var(--bad)' }}>
                        {isHealthy ? money(l.variance) : `(${money(-l.variance)})`}
                      </td>
                      <td style={s.tdStatus}>
                        <span style={s.healthBadge(isHealthy)}>
                          {isHealthy ? '● FAVORABLE' : '▲ OVER-BUDGET'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
  section: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '20px',
    marginTop: 8,
  } as CSSProperties,
  sectionTitle: { fontSize: 15, margin: '0 0 14px', color: 'var(--text)', fontWeight: 600 } as CSSProperties,
  empty: { textAlign: 'center', padding: '20px', color: 'var(--muted)' } as CSSProperties,
  tableWrap: { overflowX: 'auto' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  thNum: {
    textAlign: 'right',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  thStatus: {
    textAlign: 'center',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  tr: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '12px', color: 'var(--text)' } as CSSProperties,
  tdNum: { padding: '12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  tdStatus: { padding: '12px', textAlign: 'center' } as CSSProperties,
  healthBadge: (healthy: boolean): CSSProperties => ({
    fontSize: 11,
    fontWeight: 700,
    color: healthy ? 'var(--good)' : '#dc3545',
    background: healthy ? 'rgba(40,167,69,0.1)' : 'rgba(220,53,69,0.1)',
    borderRadius: 6,
    padding: '3px 8px',
    textTransform: 'uppercase',
    display: 'inline-block',
  }),
};
