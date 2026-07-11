'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ContractCreate from './contract-create';

// Contracts register — every awarded contract with its lifecycle, its chain
// (tender ← contract → project) and the commercial watchpoints (bonds expiring,
// certification progress).

interface Contract {
  id: string;
  title: string;
  reference: string | null;
  tenderId: string | null;
  accountId: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}
interface Bond { id: string; contractId: string; kind: string; expiryDate: string | null; status: string; }
interface ProjectLite { id: string; contractId: string | null; title: string; status: string; }
interface TenderLite { id: string; title: string; accountId: string | null; accountName: string | null; value: number; }

const money = (n: number): string => (n ? 'AED ' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');
const fmt = (iso: string): string => new Date(iso).toLocaleDateString();

export default function ContractsRegisterClient({ contracts, bonds, projects, wonTenders }: {
  contracts: Contract[];
  bonds: Bond[];
  projects: ProjectLite[];
  wonTenders: TenderLite[];
}) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const projectByContract = useMemo(() => {
    const m = new Map<string, ProjectLite>();
    for (const p of projects) if (p.contractId) m.set(p.contractId, p);
    return m;
  }, [projects]);

  const bondWatch = useMemo(() => {
    const m = new Map<string, { active: number; expiring: number }>();
    for (const b of bonds) {
      if (b.status !== 'active') continue;
      const row = m.get(b.contractId) ?? { active: 0, expiring: 0 };
      row.active += 1;
      if (b.expiryDate && b.expiryDate <= soon) row.expiring += 1;
      m.set(b.contractId, row);
    }
    return m;
  }, [bonds, soon]);

  const kpi = useMemo(() => {
    const sum = (list: Contract[]) => list.reduce((s, c) => s + c.value, 0);
    const active = contracts.filter((c) => c.status === 'active');
    const draft = contracts.filter((c) => c.status === 'draft');
    const completed = contracts.filter((c) => c.status === 'completed');
    const expiring = bonds.filter((b) => b.status === 'active' && b.expiryDate && b.expiryDate <= soon).length;
    return { activeValue: sum(active), activeCount: active.length, draftValue: sum(draft), completedValue: sum(completed), expiring };
  }, [contracts, bonds, soon]);

  const filtered = useMemo(() => {
    let out = contracts;
    if (statusFilter) out = out.filter((c) => c.status === statusFilter);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((c) => [c.title, c.reference, c.accountName].some((v) => v && v.toLowerCase().includes(q)));
    return out;
  }, [contracts, query, statusFilter]);

  const setStatus = async (c: Contract, status: string): Promise<void> => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/contracts/contracts/${c.id}/status`, {
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
        <Kpi label="Active contracts" value={`${kpi.activeCount} · ${money(kpi.activeValue)}`} good />
        <Kpi label="Draft (unsigned)" value={money(kpi.draftValue)} />
        <Kpi label="Completed value" value={money(kpi.completedValue)} accent />
        <Kpi label="Bonds expiring ≤30d" value={String(kpi.expiring)} bad={kpi.expiring > 0} />
      </div>

      <div style={st.toolbar}>
        <ContractCreate tenders={wonTenders} />
        <input style={st.search} placeholder="Search title, ref, client…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select style={st.search} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {['draft', 'active', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {err && <span style={st.errTxt}>{err}</span>}
      </div>

      <section className="panel">
        {filtered.length === 0 ? (
          <p style={st.muted}>{contracts.length === 0 ? 'No contracts yet — win a tender or convert an accepted quotation.' : 'Nothing matches the filter.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 1000 }}>
              <thead><tr>
                {['Contract', 'Client', 'Value', 'Status', 'Chain', 'Bonds', 'Awarded', 'Actions'].map((h) => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map((c) => {
                  const project = projectByContract.get(c.id);
                  const watch = bondWatch.get(c.id);
                  return (
                    <tr key={c.id} style={c.status === 'cancelled' ? { opacity: 0.55 } : undefined}>
                      <td>
                        <a href={`/contracts/contracts/${c.id}`} style={st.link}>{c.title}</a>
                        {c.reference && <div style={st.ref}>{c.reference}</div>}
                      </td>
                      <td>
                        {c.accountId
                          ? <a href={`/crm/accounts/${c.accountId}`} style={st.link}>{c.accountName ?? 'Account'}</a>
                          : <span style={{ color: 'var(--muted)' }}>{c.accountName ?? '—'}</span>}
                      </td>
                      <td style={{ fontWeight: 600 }}>{money(c.value)}</td>
                      <td>
                        <span className={c.status === 'active' ? 'badge badge-good' : c.status === 'completed' ? 'badge badge-accent' : c.status === 'cancelled' ? 'badge badge-bad' : 'badge'}>{c.status}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {c.tenderId && <a href={`/tendering/tenders/${c.tenderId}`} style={st.chip} title="Source tender">◳ Tender</a>}
                        {project
                          ? <a href={`/projects/projects/${project.id}`} style={{ ...st.chip, marginLeft: c.tenderId ? 6 : 0, color: 'var(--good)' }} title={project.title}>▦ {project.status}</a>
                          : <span style={{ ...st.chip, marginLeft: c.tenderId ? 6 : 0, color: 'var(--muted)' }}>▦ on signing</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {watch
                          ? <span style={{ color: watch.expiring > 0 ? 'var(--bad)' : 'var(--muted)', fontWeight: watch.expiring > 0 ? 700 : 400 }}>
                              {watch.active} active{watch.expiring > 0 ? ` · ${watch.expiring} expiring ⚠` : ''}
                            </span>
                          : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmt(c.createdAt)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {c.status === 'draft' && <button className="btn btn-primary" style={st.smBtn} disabled={busy} onClick={() => void setStatus(c, 'active')}>Sign →</button>}
                        {c.status === 'active' && <button className="btn" style={{ ...st.smBtn, color: 'var(--accent)' }} disabled={busy} onClick={() => void setStatus(c, 'completed')}>Complete</button>}
                        <a href={`/contracts/contracts/${c.id}`} style={{ ...st.chip, marginLeft: 6 }}>Open →</a>
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
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 } as CSSProperties,
  card: { padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' } as CSSProperties,
  cardLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 18, fontWeight: 700, marginTop: 4 } as CSSProperties,
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' } as CSSProperties,
  search: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none', minWidth: 170 } as CSSProperties,
  errTxt: { color: 'var(--bad)', fontSize: 13 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  ref: { fontSize: 11, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace', marginTop: 2 } as CSSProperties,
  chip: { display: 'inline-block', fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 9px', color: 'var(--muted)', textDecoration: 'none', whiteSpace: 'nowrap' } as CSSProperties,
  smBtn: { padding: '4px 10px', fontSize: 12 } as CSSProperties,
};
