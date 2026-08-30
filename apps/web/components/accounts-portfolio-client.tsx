'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import AccountCreate, { AccountEdit } from './account-create';

interface TeamUser { username: string; role?: string; roleLabel?: string; isAdmin?: boolean }

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

export interface PortfolioSummary {
  totalAccounts: number;
  activeCustomers: number;
  prospects: number;
  strategicAccounts: number;
  atRiskAccounts: number;
  totalPipeline: number;
  activeDeals: number;
  contractedValue: number;
  outstandingAR: number;
}

export interface PortfolioPage {
  items: PortfolioRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  summary: PortfolioSummary;
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
  dormant: 'var(--warn, var(--warn))',
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
  attention: { dot: '🟠', label: 'Attention', color: 'var(--warn, var(--warn))' },
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

export default function AccountsPortfolioClient({ initialPage, rows, currentUserId }: {
  initialPage?: PortfolioPage | null;
  /** Legacy Accounts route compatibility; Customers uses the paged contract. */
  rows?: PortfolioRow[] | null;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const seedPage: PortfolioPage | null = initialPage ?? (rows ? {
    items: rows, total: rows.length, limit: Math.max(rows.length, 1), offset: 0, hasMore: false,
    summary: {
      totalAccounts: rows.length,
      activeCustomers: rows.filter((r) => r.stage === 'active_customer' || r.stage === 'strategic').length,
      prospects: rows.filter((r) => r.stage === 'prospect' || r.stage === 'qualified').length,
      strategicAccounts: rows.filter((r) => r.stage === 'strategic').length,
      atRiskAccounts: rows.filter((r) => r.health === 'at_risk').length,
      totalPipeline: rows.reduce((sum, r) => sum + r.pipelineValue, 0),
      activeDeals: rows.reduce((sum, r) => sum + r.activeDeals, 0),
      contractedValue: rows.reduce((sum, r) => sum + r.contractedValue, 0),
      outstandingAR: rows.reduce((sum, r) => sum + r.outstandingAR, 0),
    },
  } : null);
  const [page, setPage] = useState<PortfolioPage | null>(seedPage);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // `router.refresh()` replaces the server-provided portfolio after a create/update, but this
  // client component intentionally owns its own paging/filter state. Keep the local snapshot in
  // step with the refreshed server contract so a successful mutation is visible immediately (and
  // does not leave the user looking at the pre-mutation empty state).
  useEffect(() => {
    setPage(seedPage);
  // The server snapshot is the refresh signal; filter-driven refetches below remain authoritative
  // once the client starts interacting with the portfolio.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPage]);
  // Ownership is a workspace username; "me" comes from /workspace/me (the session
  // `sub` passed from the server need not equal the username and is null in dev).
  const [me, setMe] = useState<TeamUser | null>(null);
  const [team, setTeam] = useState<TeamUser[]>([]);

  useEffect(() => {
    void (async () => {
      const [meRes, teamRes] = await Promise.all([
        fetch('/api/workspace/me', { cache: 'no-store' }).catch(() => null),
        fetch('/api/workspace/users', { cache: 'no-store' }).catch(() => null),
      ]);
      if (meRes?.ok) {
        const m = (await meRes.json().catch(() => null)) as TeamUser | null;
        if (m && m.username) setMe(m);
      }
      if (teamRes?.ok) {
        const t = (await teamRes.json().catch(() => [])) as TeamUser[];
        if (Array.isArray(t)) setTeam(t);
      }
    })();
  }, []);

  const myId = me?.username ?? currentUserId;
  const canManage = !!me && (me.isAdmin === true || /manager|executive|admin|lead/i.test(me.roleLabel ?? ''));
  const ownerLabel = (username: string): string => {
    const u = team.find((t) => t.username === username);
    return u?.roleLabel ? `${username} · ${u.roleLabel}` : username;
  };

  const all = useMemo(() => page?.items ?? [], [page]);

  const kpis = useMemo(() => ({
    total: page?.summary.totalAccounts ?? page?.total ?? 0,
    prospects: page?.summary.prospects ?? all.filter((r) => r.stage === 'prospect' || r.stage === 'qualified').length,
    activeCustomers: page?.summary.activeCustomers ?? all.filter((r) => r.stage === 'active_customer' || r.stage === 'strategic').length,
    activeOpps: page?.summary.activeDeals ?? all.reduce((s, r) => s + r.activeDeals, 0),
    pipeline: page?.summary.totalPipeline ?? all.reduce((s, r) => s + r.pipelineValue, 0),
    contracted: page?.summary.contractedValue ?? all.reduce((s, r) => s + r.contractedValue, 0),
    outstanding: page?.summary.outstandingAR ?? all.reduce((s, r) => s + r.outstandingAR, 0),
    atRisk: page?.summary.atRiskAccounts ?? all.filter((r) => r.health === 'at_risk').length,
  }), [all, page]);

  const views: Array<{ key: ViewKey; label: string; match: (r: PortfolioRow) => boolean }> = useMemo(() => [
    { key: 'all', label: 'All Accounts', match: () => true },
    { key: 'mine', label: 'My Accounts', match: (r) => !!myId && r.ownerId === myId },
    { key: 'prospects', label: 'Prospects', match: (r) => r.stage === 'prospect' || r.stage === 'qualified' },
    { key: 'active', label: 'Active Customers', match: (r) => r.stage === 'active_customer' || r.stage === 'strategic' },
    { key: 'strategic', label: 'Strategic', match: (r) => r.stage === 'strategic' },
    { key: 'at_risk', label: 'At Risk', match: (r) => r.health === 'at_risk' },
    { key: 'dormant', label: 'Dormant', match: (r) => r.stage === 'dormant' || r.stage === 'inactive' },
  ], [myId]);

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

  const viewCount = (key: ViewKey): number => {
    if (!page) return 0;
    if (key === 'all') return page.summary.totalAccounts;
    if (key === 'prospects') return page.summary.prospects;
    if (key === 'active') return page.summary.activeCustomers;
    if (key === 'strategic') return page.summary.strategicAccounts;
    if (key === 'at_risk') return page.summary.atRiskAccounts;
    return all.filter(views.find((v) => v.key === key)?.match ?? (() => true)).length;
  };

  // The page contract owns search, status filters, and pagination. Keep the
  // rendered rows bounded even for large tenants; only the initial response is
  // server-rendered and subsequent changes use the same BFF contract.
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const status = view === 'prospects' ? 'prospect,qualified'
        : view === 'active' ? 'active_customer,strategic'
        : view === 'strategic' ? 'strategic'
        : view === 'dormant' ? 'dormant,inactive' : '';
      const params = new URLSearchParams({ limit: String(page?.limit ?? 50), offset: String(view === 'all' && !q ? (page?.offset ?? 0) : 0) });
      if (q.trim()) params.set('search', q.trim());
      if (status) params.set('status', status);
      if (view === 'at_risk') params.set('health', 'at_risk');
      if (view === 'mine' && myId) params.set('ownerId', myId);
      setLoading(true);
      void fetch(`/api/crm/accounts/portfolio/paged?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
        .then(async (res) => {
          if (res.ok) return res.json();
          const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
          const fallback = res.status === 401 ? 'Authentication required.'
            : res.status === 403 ? "You don't have access to customer accounts."
              : res.status >= 500 ? 'Customer account service temporarily unavailable. Retry in a moment.'
                : 'Could not load customer accounts.';
          throw new Error(body.message ?? body.error ?? fallback);
        })
        .then((next: PortfolioPage | null) => { if (next) { setErr(''); setPage(next); } })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          setErr(cause instanceof Error ? cause.message : 'Could not load customer accounts.');
        })
        .finally(() => setLoading(false));
    }, q ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  // myId is intentionally included so “My Accounts” refetches once identity loads.
  }, [q, view, myId]);

  const goToPage = (nextOffset: number) => {
    const params = new URLSearchParams({ limit: String(page?.limit ?? 50), offset: String(nextOffset) });
    if (q.trim()) params.set('search', q.trim());
    const status = view === 'prospects' ? 'prospect,qualified'
      : view === 'active' ? 'active_customer,strategic'
      : view === 'strategic' ? 'strategic'
      : view === 'dormant' ? 'dormant,inactive' : '';
    if (status) params.set('status', status);
    if (view === 'at_risk') params.set('health', 'at_risk');
    if (view === 'mine' && myId) params.set('ownerId', myId);
    void fetch(`/api/crm/accounts/portfolio/paged?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        if (res.ok) return res.json();
        throw new Error(res.status >= 500 ? 'Customer account service temporarily unavailable. Retry in a moment.' : 'Could not load customer accounts.');
      })
      .then((next: PortfolioPage | null) => { if (next) { setErr(''); setPage(next); } })
      .catch((cause: unknown) => setErr(cause instanceof Error ? cause.message : 'Could not load customer accounts.'));
  };

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

  // Assign ownership by stamping the username straight through the account PATCH.
  // The old assign-owner BFF needed a session cookie that dev lacks, so it 401'd.
  const assignOwner = (id: string, ownerId: string | null) => patchAccount(id, { ownerId });

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
          <a href="/api/crm/accounts/export/xlsx" style={st.exportBtn} target="_blank" rel="noopener noreferrer">⤓ Excel</a>
          <a href="/crm/accounts/print" style={st.exportBtn} target="_blank" rel="noopener noreferrer">🖨 PDF</a>
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
          { label: 'Outstanding AR', value: `AED ${money(kpis.outstanding)}`, color: kpis.outstanding > 0 ? 'var(--warn, var(--warn))' : undefined },
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
            const count = viewCount(v.key);
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
        {err && <span style={st.err} role="alert">{err}</span>}
      </div>

      <section style={st.panel}>
        {page === null ? (
          <p style={st.muted}>API offline.</p>
        ) : visible.length === 0 ? (
          <p style={st.muted}>{all.length === 0 ? 'No accounts yet — add one above.' : 'No accounts match this view.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={st.table} data-testid="accounts-portfolio">
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
                      <span style={{ ...st.stageTag, color: STAGE_COLOR[r.stage] ?? 'var(--text)', borderColor: 'var(--border)' }}>
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {r.ownerId ? (
                          <span style={{ fontSize: 12.5 }}>{ownerLabel(r.ownerId)}</span>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>Unassigned</span>
                        )}
                        {myId && r.ownerId !== myId ? (
                          <button disabled={busy === r.id} onClick={() => void assignOwner(r.id, myId)} style={st.assignBtn}>
                            Assign to me
                          </button>
                        ) : null}
                        {canManage ? (
                          <select
                            value={r.ownerId ?? ''}
                            disabled={busy === r.id}
                            onChange={(e) => void assignOwner(r.id, e.target.value || null)}
                            style={st.ownerSelect}
                            title="Assign owner — admin / manager"
                          >
                            <option value="">Unassigned</option>
                            {team.map((u) => (
                              <option key={u.username} value={u.username}>
                                {u.roleLabel ? `${u.username} · ${u.roleLabel}` : u.username}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </span>
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
      {page && page.total > page.limit ? (
        <div style={st.pagination} aria-label="Account pagination">
          <span style={st.muted}>{page.offset + 1}–{Math.min(page.offset + page.items.length, page.total)} of {page.total} accounts</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={loading || page.offset === 0} onClick={() => goToPage(Math.max(0, page.offset - page.limit))} style={st.pageBtn}>Previous</button>
            <button type="button" disabled={loading || !page.hasMore} onClick={() => goToPage(page.offset + page.limit)} style={st.pageBtn}>Next</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const st = {
  page: { width: '100%', maxWidth: 1680, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 18px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  exportBtn: { border: '1px solid var(--border)', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', background: 'var(--panel)', whiteSpace: 'nowrap' } as CSSProperties,
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 10, margin: '4px 0 18px' } as CSSProperties,
  kpi: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' } as CSSProperties,
  kpiLabel: { color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, whiteSpace: 'nowrap' } as CSSProperties,
  kpiValue: { fontSize: 19, fontWeight: 700, letterSpacing: -0.3, whiteSpace: 'nowrap' } as CSSProperties,
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '14px 0 12px' } as CSSProperties,
  viewsRow: { display: 'flex', gap: 6, flexWrap: 'wrap' } as CSSProperties,
  viewBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  viewBtnActive: { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 } as CSSProperties,
  viewCount: { fontSize: 11, background: 'var(--panel-2)', borderRadius: 999, padding: '1px 7px', color: 'var(--muted)' } as CSSProperties,
  search: { border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 9, padding: '8px 12px', fontSize: 13, minWidth: 260 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '4px 8px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, flexWrap: 'wrap' } as CSSProperties,
  pageBtn: { border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
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
  ownerSelect: { border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)', borderRadius: 6, padding: '2px 6px', fontSize: 11.5, cursor: 'pointer', maxWidth: 190 } as CSSProperties,
};
