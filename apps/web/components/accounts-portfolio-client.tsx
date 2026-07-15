'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import AccountCreate, { AccountEdit } from './account-create';

// The Account Portfolio — every commercial relationship with its roll-up.
// Mirrors the API's GET /crm/accounts/portfolio payload.
export interface PortfolioRow {
  id: string;
  name: string;
  stage: string;
  partyType: string | null;
  industry: string | null;
  ownerId: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  paymentTerms: string | null;
  website: string | null;
  billingAddress: string | null;
  createdAt: string;
  activeDeals: number;
  pipelineValue: number;
  openTenders: number;
  quotations: number;
  contracts: number;
  contractedValue: number;
  activeProjects: number;
  outstandingAR: number;
  overdueAR: number;
  lastActivityAt: string | null;
  health: 'healthy' | 'attention' | 'at_risk';
  healthReasons: string[];
  suggestedStage: string | null;
}

const STAGE_LABEL: Record<string, string> = {
  prospect: 'Prospect',
  qualified: 'Qualified',
  active_customer: 'Active Customer',
  strategic: 'Strategic',
  dormant: 'Dormant',
  inactive: 'Inactive',
};

const STAGE_COLOR: Record<string, string> = {
  prospect: 'var(--muted)',
  qualified: 'var(--accent)',
  active_customer: 'var(--good)',
  strategic: 'var(--accent)',
  dormant: 'var(--warn, #d97706)',
  inactive: 'var(--muted)',
};

// G6 — what the party IS (the relationship stage says what it's worth right now).
const PARTY_LABEL: Record<string, string> = {
  end_client: 'End Client',
  consultant: 'Consultant',
  main_contractor: 'Main Contractor',
  developer: 'Developer',
  supplier: 'Supplier',
  partner: 'Partner',
  subcontractor: 'Subcontractor',
  government: 'Government',
  other: 'Other',
};

const HEALTH = {
  healthy: { dot: '🟢', label: 'Healthy', color: 'var(--good)' },
  attention: { dot: '🟠', label: 'Attention', color: 'var(--warn, #d97706)' },
  at_risk: { dot: '🔴', label: 'At Risk', color: 'var(--bad)' },
} as const;

type ViewKey = 'all' | 'mine' | 'prospects' | 'active' | 'strategic' | 'at_risk' | 'dormant';

function money(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
}

function ago(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function AccountsPortfolioClient({ rows, currentUserId }: {
  rows: PortfolioRow[] | null;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const all = useMemo(() => rows ?? [], [rows]);

  const kpis = useMemo(() => ({
    total: all.length,
    prospects: all.filter((r) => r.stage === 'prospect' || r.stage === 'qualified').length,
    activeCustomers: all.filter((r) => r.stage === 'active_customer' || r.stage === 'strategic').length,
    activeOpps: all.reduce((s, r) => s + r.activeDeals, 0),
    pipeline: all.reduce((s, r) => s + r.pipelineValue, 0),
    contracted: all.reduce((s, r) => s + r.contractedValue, 0),
    outstanding: all.reduce((s, r) => s + r.outstandingAR, 0),
    atRisk: all.filter((r) => r.health === 'at_risk').length,
  }), [all]);

  const views: Array<{ key: ViewKey; label: string; match: (r: PortfolioRow) => boolean }> = useMemo(() => [
    { key: 'all', label: 'All Accounts', match: () => true },
    { key: 'mine', label: 'My Accounts', match: (r) => !!currentUserId && r.ownerId === currentUserId },
    { key: 'prospects', label: 'Prospects', match: (r) => r.stage === 'prospect' || r.stage === 'qualified' },
    { key: 'active', label: 'Active Customers', match: (r) => r.stage === 'active_customer' },
    { key: 'strategic', label: 'Strategic', match: (r) => r.stage === 'strategic' },
    { key: 'at_risk', label: 'At Risk', match: (r) => r.health === 'at_risk' },
    { key: 'dormant', label: 'Dormant', match: (r) => r.stage === 'dormant' || r.stage === 'inactive' },
  ], [currentUserId]);

  const visible = useMemo(() => {
    const match = views.find((v) => v.key === view)?.match ?? (() => true);
    const needle = q.trim().toLowerCase();
    return all
      .filter(match)
      .filter((r) => !needle
        || r.name.toLowerCase().includes(needle)
        || (r.industry ?? '').toLowerCase().includes(needle)
        || (r.partyType ?? '').toLowerCase().includes(needle)
        || (r.ownerId ?? '').toLowerCase().includes(needle))
      .sort((a, b) => (b.contractedValue + b.pipelineValue) - (a.contractedValue + a.pipelineValue));
  }, [all, views, view, q]);

  async function patchAccount(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      await fetch(`/api/crm/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function assignToMe(id: string) {
    setBusy(id);
    try {
      await fetch('/api/crm/accounts/assign-owner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: id }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={st.page}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={st.h1}>CRM · Accounts</h1>
          <p style={st.sub}>
            Every customer and prospect, viewed as a complete commercial relationship — from first
            opportunity to active contracts, project delivery, financial exposure, and long-term
            account value. This is where every commercial relationship lives.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/api/crm/accounts/export/xlsx" style={st.exportBtn}>⤓ Excel</a>
          <a href="/crm/accounts/print" style={st.exportBtn}>🖨 PDF</a>
        </div>
      </div>

      {/* Executive KPIs */}
      <div style={st.kpiRow}>
        {[
          { label: 'Total Accounts', value: String(kpis.total) },
          { label: 'Prospects', value: String(kpis.prospects) },
          { label: 'Active Customers', value: String(kpis.activeCustomers), color: 'var(--good)' },
          { label: 'Active Opportunities', value: String(kpis.activeOpps) },
          { label: 'Open Pipeline', value: `AED ${money(kpis.pipeline)}`, color: 'var(--accent)' },
          { label: 'Contracted Value', value: `AED ${money(kpis.contracted)}`, color: 'var(--good)' },
          { label: 'Outstanding AR', value: `AED ${money(kpis.outstanding)}`, color: kpis.outstanding > 0 ? 'var(--warn, #d97706)' : undefined },
          { label: 'At-Risk Accounts', value: String(kpis.atRisk), color: kpis.atRisk > 0 ? 'var(--bad)' : undefined },
        ].map((k) => (
          <div key={k.label} style={st.kpi}>
            <div style={st.kpiLabel}>{k.label}</div>
            <div style={{ ...st.kpiValue, ...(k.color ? { color: k.color } : {}) }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar: create + smart views + search */}
      <AccountCreate />
      <div style={st.toolbar}>
        <div style={st.viewsRow}>
          {views.map((v) => {
            const count = all.filter(v.match).length;
            const active = view === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                style={{ ...st.viewBtn, ...(active ? st.viewBtnActive : {}) }}
              >
                {v.label}
                <span style={{ ...st.viewCount, ...(active ? { background: 'var(--accent)', color: '#fff' } : {}) }}>{count}</span>
              </button>
            );
          })}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search accounts, industries, owners…"
          style={st.search}
        />
      </div>

      <section style={st.panel}>
        {rows === null ? (
          <p style={st.muted}>API offline.</p>
        ) : visible.length === 0 ? (
          <p style={st.muted}>{all.length === 0 ? 'No accounts yet — add one above.' : 'No accounts match this view.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={st.table}>
              <thead>
                <tr>
                  {['Account', 'Relationship', 'Owner', 'Active Deals', 'Pipeline', 'Contracts', 'Projects', 'Outstanding', 'Health', 'Last Activity', ''].map((h, i) => (
                    <th key={i} style={st.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td style={st.td}>
                      <a href={`/crm/accounts/${r.id}`} style={st.nameLink}>{r.name}</a>
                      <div style={st.subCell}>
                        {r.partyType ? <span style={st.partyTag}>{PARTY_LABEL[r.partyType] ?? r.partyType}</span> : null}
                        {r.industry ?? '—'}
                      </div>
                    </td>
                    <td style={st.td}>
                      <span style={{ ...st.stageTag, color: STAGE_COLOR[r.stage] ?? 'var(--fg)', borderColor: 'var(--border)' }}>
                        {STAGE_LABEL[r.stage] ?? r.stage}
                      </span>
                      {r.suggestedStage ? (
                        <button
                          disabled={busy === r.id}
                          onClick={() => patchAccount(r.id, { status: r.suggestedStage })}
                          title="Has signed contracts — promote the relationship stage"
                          style={st.fixBtn}
                        >
                          → {STAGE_LABEL[r.suggestedStage] ?? r.suggestedStage}
                        </button>
                      ) : null}
                    </td>
                    <td style={st.td}>
                      {r.ownerId ? (
                        <span style={{ fontSize: 12.5 }}>{r.ownerId}</span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>Unassigned</span>
                          {currentUserId ? (
                            <button disabled={busy === r.id} onClick={() => assignToMe(r.id)} style={st.assignBtn}>
                              Assign to me
                            </button>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td style={st.tdNum}>{r.activeDeals || '—'}</td>
                    <td style={st.tdNum}>{r.pipelineValue ? money(r.pipelineValue) : '—'}</td>
                    <td style={st.tdNum}>
                      {r.contracts ? (
                        <span>{r.contracts} <span style={st.subCell}>· {money(r.contractedValue)}</span></span>
                      ) : '—'}
                    </td>
                    <td style={st.tdNum}>{r.activeProjects || '—'}</td>
                    <td style={{ ...st.tdNum, ...(r.overdueAR > 0 ? { color: 'var(--bad)', fontWeight: 600 } : {}) }}>
                      {r.outstandingAR ? money(r.outstandingAR) : '—'}
                    </td>
                    <td style={st.td}>
                      <span title={r.healthReasons.join(' · ') || 'No open issues'} style={{ cursor: r.healthReasons.length ? 'help' : 'default', whiteSpace: 'nowrap', fontSize: 12.5 }}>
                        {HEALTH[r.health].dot} <span style={{ color: HEALTH[r.health].color, fontWeight: 600 }}>{HEALTH[r.health].label}</span>
                      </span>
                    </td>
                    <td style={{ ...st.td, color: 'var(--muted)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{ago(r.lastActivityAt)}</td>
                    <td style={st.td}>
                      <AccountEdit account={{
                        id: r.id, name: r.name, status: r.stage, partyType: r.partyType, industry: r.industry, website: r.website,
                        phone: r.phone, email: r.email, billingAddress: r.billingAddress,
                        source: r.source, paymentTerms: r.paymentTerms,
                      }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 18px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  exportBtn: { border: '1px solid var(--border)', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none', background: 'var(--panel)', whiteSpace: 'nowrap' } as CSSProperties,
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 10, margin: '4px 0 18px' } as CSSProperties,
  kpi: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' } as CSSProperties,
  kpiLabel: { color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, whiteSpace: 'nowrap' } as CSSProperties,
  kpiValue: { fontSize: 19, fontWeight: 700, letterSpacing: -0.3, whiteSpace: 'nowrap' } as CSSProperties,
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '14px 0 12px' } as CSSProperties,
  viewsRow: { display: 'flex', gap: 6, flexWrap: 'wrap' } as CSSProperties,
  viewBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--fg)', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  viewBtnActive: { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 } as CSSProperties,
  viewCount: { fontSize: 11, background: 'var(--panel-2)', borderRadius: 999, padding: '1px 7px', color: 'var(--muted)' } as CSSProperties,
  search: { border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--fg)', borderRadius: 9, padding: '8px 12px', fontSize: 13, minWidth: 260 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '4px 8px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' } as CSSProperties,
  td: { padding: '10px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' } as CSSProperties,
  tdNum: { padding: '10px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as CSSProperties,
  nameLink: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  subCell: { color: 'var(--muted)', fontSize: 11.5, marginTop: 2 } as CSSProperties,
  partyTag: { display: 'inline-block', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 5, padding: '0 5px', marginRight: 6 } as CSSProperties,
  stageTag: { display: 'inline-block', fontSize: 12, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, whiteSpace: 'nowrap' } as CSSProperties,
  fixBtn: { display: 'block', marginTop: 4, border: '1px dashed var(--accent)', background: 'transparent', color: 'var(--accent)', borderRadius: 6, padding: '1px 7px', fontSize: 11, cursor: 'pointer' } as CSSProperties,
  assignBtn: { border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--accent)', borderRadius: 6, padding: '2px 8px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
};
