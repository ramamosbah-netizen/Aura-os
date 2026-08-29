'use client';

import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';
import QuotationsClient from './quotations-client';
import QuotationCreate from './quotation-create';

// Quotations OS — Overview is the decision cockpit; the separate Register owns operational work.
// Register List/Board views are URL-backed and use tenant-scoped paged data. Overview analytics use
// a tenant-scoped summary contract so KPIs are not accidentally limited to the first page.

export interface Quotation {
  id: string;
  quoteNumber: string;
  customerName: string;
  accountId: string | null;
  sourceTenderId?: string | null;
  sourceOpportunityId?: string | null;
  convertedContractId?: string | null;
  ownerId?: string | null;
  revision?: number;
  issueDate: string;
  validUntil: string | null;
  subtotal: number;
  vatTotal: number;
  total: number;
  status: string;
}

export interface QuotationPage {
  items: Quotation[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface QuotationFilters {
  search: string;
  status: string;
  ownerId: string;
  from: string;
  to: string;
}

export interface QuotationSummary {
  total: number;
  totalValue: number;
  draftValue: number;
  openValue: number;
  acceptedValue: number;
  lostValue: number;
  acceptedCount: number;
  decidedCount: number;
  expiringSoon: number;
  pendingApproval: number;
  stage: Record<string, { count: number; value: number }>;
  sources: { opportunity: number; tender: number; direct: number };
}

const aed = (n: number): string => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

// Board columns map the user-facing stage to the REAL statuses behind it (no invented state).
const STAGES: Array<{ key: string; label: string; statuses: string[]; tone: string }> = [
  { key: 'draft', label: 'Draft', statuses: ['draft'], tone: 'var(--muted)' },
  { key: 'review', label: 'Review', statuses: ['internal_review'], tone: 'var(--warn, var(--warn))' },
  { key: 'approved', label: 'Approved', statuses: ['approved'], tone: 'var(--accent)' },
  { key: 'sent', label: 'Sent', statuses: ['sent'], tone: 'var(--accent)' },
  { key: 'negotiation', label: 'Negotiation', statuses: ['under_negotiation', 'negotiation'], tone: 'var(--warn, var(--warn))' },
  { key: 'accepted', label: 'Accepted', statuses: ['accepted'], tone: 'var(--good)' },
  { key: 'lost', label: 'Lost', statuses: ['rejected', 'expired', 'cancelled'], tone: 'var(--bad)' },
];

export default function QuotationsWorkspace({ initialPage, initialSummary, initialFilters, surface = 'overview', registerView = 'list' }: { initialPage: QuotationPage; initialSummary?: QuotationSummary; initialFilters?: Partial<QuotationFilters>; surface?: 'overview' | 'register'; registerView?: 'list' | 'board' }) {
  const [registerTab, setRegisterTab] = useState<'list' | 'board'>(registerView);
  const [page, setPage] = useState<QuotationPage>(initialPage);
  const [summary, setSummary] = useState<QuotationSummary | undefined>(initialSummary);
  const [filters, setFilters] = useState<QuotationFilters>({ search: '', status: '', ownerId: '', from: '', to: '', ...initialFilters });
  const [draftFilters, setDraftFilters] = useState<QuotationFilters>({ search: '', status: '', ownerId: '', from: '', to: '', ...initialFilters });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const quotes = page.items;
  const hasActiveFilters = Object.values(filters).some((value) => value.trim().length > 0);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ limit: String(page.limit || 50), offset: String(page.offset) });
    if (filters.search.trim()) query.set('search', filters.search.trim());
    if (filters.status) query.set('status', filters.status);
    if (filters.ownerId.trim()) query.set('ownerId', filters.ownerId.trim());
    if (filters.from) query.set('issueDateFrom', filters.from);
    if (filters.to) query.set('issueDateTo', filters.to);
    if (surface === 'register') query.set('view', registerTab);
    const nextUrl = `${surface === 'register' ? '/crm/quotations/register' : '/crm/quotations'}?${query.toString()}`;
    window.history.replaceState(null, '', nextUrl);
    setLoading(true);
    setLoadError(null);
    fetch(`/api/crm/quotations/paged?${query.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => null) as QuotationPage | { message?: string; error?: string } | null;
        if (!res.ok || !data || !('items' in data)) {
          const failure = data && !('items' in data) ? (data.message ?? data.error) : null;
          throw new Error(failure || 'Unable to load quotations');
        }
        setPage(data);
        if (surface === 'overview') {
          fetch(`/api/crm/quotations/summary?${query.toString()}`, { cache: 'no-store', signal: controller.signal })
            .then(async (summaryRes) => { if (!summaryRes.ok) return; const next = await summaryRes.json() as QuotationSummary; if (next && typeof next.total === 'number') setSummary(next); })
            .catch(() => undefined);
        }
      })
      .catch((err: unknown) => { if (!(err instanceof DOMException && err.name === 'AbortError')) setLoadError(err instanceof Error ? err.message : 'Unable to load quotations'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, page.offset, page.limit, surface, registerTab]);

  const applyFilters = (): void => {
    setPage((current) => ({ ...current, offset: 0 }));
    setFilters({ ...draftFilters });
  };

  const clearFilters = (): void => {
    const empty = { search: '', status: '', ownerId: '', from: '', to: '' };
    setDraftFilters(empty);
    setFilters(empty);
    setPage((current) => ({ ...current, offset: 0 }));
  };

  const movePage = (nextOffset: number): void => setPage((current) => ({ ...current, offset: Math.max(0, nextOffset) }));

  const m = useMemo(() => {
    const sum = (l: Quotation[]) => l.reduce((s, q) => s + q.total, 0);
    const by = (ss: string[]) => quotes.filter((q) => ss.includes(q.status));
    const draft = by(['draft', 'internal_review', 'approved']);
    const open = by(['sent', 'under_negotiation', 'negotiation']);
    const accepted = by(['accepted']);
    const lost = by(['rejected', 'expired', 'cancelled']);
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const expiring = quotes.filter((q) => ['sent', 'under_negotiation', 'negotiation', 'approved'].includes(q.status) && q.validUntil && q.validUntil >= today && q.validUntil <= soon);
    const decided = accepted.length + lost.length;
    const pendingApproval = by(['internal_review']);
    const recent = [...quotes].sort((a, b) => b.issueDate.localeCompare(a.issueDate)).slice(0, 6);
    return {
      draftValue: sum(draft), openValue: sum(open), acceptedValue: sum(accepted), lostValue: sum(lost),
      totalValue: sum(quotes), avgDeal: quotes.length ? sum(quotes) / quotes.length : 0,
      acceptanceRate: decided > 0 ? Math.round((accepted.length / decided) * 100) : null,
      expiring, pendingApproval, recent, count: quotes.length, quotes,
      summary: summary ?? null,
    };
  }, [quotes, summary]);

  return (
    <>
      {surface === 'register' && <section className="panel" style={st.filters} aria-label="Quotation search and filters">
        <div style={st.filterRow}>
          <label style={st.filterField}>
            <span style={st.filterLabel}>Search</span>
            <input value={draftFilters.search} onChange={(e) => setDraftFilters((f) => ({ ...f, search: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }} placeholder="Quote number, customer, subject or contact" style={st.filterInput} />
          </label>
          <label style={st.filterField}>
            <span style={st.filterLabel}>Status</span>
            <select value={draftFilters.status} onChange={(e) => setDraftFilters((f) => ({ ...f, status: e.target.value }))} style={st.filterInput}>
              <option value="">All statuses</option>
              {['draft', 'internal_review', 'approved', 'sent', 'under_negotiation', 'accepted', 'rejected', 'expired', 'cancelled', 'revised'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label style={st.filterField}>
            <span style={st.filterLabel}>Owner ID</span>
            <input value={draftFilters.ownerId} onChange={(e) => setDraftFilters((f) => ({ ...f, ownerId: e.target.value }))} placeholder="Filter by owner" style={st.filterInput} />
          </label>
          <label style={st.filterField}>
            <span style={st.filterLabel}>Issued from</span>
            <input type="date" value={draftFilters.from} onChange={(e) => setDraftFilters((f) => ({ ...f, from: e.target.value }))} style={st.filterInput} />
          </label>
          <label style={st.filterField}>
            <span style={st.filterLabel}>Issued to</span>
            <input type="date" value={draftFilters.to} onChange={(e) => setDraftFilters((f) => ({ ...f, to: e.target.value }))} style={st.filterInput} />
          </label>
          <div style={st.filterActions}>
            <button type="button" className="btn btn-primary" onClick={applyFilters}>Apply</button>
            <button type="button" className="btn btn-ghost" onClick={clearFilters}>Clear</button>
          </div>
        </div>
        <div style={st.filterMeta}>
          <span>{loading ? 'Refreshing…' : page.total === 0 ? 'No quotations match these filters' : `Showing ${page.offset + 1}–${Math.min(page.offset + quotes.length, page.total)} of ${page.total}`}</span>
          {loadError && <span role="alert" style={st.err}>{loadError}</span>}
        </div>
      </section>}
      <div style={st.surfaceNav} aria-label="Quotation workspace navigation">
        <div style={st.surfaceLinks}>
          <a href="/crm/quotations" style={surface === 'overview' ? { ...st.surfaceLink, ...st.surfaceLinkActive } : st.surfaceLink}>◎ Overview</a>
          <a href="/crm/quotations/register" style={surface === 'register' ? { ...st.surfaceLink, ...st.surfaceLinkActive } : st.surfaceLink}>≣ Register</a>
        </div>
        {surface === 'overview' && <a className="btn btn-primary" href="/crm/quotations/register">Open quotation register →</a>}
        {surface === 'register' && <div style={st.registerToggle} role="tablist" aria-label="Register view">
          <button type="button" role="tab" aria-selected={registerTab === 'list'} className={registerTab === 'list' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => { setRegisterTab('list'); window.history.replaceState(null, '', '/crm/quotations/register?view=list'); }}>≣ List</button>
          <button type="button" role="tab" aria-selected={registerTab === 'board'} className={registerTab === 'board' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => { setRegisterTab('board'); window.history.replaceState(null, '', '/crm/quotations/register?view=board'); }}>⊞ Board</button>
          <QuotationCreate />
        </div>}
      </div>

      {surface === 'overview' && <Overview m={m} />}
      {surface === 'register' && registerTab === 'board' && <Board quotes={quotes} summary={summary} />}
      {surface === 'register' && registerTab === 'list' && <QuotationsClient initialQuotations={quotes as never} embedded exportCsvUrl={quotationExportUrl(filters)} emptyLabel={hasActiveFilters ? 'No quotations match the active filters.' : undefined} />}
      {surface === 'register' && <div style={st.pagination} aria-label="Quotation pagination">
        <button type="button" className="btn btn-ghost" disabled={loading || page.offset === 0} onClick={() => movePage(page.offset - page.limit)}>← Previous</button>
        <span style={st.pageLabel}>Page {page.total === 0 ? 0 : Math.floor(page.offset / page.limit) + 1} · {page.limit} per page</span>
        <button type="button" className="btn btn-ghost" disabled={loading || !page.hasMore} onClick={() => movePage(page.offset + page.limit)}>Next →</button>
      </div>}
    </>
  );
}

function Overview({ m }: { m: OverviewShape }) {
  const s = m.summary;
  const totalValue = s?.totalValue ?? m.totalValue;
  const openValue = s?.openValue ?? m.openValue;
  const acceptedValue = s?.acceptedValue ?? m.acceptedValue;
  const acceptanceRate = s && s.decidedCount > 0 ? Math.round((s.acceptedCount / s.decidedCount) * 100) : m.acceptanceRate;
  const avgDeal = s && s.total > 0 ? s.totalValue / s.total : m.avgDeal;
  const expiringCount = s?.expiringSoon ?? m.expiring.length;
  const approvalCount = s?.pendingApproval ?? m.pendingApproval.length;
  return (
    <>
      <div style={st.cards}>
        <Kpi label="Total quoted" value={`AED ${aed(totalValue)}`} />
        <Kpi label="Open / sent value" value={`AED ${aed(openValue)}`} accent />
        <Kpi label="Accepted value" value={`AED ${aed(acceptedValue)}`} good />
        <Kpi label="Acceptance rate" value={acceptanceRate === null ? '—' : `${acceptanceRate}%`} accent />
        <Kpi label="Avg deal size" value={`AED ${aed(avgDeal)}`} />
        <Kpi label="Expiring ≤ 7 days" value={String(expiringCount)} bad={expiringCount > 0} />
      </div>

      <div style={st.twoCol}>
        <section className="panel" style={st.panel}>
          <h3 style={st.h3}>Pending your approval <span style={st.count}>{approvalCount}</span></h3>
          {approvalCount === 0
            ? <p style={st.muted}>Nothing in internal review.</p>
            : <>{m.pendingApproval.map((q) => <QuoteRow key={q.id} q={q} right={`AED ${aed(q.total)}`} />)}{approvalCount > m.pendingApproval.length && <p style={st.muted}>Showing the first {m.pendingApproval.length}. <a href="/crm/quotations/register?status=internal_review" style={{ color: 'var(--accent)' }}>Open register to review all →</a></p>}</>}
        </section>
        <section className="panel" style={st.panel} data-testid="quotations-recent">
          <h3 style={st.h3}>Recent quotations</h3>
          {m.recent.length === 0
            ? <EmptyState compact title="No quotations yet" description="Quotations you create appear here across their full lifecycle." />
            : m.recent.map((q) => <QuoteRow key={q.id} q={q} right={<span className="badge">{q.status.replace(/_/g, ' ')}</span>} />)}
        </section>
      </div>

      {expiringCount > 0 && (
        <section className="panel" style={{ ...st.panel, borderColor: 'var(--bad)' }}>
          <h3 style={st.h3}>⚠ Expiring within 7 days <span style={st.count}>{expiringCount}</span></h3>
          {m.expiring.map((q) => <QuoteRow key={q.id} q={q} right={<span style={{ color: 'var(--bad)' }}>valid to {q.validUntil}</span>} />)}
          {expiringCount > m.expiring.length && <p style={st.muted}>Showing the first {m.expiring.length}. <a href="/crm/quotations/register" style={{ color: 'var(--accent)' }}>Open register to review all →</a></p>}
        </section>
      )}
      <section style={{ marginTop: 14 }}>
        <h3 style={{ ...st.h3, marginBottom: 10 }}>Performance analytics</h3>
        <Analytics quotes={m.quotes} m={m} />
      </section>
    </>
  );
}

function Board({ quotes, summary }: { quotes: Quotation[]; summary?: QuotationSummary }) {
  const known = new Set(STAGES.flatMap((s) => s.statuses));
  const superseded = quotes.filter((q) => !known.has(q.status)); // revised / any other → not lost, kept visible
  const isPartial = Boolean(summary && summary.total > quotes.length);
  return (
    <div style={st.boardScroll}>
      {isPartial && <p style={st.muted}>Showing the current page of {summary?.total} matching quotations. Stage totals include all filtered results.</p>}
      <div style={st.board}>
        {STAGES.map((stage) => {
          const list = quotes.filter((q) => stage.statuses.includes(q.status));
          const totals = summary?.stage[stage.key] ?? { count: list.length, value: list.reduce((s, q) => s + q.total, 0) };
          return (
            <div key={stage.key} style={st.col}>
              <div style={{ ...st.colHead, borderTopColor: stage.tone }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{stage.label}</span>
                <span style={st.colCount}>{totals.count}</span>
                <span style={st.colValue}>AED {aed(totals.value)}</span>
              </div>
              <div style={st.colBody}>
                {list.length === 0 ? <p style={st.colEmpty}>—</p> : list.map((q) => <Card key={q.id} q={q} />)}
              </div>
            </div>
          );
        })}
        {superseded.length > 0 && (
          <div key="superseded" style={st.col}>
            <div style={{ ...st.colHead, borderTopColor: 'var(--border)', opacity: 0.7 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Superseded</span>
              <span style={st.colCount}>{superseded.length}</span>
            </div>
            <div style={st.colBody}>{superseded.map((q) => <Card key={q.id} q={q} muted />)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Analytics({ quotes, m }: { quotes: Quotation[]; m: OverviewShape }) {
  const stageFor = (s: typeof STAGES[number]) => m.summary?.stage[s.key] ?? { count: quotes.filter((q) => s.statuses.includes(q.status)).length, value: quotes.filter((q) => s.statuses.includes(q.status)).reduce((t, q) => t + q.total, 0) };
  const maxVal = Math.max(1, ...STAGES.map((s) => stageFor(s).value));
  const src = m.summary?.sources ?? {
    opportunity: quotes.filter((q) => q.sourceOpportunityId).length,
    tender: quotes.filter((q) => q.sourceTenderId && !q.sourceOpportunityId).length,
    direct: quotes.filter((q) => !q.sourceOpportunityId && !q.sourceTenderId).length,
  };
  const totalCount = m.summary?.total ?? m.count;
  return (
    <div style={st.twoCol}>
      <section className="panel" style={st.panel}>
        <h3 style={st.h3}>Value by stage</h3>
        {STAGES.map((s) => {
          const values = stageFor(s);
          return (
            <div key={s.key} style={st.barRow}>
              <span style={st.barLabel}>{s.label}</span>
              <div style={st.barTrack}><div style={{ ...st.barFill, width: `${(values.value / maxVal) * 100}%`, background: s.tone }} /></div>
              <span style={st.barVal}>AED {aed(values.value)} · {values.count}</span>
            </div>
          );
        })}
      </section>
      <section className="panel" style={st.panel}>
        <h3 style={st.h3}>Outcomes & sources</h3>
        <div style={st.statGrid}>
          <Stat label="Acceptance rate" value={m.summary && m.summary.decidedCount > 0 ? `${Math.round((m.summary.acceptedCount / m.summary.decidedCount) * 100)}%` : m.acceptanceRate === null ? '—' : `${m.acceptanceRate}%`} tone="var(--good)" />
          <Stat label="Accepted value" value={`AED ${aed(m.summary?.acceptedValue ?? m.acceptedValue)}`} tone="var(--good)" />
          <Stat label="Lost value" value={`AED ${aed(m.summary?.lostValue ?? m.lostValue)}`} tone="var(--bad)" />
          <Stat label="Avg deal size" value={`AED ${aed(m.summary && m.summary.total > 0 ? m.summary.totalValue / m.summary.total : m.avgDeal)}`} />
        </div>
        <h4 style={{ ...st.h3, fontSize: 12.5, marginTop: 16 }}>Where quotes come from</h4>
        <div style={st.barRow}><span style={st.barLabel}>◎ Opportunity</span><div style={st.barTrack}><div style={{ ...st.barFill, width: `${pct(src.opportunity, totalCount)}%`, background: 'var(--accent)' }} /></div><span style={st.barVal}>{src.opportunity}</span></div>
        <div style={st.barRow}><span style={st.barLabel}>◳ Tender</span><div style={st.barTrack}><div style={{ ...st.barFill, width: `${pct(src.tender, totalCount)}%`, background: 'var(--accent)' }} /></div><span style={st.barVal}>{src.tender}</span></div>
        <div style={st.barRow}><span style={st.barLabel}>Direct</span><div style={st.barTrack}><div style={{ ...st.barFill, width: `${pct(src.direct, totalCount)}%`, background: 'var(--muted)' }} /></div><span style={st.barVal}>{src.direct}</span></div>
      </section>
    </div>
  );
}

// ── small pieces ──
type OverviewShape = {
  totalValue: number; openValue: number; acceptedValue: number; lostValue: number; avgDeal: number;
  acceptanceRate: number | null; expiring: Quotation[]; pendingApproval: Quotation[]; recent: Quotation[]; count: number; quotes: Quotation[]; summary: QuotationSummary | null;
};
const pct = (n: number, total: number): number => (total > 0 ? Math.round((n / total) * 100) : 0);

function quotationExportUrl(filters: QuotationFilters): string {
  const query = new URLSearchParams();
  if (filters.search.trim()) query.set('search', filters.search.trim());
  if (filters.status) query.set('status', filters.status);
  if (filters.ownerId.trim()) query.set('ownerId', filters.ownerId.trim());
  if (filters.from) query.set('issueDateFrom', filters.from);
  if (filters.to) query.set('issueDateTo', filters.to);
  const encoded = query.toString();
  return `/api/crm/quotations/export.csv${encoded ? `?${encoded}` : ''}`;
}

function Card({ q, muted }: { q: Quotation; muted?: boolean }) {
  return (
    <a href={`/crm/quotations/${q.id}`} style={{ ...st.card2, ...(muted ? { opacity: 0.6 } : {}) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{q.quoteNumber}{q.revision ? ` · R${q.revision}` : ''}</span>
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>AED {aed(q.total)}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customerName}</div>
      {q.validUntil && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>valid to {q.validUntil}</div>}
    </a>
  );
}
function QuoteRow({ q, right }: { q: Quotation; right: ReactNode }) {
  return (
    <a href={`/crm/quotations/${q.id}`} style={st.qrow}>
      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)' }}>{q.quoteNumber}</span>
      <span style={{ fontSize: 12.5, color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customerName}</span>
      <span style={{ fontSize: 12.5 }}>{right}</span>
    </a>
  );
}
function Kpi({ label, value, accent, good, bad }: { label: string; value: string; accent?: boolean; good?: boolean; bad?: boolean }) {
  return (
    <div style={st.card}>
      <div style={st.cardLabel}>{label}</div>
      <div style={{ ...st.cardVal, ...(accent ? { color: 'var(--accent)' } : good ? { color: 'var(--good)' } : bad ? { color: 'var(--bad)' } : {}) }}>{value}</div>
    </div>
  );
}
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel-2)' }}>
      <div style={st.cardLabel}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 3, color: tone ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}

const st = {
  filters: { padding: 14, marginBottom: 16 } as CSSProperties,
  filterRow: { display: 'flex', alignItems: 'end', gap: 10, flexWrap: 'wrap' } as CSSProperties,
  filterField: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140, flex: '1 1 150px' } as CSSProperties,
  filterLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.4 } as CSSProperties,
  filterInput: { width: '100%', minHeight: 34, padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border-strong, var(--border))', background: 'var(--panel-2, var(--panel))', color: 'var(--text)', fontFamily: 'inherit', fontSize: 12.5 } as CSSProperties,
  filterActions: { display: 'flex', gap: 7, alignItems: 'center', paddingBottom: 0 } as CSSProperties,
  filterMeta: { display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10, fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  err: { color: 'var(--bad)' } as CSSProperties,
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 18 } as CSSProperties,
  pageLabel: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  surfaceNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)', marginBottom: 18, paddingBottom: 8, flexWrap: 'wrap' } as CSSProperties,
  surfaceLinks: { display: 'flex', alignItems: 'center', gap: 4 } as CSSProperties,
  surfaceLink: { display: 'inline-flex', alignItems: 'center', padding: '8px 13px', borderRadius: 8, color: 'var(--muted)', textDecoration: 'none', fontSize: 13.5 } as CSSProperties,
  surfaceLinkActive: { color: 'var(--text)', background: 'var(--panel-2)', fontWeight: 700 } as CSSProperties,
  registerToggle: { display: 'flex', alignItems: 'center', gap: 6 } as CSSProperties,
  tabbar: { display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 18, paddingBottom: 2 } as CSSProperties,
  tab: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13.5, color: 'var(--muted)', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit' } as CSSProperties,
  tabActive: { color: 'var(--text)', fontWeight: 700, borderBottomColor: 'var(--accent)' } as CSSProperties,
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 } as CSSProperties,
  card: { padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' } as CSSProperties,
  cardLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 18, fontWeight: 700, marginTop: 4 } as CSSProperties,
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 } as CSSProperties,
  panel: { padding: 16 } as CSSProperties,
  h3: { fontSize: 14, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
  count: { fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft, rgba(247,178,59,.12))', borderRadius: 999, padding: '1px 8px' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13, padding: '6px 0' } as CSSProperties,
  qrow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' } as CSSProperties,
  boardScroll: { overflowX: 'auto', paddingBottom: 8 } as CSSProperties,
  board: { display: 'flex', gap: 12, minWidth: 'min-content' } as CSSProperties,
  col: { width: 220, flexShrink: 0, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column' } as CSSProperties,
  colHead: { padding: '10px 12px', borderTop: '3px solid var(--accent)', borderTopLeftRadius: 12, borderTopRightRadius: 12, display: 'grid', gridTemplateColumns: '1fr auto', gap: 2, alignItems: 'center' } as CSSProperties,
  colCount: { fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--panel-2)', borderRadius: 999, padding: '1px 8px' } as CSSProperties,
  colValue: { gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', marginTop: 2 } as CSSProperties,
  colBody: { padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60, maxHeight: '62vh', overflowY: 'auto' } as CSSProperties,
  colEmpty: { color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: '10px 0' } as CSSProperties,
  card2: { display: 'block', padding: 10, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--panel-2)', textDecoration: 'none', color: 'var(--text)' } as CSSProperties,
  barRow: { display: 'flex', alignItems: 'center', gap: 10, margin: '7px 0' } as CSSProperties,
  barLabel: { width: 96, fontSize: 12, color: 'var(--muted)', flexShrink: 0 } as CSSProperties,
  barTrack: { flex: 1, height: 8, background: 'var(--panel-2)', borderRadius: 999, overflow: 'hidden' } as CSSProperties,
  barFill: { height: '100%', borderRadius: 999 } as CSSProperties,
  barVal: { width: 130, textAlign: 'right', fontSize: 12, color: 'var(--muted)', flexShrink: 0 } as CSSProperties,
  statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } as CSSProperties,
};
