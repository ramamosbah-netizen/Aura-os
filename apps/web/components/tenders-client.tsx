'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TenderCreate, { TenderEdit } from './tender-create';

// Tendering · Tenders — the bid register. Every tender shows its urgency
// (submission deadline), its provenance (source opportunity), its internal
// pricing progress, and its continuation (quotation → contract) — the deal
// chain reads left to right on every row.

interface Tender {
  id: string;
  title: string;
  reference: string | null;
  accountId: string | null;
  accountName: string | null;
  status: string;
  value: number;
  submissionDeadline: string | null;
  sourceOpportunityId: string | null;
  ownerId: string | null;
  createdAt: string;
}
interface AccountLite { id: string; name: string; }
interface SheetSummary { tenderId: string; pricedItems: number; boqItems: number; marginPercent: number; }
interface QuotationLite { id: string; sourceTenderId: string | null; quoteNumber: string; status: string; }
interface ContractLite { id: string; tenderId: string | null; status: string; }

const money = (n: number): string => (n ? 'AED ' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');
const fmt = (iso: string): string => new Date(iso).toLocaleDateString();

export default function TendersClient({ tenders, accounts, sheets, quotations, contracts }: {
  tenders: Tender[];
  accounts: AccountLite[];
  sheets: SheetSummary[];
  quotations: QuotationLite[];
  contracts: ContractLite[];
}) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const sheetByTender = useMemo(() => new Map(sheets.map((s) => [s.tenderId, s])), [sheets]);
  const quotesByTender = useMemo(() => {
    const m = new Map<string, QuotationLite[]>();
    for (const q of quotations) {
      if (!q.sourceTenderId) continue;
      m.set(q.sourceTenderId, [...(m.get(q.sourceTenderId) ?? []), q]);
    }
    return m;
  }, [quotations]);
  const contractByTender = useMemo(() => {
    const m = new Map<string, ContractLite>();
    for (const c of contracts) if (c.tenderId) m.set(c.tenderId, c);
    return m;
  }, [contracts]);

  const kpi = useMemo(() => {
    const sum = (list: Tender[]) => list.reduce((s, t) => s + t.value, 0);
    const draft = tenders.filter((t) => t.status === 'draft');
    const submitted = tenders.filter((t) => t.status === 'submitted');
    const won = tenders.filter((t) => t.status === 'won');
    const lost = tenders.filter((t) => t.status === 'lost');
    const dueSoon = tenders.filter((t) => t.status === 'draft' && t.submissionDeadline && t.submissionDeadline >= today && t.submissionDeadline <= soon);
    const decided = won.length + lost.length;
    const priced = tenders.filter((t) => (sheetByTender.get(t.id)?.pricedItems ?? 0) > 0);
    return {
      draftValue: sum(draft),
      submittedValue: sum(submitted),
      wonValue: sum(won),
      winRate: decided > 0 ? Math.round((won.length / decided) * 100) : null,
      dueSoon: dueSoon.length,
      priced: `${priced.length}/${tenders.length}`,
    };
  }, [tenders, sheetByTender, today, soon]);

  const filtered = useMemo(() => {
    let out = tenders;
    if (statusFilter) out = out.filter((t) => t.status === statusFilter);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((t) => [t.title, t.reference, t.accountName, t.ownerId].some((v) => v && v.toLowerCase().includes(q)));
    return out;
  }, [tenders, query, statusFilter]);

  const setStatus = async (t: Tender, status: string): Promise<void> => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/tendering/tenders/${t.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Failed'); return; }
      router.refresh();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  return (
    <>
      <div style={st.cards}>
        <Kpi label="Draft (preparing)" value={money(kpi.draftValue)} />
        <Kpi label="Submitted (awaiting)" value={money(kpi.submittedValue)} accent />
        <Kpi label="Won value" value={money(kpi.wonValue)} good />
        <Kpi label="Win rate" value={kpi.winRate === null ? '—' : `${kpi.winRate}%`} accent />
        <Kpi label="Due ≤ 7 days" value={String(kpi.dueSoon)} bad={kpi.dueSoon > 0} />
        <Kpi label="Priced (sheets)" value={kpi.priced} />
      </div>

      <div style={st.toolbar}>
        <TenderCreate accounts={accounts} />
        <input style={st.search} placeholder="Search title, ref, account…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select style={st.search} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {['draft', 'submitted', 'won', 'lost'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <a href="/tendering/pricing" style={st.linkBtn}>⊞ Pricing sheets</a>
        {err && <span style={st.err}>{err}</span>}
      </div>

      <section className="panel">
        {filtered.length === 0 ? (
          <p style={st.muted}>{tenders.length === 0 ? 'No tenders yet — register the first bid.' : 'Nothing matches the filter.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 1100 }}>
              <thead><tr>
                <th>Tender</th><th>Account</th><th>Source</th><th>Value</th><th>Deadline</th>
                <th>Status</th><th>Chain</th><th>Owner</th><th>Created</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map((t) => {
                  const sheet = sheetByTender.get(t.id);
                  const quotes = quotesByTender.get(t.id) ?? [];
                  const contract = contractByTender.get(t.id);
                  const overdue = t.status === 'draft' && t.submissionDeadline && t.submissionDeadline < today;
                  const dueSoon = t.status === 'draft' && t.submissionDeadline && t.submissionDeadline >= today && t.submissionDeadline <= soon;
                  return (
                    <tr key={t.id} style={t.status === 'lost' ? { opacity: 0.6 } : undefined}>
                      <td>
                        <a href={`/tendering/tenders/${t.id}`} style={st.link}>{t.title}</a>
                        {t.reference && <div style={st.ref}>{t.reference}</div>}
                      </td>
                      <td>
                        {t.accountId
                          ? <a href={`/crm/accounts/${t.accountId}`} style={st.link}>{t.accountName ?? 'Account'}</a>
                          : <span style={{ color: 'var(--muted)' }}>{t.accountName ?? '—'}</span>}
                      </td>
                      <td>
                        {t.sourceOpportunityId
                          ? <a href="/crm/leads" style={st.chip} title="Auto-created from a won opportunity">◎ Opportunity</a>
                          : <span style={{ color: 'var(--muted)' }}>direct</span>}
                      </td>
                      <td style={{ fontWeight: 600 }}>{money(t.value)}</td>
                      <td style={{ whiteSpace: 'nowrap', color: overdue ? 'var(--bad)' : dueSoon ? 'var(--warn, #d97706)' : 'var(--muted)', fontWeight: overdue || dueSoon ? 700 : 400 }}>
                        {t.submissionDeadline ?? '—'}{dueSoon ? ' ⚠' : ''}{overdue ? ' ✗' : ''}
                      </td>
                      <td>
                        <span className={t.status === 'won' ? 'badge badge-good' : t.status === 'lost' ? 'badge badge-bad' : t.status === 'submitted' ? 'badge badge-accent' : 'badge'}>{t.status}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <a href={`/tendering/tenders/${t.id}/pricing`} style={{ ...st.chip, ...(sheet ? { color: 'var(--accent)' } : {}) }}
                          title={sheet ? `${sheet.pricedItems}/${sheet.boqItems} lines priced · margin ${sheet.marginPercent}%` : 'Open the internal pricing sheet'}>
                          ⊞ {sheet ? `${sheet.pricedItems}/${sheet.boqItems}` : 'Price'}
                        </a>
                        {quotes.length > 0 && (
                          <a href="/crm/quotations" style={{ ...st.chip, marginLeft: 6 }} title={quotes.map((q) => `${q.quoteNumber} (${q.status})`).join(', ')}>
                            ✎ {quotes.length > 1 ? `${quotes.length} quotes` : quotes[0].quoteNumber}
                          </a>
                        )}
                        {contract && (
                          <a href={`/contracts/contracts/${contract.id}`} style={{ ...st.chip, marginLeft: 6, color: 'var(--good)' }} title="Contract created from this tender">
                            ▤ Contract
                          </a>
                        )}
                      </td>
                      <td style={{ color: 'var(--muted)' }}>{t.ownerId ?? '—'}</td>
                      <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmt(t.createdAt)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          {t.status === 'draft' && <button className="btn btn-primary" style={st.smBtn} disabled={busy} onClick={() => void setStatus(t, 'submitted')}>Submit →</button>}
                          {t.status === 'submitted' && (
                            <>
                              <button className="btn" style={{ ...st.smBtn, color: 'var(--good)' }} disabled={busy} onClick={() => void setStatus(t, 'won')}>Won ✓</button>
                              <button className="btn" style={{ ...st.smBtn, color: 'var(--bad)' }} disabled={busy} onClick={() => void setStatus(t, 'lost')}>Lost ✗</button>
                            </>
                          )}
                          <TenderEdit tender={t} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Kpi({ label, value, accent, good, bad }: { label: string; value: string; accent?: boolean; good?: boolean; bad?: boolean }) {
  return (
    <div style={st.card}>
      <div style={st.cardLabel}>{label}</div>
      <div style={{ ...st.cardVal, ...(accent ? { color: 'var(--accent)' } : {}), ...(good ? { color: 'var(--good)' } : {}), ...(bad ? { color: 'var(--bad)' } : {}) }}>{value}</div>
    </div>
  );
}

const st = {
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 } as CSSProperties,
  card: { padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' } as CSSProperties,
  cardLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 18, fontWeight: 700, marginTop: 4 } as CSSProperties,
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' } as CSSProperties,
  search: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none', minWidth: 170 } as CSSProperties,
  linkBtn: { border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none' } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  ref: { fontSize: 11, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace', marginTop: 2 } as CSSProperties,
  chip: { display: 'inline-block', fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 9px', color: 'var(--muted)', textDecoration: 'none', whiteSpace: 'nowrap' } as CSSProperties,
  smBtn: { padding: '4px 10px', fontSize: 12 } as CSSProperties,
};
