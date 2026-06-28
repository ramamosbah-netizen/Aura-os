'use client';

import { type CSSProperties, useEffect, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Calibration {
  id: string;
  itemCode: string;
  description: string | null;
  calibratedPrice: number;
  realityGap: number;
  sourceCount: number;
  avgTrustScore: number;
  currency: string;
  calibratedAt: string;
}

interface Proposal {
  id: string;
  title: string;
  description: string | null;
  category: string;
  severity: string;
  mode: string;
  targetModule: string | null;
  targetAction: string | null;
  valueAmount: number | null;
  status: string;
  decidedBy: string | null;
  createdAt: string;
}

function money(n: number): string {
  return typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
}

function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Mode badge colors ────────────────────────────────────────────────────────

const MODE_COLORS: Record<string, string> = {
  observe: '#6b7280',
  suggest: '#3b82f6',
  assist: '#f59e0b',
  operate: '#10b981',
};

const SEVERITY_COLORS: Record<string, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  critical: '#ef4444',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#10b981',
  executed: '#10b981',
  rejected: '#ef4444',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function IntelligencePanel({
  initialCalibrations,
  initialProposals,
}: {
  initialCalibrations: Calibration[];
  initialProposals: Proposal[];
}) {
  const [tab, setTab] = useState<'calibrations' | 'proposals'>('calibrations');
  const [calibrations, setCalibrations] = useState<Calibration[]>(initialCalibrations);
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals);
  const [calibrating, setCalibrating] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  // Reload data on mount
  useEffect(() => {
    void loadCalibrations();
    void loadProposals();
  }, []);

  async function loadCalibrations() {
    try {
      const res = await fetch('/api/intelligence/calibrations');
      if (res.ok) setCalibrations(await res.json());
    } catch { /* degrade gracefully */ }
  }

  async function loadProposals() {
    try {
      const res = await fetch('/api/intelligence/proposals');
      if (res.ok) setProposals(await res.json());
    } catch { /* degrade gracefully */ }
  }

  async function triggerCalibration() {
    setCalibrating(true);
    try {
      const res = await fetch('/api/intelligence/calibrations', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.items) setCalibrations(data.items);
        else await loadCalibrations();
      }
    } catch { /* */ }
    setCalibrating(false);
  }

  async function handleProposalAction(id: string, action: 'execute' | 'reject') {
    setActing(id);
    try {
      await fetch(`/api/intelligence/proposals/${id}/${action}`, { method: 'POST' });
      await loadProposals();
    } catch { /* */ }
    setActing(null);
  }

  const pendingCount = proposals.filter(p => p.status === 'pending').length;

  return (
    <div>
      {/* Tab bar */}
      <div style={s.tabBar}>
        <button
          type="button"
          style={tab === 'calibrations' ? { ...s.tab, ...s.tabActive } : s.tab}
          onClick={() => setTab('calibrations')}
        >
          ⚡ IEC Pricing Calibrator
        </button>
        <button
          type="button"
          style={tab === 'proposals' ? { ...s.tab, ...s.tabActive } : s.tab}
          onClick={() => setTab('proposals')}
        >
          🧠 Autonomy Queue {pendingCount > 0 && <span style={s.badge}>{pendingCount}</span>}
        </button>
      </div>

      {/* IEC Calibrator Tab */}
      {tab === 'calibrations' && (
        <div>
          {/* Header */}
          <div style={s.sectionHeader}>
            <div>
              <h2 style={s.sectionTitle}>IEC Pricing Engine — Calibrated Rates</h2>
              <p style={s.sectionSub}>
                4-layer closed-loop algorithm: source weighting → trust decay → anomaly containment → reality gap
              </p>
            </div>
            <button type="button" style={s.actionBtn} onClick={triggerCalibration} disabled={calibrating}>
              {calibrating ? '⏳ Calibrating…' : '🔄 Run Calibration'}
            </button>
          </div>

          {/* Calibration Grid */}
          {calibrations.length === 0 ? (
            <div style={s.empty}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>No Calibrations Yet</div>
              <p style={{ color: 'var(--muted)', marginTop: 6 }}>
                Record pricing sources from POs, quotes, or subcontracts, then run a calibration to see trust-weighted rates.
              </p>
            </div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Item Code</th>
                    <th style={s.th}>Description</th>
                    <th style={s.thNum}>Calibrated Price</th>
                    <th style={s.thNum}>Reality Gap</th>
                    <th style={s.thNum}>Sources</th>
                    <th style={s.thNum}>Trust Score</th>
                    <th style={s.th}>Last Run</th>
                  </tr>
                </thead>
                <tbody>
                  {calibrations.map((c) => (
                    <tr key={c.id} style={s.row}>
                      <td style={s.cell}>
                        <span style={s.code}>{c.itemCode}</span>
                      </td>
                      <td style={s.cell}>{c.description ?? '—'}</td>
                      <td style={s.cellNum}>
                        <span style={{ fontWeight: 700 }}>{c.currency} {money(c.calibratedPrice)}</span>
                      </td>
                      <td style={s.cellNum}>
                        <span style={{
                          color: c.realityGap > 5 ? 'var(--bad, #ef4444)' : c.realityGap < -5 ? '#10b981' : 'var(--muted)',
                          fontWeight: 600,
                        }}>
                          {pct(c.realityGap)}
                        </span>
                      </td>
                      <td style={s.cellNum}>{c.sourceCount}</td>
                      <td style={s.cellNum}>
                        <div style={s.trustBar}>
                          <div style={{ ...s.trustFill, width: `${Math.min(c.avgTrustScore * 100, 100)}%` }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{(c.avgTrustScore * 100).toFixed(0)}%</span>
                      </td>
                      <td style={{ ...s.cell, color: 'var(--muted)' }}>{timeAgo(c.calibratedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Autonomy Proposals Tab */}
      {tab === 'proposals' && (
        <div>
          <div style={s.sectionHeader}>
            <div>
              <h2 style={s.sectionTitle}>Autonomy Engine — Proposal Queue</h2>
              <p style={s.sectionSub}>
                AI-driven actions staged through 4 escalation levels: Observe → Suggest → Assist → Operate
              </p>
            </div>
          </div>

          {proposals.length === 0 ? (
            <div style={s.empty}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>No Proposals</div>
              <p style={{ color: 'var(--muted)', marginTop: 6 }}>
                The autonomy engine will generate proposals when it detects cost overruns, pricing anomalies, or approval opportunities.
              </p>
            </div>
          ) : (
            <div style={s.proposalGrid}>
              {proposals.map((p) => (
                <div key={p.id} style={s.proposalCard}>
                  <div style={s.proposalHeader}>
                    <span style={{ ...s.modeBadge, background: MODE_COLORS[p.mode] ?? '#6b7280' }}>
                      {p.mode.toUpperCase()}
                    </span>
                    <span style={{ ...s.severityBadge, color: SEVERITY_COLORS[p.severity] ?? '#6b7280' }}>
                      {p.severity === 'critical' ? '🔴' : p.severity === 'warning' ? '🟡' : '🔵'} {p.severity}
                    </span>
                    <span style={{ ...s.statusBadge, color: STATUS_COLORS[p.status] ?? 'var(--muted)' }}>
                      {p.status}
                    </span>
                  </div>
                  <div style={s.proposalTitle}>{p.title}</div>
                  {p.description && <div style={s.proposalDesc}>{p.description}</div>}
                  <div style={s.proposalMeta}>
                    {p.targetModule && <span>📦 {p.targetModule}</span>}
                    {p.targetAction && <span>⚙️ {p.targetAction}</span>}
                    {p.valueAmount != null && <span>💰 ${money(p.valueAmount)}</span>}
                    <span>🕐 {timeAgo(p.createdAt)}</span>
                  </div>
                  {p.status === 'pending' && (
                    <div style={s.proposalActions}>
                      <button
                        type="button"
                        style={s.execBtn}
                        disabled={acting === p.id}
                        onClick={() => handleProposalAction(p.id, 'execute')}
                      >
                        ✅ Execute
                      </button>
                      <button
                        type="button"
                        style={s.rejectBtn}
                        disabled={acting === p.id}
                        onClick={() => handleProposalAction(p.id, 'reject')}
                      >
                        ✕ Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = {
  tabBar: {
    display: 'flex',
    gap: 4,
    marginBottom: 24,
    borderBottom: '1px solid var(--border)',
    paddingBottom: 0,
  } as CSSProperties,
  tab: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: 14,
    fontWeight: 600,
    padding: '10px 18px',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  } as CSSProperties,
  tabActive: {
    color: 'var(--accent)',
    borderBottomColor: 'var(--accent)',
  } as CSSProperties,
  badge: {
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 10,
    padding: '1px 7px',
    marginLeft: 4,
  } as CSSProperties,
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 16,
  } as CSSProperties,
  sectionTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--text)',
    margin: 0,
  } as CSSProperties,
  sectionSub: {
    fontSize: 13,
    color: 'var(--muted)',
    marginTop: 4,
    margin: 0,
  } as CSSProperties,
  actionBtn: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.15s',
  } as CSSProperties,
  empty: {
    textAlign: 'center',
    padding: '48px 20px',
    color: 'var(--muted)',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
  } as CSSProperties,
  tableWrap: { overflowX: 'auto' } as CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    overflow: 'hidden',
  } as CSSProperties,
  th: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '12px 14px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  thNum: {
    textAlign: 'right',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '12px 14px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  row: {
    borderBottom: '1px solid var(--border)',
    transition: 'background 0.1s',
  } as CSSProperties,
  cell: {
    padding: '10px 14px',
    color: 'var(--text)',
  } as CSSProperties,
  cellNum: {
    padding: '10px 14px',
    textAlign: 'right',
    color: 'var(--text)',
  } as CSSProperties,
  code: {
    fontFamily: 'monospace',
    fontSize: 12,
    background: 'rgba(255,255,255,0.06)',
    padding: '2px 6px',
    borderRadius: 4,
    color: 'var(--accent)',
  } as CSSProperties,
  trustBar: {
    width: 48,
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.08)',
    display: 'inline-block',
    marginRight: 6,
    verticalAlign: 'middle',
  } as CSSProperties,
  trustFill: {
    height: '100%',
    borderRadius: 2,
    background: 'linear-gradient(90deg, #10b981, #3b82f6)',
  } as CSSProperties,
  proposalGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: 16,
  } as CSSProperties,
  proposalCard: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  } as CSSProperties,
  proposalHeader: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  } as CSSProperties,
  modeBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    borderRadius: 4,
    padding: '2px 8px',
    letterSpacing: 0.5,
  } as CSSProperties,
  severityBadge: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'capitalize',
  } as CSSProperties,
  statusBadge: {
    fontSize: 11,
    fontWeight: 600,
    marginLeft: 'auto',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as CSSProperties,
  proposalTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text)',
  } as CSSProperties,
  proposalDesc: {
    fontSize: 13,
    color: 'var(--muted)',
    lineHeight: 1.5,
  } as CSSProperties,
  proposalMeta: {
    display: 'flex',
    gap: 14,
    flexWrap: 'wrap',
    fontSize: 12,
    color: 'var(--muted)',
  } as CSSProperties,
  proposalActions: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  } as CSSProperties,
  execBtn: {
    flex: 1,
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: 8,
    padding: '7px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  } as CSSProperties,
  rejectBtn: {
    flex: 1,
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: 8,
    padding: '7px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  } as CSSProperties,
};
