'use client';

import { useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import LeadCapture from './lead-capture';

// Leads — the Lead OS. A lead is captured interest, NOT yet a deal: it moves through a qualification
// lifecycle (New → Contacted → Qualifying → Qualified → Disqualified), and only a Qualified lead may
// Convert to an Opportunity. This workspace works that lifecycle; the deal board lives in Pipeline.
// Drag advances a lead's status (PATCH); Convert is a backend-owned operation (guarded server-side).

export interface LeadRow {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  assignedTo: string | null;
  nextActivityDue: string | null;
  convertedOpportunityId: string | null;
  createdAt: string;
}

// Board columns map the human funnel; each groups the domain LeadStatus values it represents. The
// `set` status is what a drag into that column writes.
const COLUMNS: Array<{ key: string; label: string; set: string; statuses: string[] }> = [
  { key: 'new', label: 'New', set: 'new', statuses: ['new', 'verified', 'assigned'] },
  { key: 'contacted', label: 'Contacted', set: 'contacted', statuses: ['contacted'] },
  { key: 'qualifying', label: 'Qualifying', set: 'qualifying', statuses: ['qualifying', 'nurturing'] },
  { key: 'qualified', label: 'Qualified', set: 'qualified', statuses: ['qualified'] },
  { key: 'disqualified', label: 'Disqualified', set: 'disqualified', statuses: ['disqualified'] },
];
const bucketOf = (status: string): string => COLUMNS.find((c) => c.statuses.includes(status))?.key ?? 'new';

function isoDaysAhead(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + days * 86_400_000));
}

export default function LeadsWorkspace({ leads: initial }: { leads: LeadRow[] }) {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadRow[]>(initial);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [source, setSource] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const todayIso = isoDaysAhead(0);
  const active = useMemo(() => leads.filter((l) => l.status !== 'converted'), [leads]);
  const owners = useMemo(() => [...new Set(active.map((l) => l.assignedTo).filter((x): x is string => !!x))].sort(), [active]);
  const sources = useMemo(() => [...new Set(active.map((l) => l.source).filter((x): x is string => !!x))].sort(), [active]);
  const overdue = (l: LeadRow): boolean => !!l.nextActivityDue && l.nextActivityDue < todayIso;

  const matches = (l: LeadRow): boolean => {
    if (q && !`${l.companyName ?? ''} ${l.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (owner && l.assignedTo !== owner) return false;
    if (source && l.source !== source) return false;
    return true;
  };
  const filtered = active.filter(matches);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of filtered) m[bucketOf(l.status)] = (m[bucketOf(l.status)] ?? 0) + 1;
    return m;
  }, [filtered]);
  const kpis = [
    { label: 'Active leads', value: String(active.length) },
    { label: 'Overdue follow-up', value: String(active.filter(overdue).length), tone: 'bad' as const },
    { label: 'Qualifying', value: String(counts['qualifying'] ?? 0) },
    { label: 'Qualified — ready', value: String(counts['qualified'] ?? 0), tone: 'good' as const },
  ];

  async function setStatus(id: string, status: string): Promise<void> {
    const current = leads.find((l) => l.id === id);
    if (!current || current.status === status) return;
    setBusy(true); setErr(null);
    const prev = leads;
    setLeads(leads.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      const res = await fetch(`/api/crm/leads/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!res.ok) { setLeads(prev); setErr('Could not update the lead status.'); }
      else router.refresh();
    } catch { setLeads(prev); setErr('Could not reach the server.'); } finally { setBusy(false); }
  }

  const onDrop = (e: DragEvent, col: { set: string }): void => {
    e.preventDefault(); setDropKey(null);
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (id) void setStatus(id, col.set);
    setDragId(null);
  };

  return (
    <div style={st.page}>
      <div style={st.head}>
        <div>
          <h1 style={st.h1}>Leads</h1>
          <p style={st.sub}>Captured interest, qualified by hand. Drag a lead along the funnel; open a lead to qualify and convert it.</p>
        </div>
        <div style={st.headActions}>
          <LeadCapture onSaved={() => router.refresh()} />
          <div style={st.viewSwitch}>
            <button type="button" onClick={() => setView('board')} style={view === 'board' ? st.viewOn : st.viewOff}>Board</button>
            <button type="button" onClick={() => setView('list')} style={view === 'list' ? st.viewOn : st.viewOff}>List</button>
          </div>
        </div>
      </div>

      {err && <div style={st.errBar}>{err}</div>}

      <div style={st.filters}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads or companies…" style={{ ...st.input, flex: 2, minWidth: 180 }} />
        <select value={owner} onChange={(e) => setOwner(e.target.value)} style={st.input} aria-label="Owner">
          <option value="">All owners</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} style={st.input} aria-label="Source">
          <option value="">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      <div style={st.kpiRow}>
        {kpis.map((k) => (
          <div key={k.label} style={st.kpi}>
            <span style={st.kpiLabel}>{k.label}</span>
            <span style={{ ...st.kpiVal, ...(k.tone === 'bad' ? { color: 'var(--bad)' } : k.tone === 'good' ? { color: 'var(--good)' } : {}) }}>{k.value}</span>
          </div>
        ))}
      </div>

      {view === 'board' ? (
        <div style={st.board}>
          {COLUMNS.map((col) => {
            const cards = filtered.filter((l) => bucketOf(l.status) === col.key);
            return (
              <div
                key={col.key}
                style={{ ...st.col, ...(dropKey === col.key ? st.colDrop : {}) }}
                onDragOver={(e) => { e.preventDefault(); setDropKey(col.key); }}
                onDragLeave={() => setDropKey((k) => (k === col.key ? null : k))}
                onDrop={(e) => onDrop(e, col)}
              >
                <div style={st.colHead}><span>{col.label}</span><span style={st.colCount}>{cards.length}</span></div>
                <div style={st.colBody}>
                  {cards.length === 0 ? <p style={st.colEmpty}>—</p> : cards.map((l) => {
                    const od = overdue(l);
                    return (
                      <div key={l.id} style={{ ...st.card, ...(dragId === l.id ? st.cardDragging : {}), ...(od ? st.cardWarn : {}) }}
                        draggable={!busy}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.effectAllowed = 'move'; setDragId(l.id); }}
                        onDragEnd={() => { setDragId(null); setDropKey(null); }}
                      >
                        <a href={`/crm/leads/${l.id}`} style={st.cardMain}>
                          <strong style={st.cardCustomer}>{l.companyName ?? l.name}</strong>
                          <span style={st.cardMeta}>{l.companyName ? l.name : 'Lead'}{l.source ? ` · ${l.source.replace('_', ' ')}` : ''}</span>
                          <span style={st.cardMeta}>{l.nextActivityDue ? `follow-up ${l.nextActivityDue}` : 'no follow-up set'}{l.assignedTo ? ` · ${l.assignedTo}` : ''}</span>
                          {od && <span style={st.warnBadge}>⚠ Follow-up overdue</span>}
                        </a>
                        {/* Convert lives in Lead 360 (open the lead) — not a board shortcut, so the
                            qualification → readiness → convert context is never skipped. */}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={st.listWrap}>
          <table style={st.table}>
            <thead><tr>{['Company', 'Contact', 'Status', 'Source', 'Owner', 'Follow-up'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td style={st.td} colSpan={6}>No leads match the current filters.</td></tr>
              ) : filtered.map((l) => (
                <tr key={l.id}>
                  <td style={st.td}><a href={`/crm/leads/${l.id}`} style={st.link}>{l.companyName ?? l.name}</a></td>
                  <td style={st.tdMuted}>{l.companyName ? l.name : '—'}</td>
                  <td style={st.tdMuted}><span className="badge">{l.status}</span></td>
                  <td style={st.tdMuted}>{l.source?.replace('_', ' ') ?? '—'}</td>
                  <td style={st.tdMuted}>{l.assignedTo ?? '—'}</td>
                  <td style={{ ...st.tdMuted, ...(overdue(l) ? { color: 'var(--bad)' } : {}) }}>{l.nextActivityDue ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1400, margin: '0 auto', padding: '24px 24px 64px' },
  head: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 12 },
  h1: { fontSize: 26, margin: '0 0 4px', letterSpacing: -0.4 },
  sub: { color: 'var(--muted)', margin: 0, fontSize: 13, maxWidth: 680 },
  headActions: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  errBar: { border: '1px solid var(--bad)', color: 'var(--bad)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 },
  viewSwitch: { display: 'inline-flex', gap: 3, border: '1px solid var(--border)', borderRadius: 9, padding: 3, background: 'var(--panel)' },
  viewOn: { border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: 'var(--accent-grad, var(--accent))', color: 'var(--accent-ink, #fff)' },
  viewOff: { border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: 'var(--muted)' },
  filters: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 },
  input: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 12.5 },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: 16 },
  kpi: { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 4 },
  kpiLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' },
  kpiVal: { fontSize: 21, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  board: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(200px, 1fr))', gap: 10, overflowX: 'auto' },
  col: { minWidth: 0, background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border)', borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 },
  colDrop: { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 6%, var(--panel))' },
  colHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', fontSize: 12.5, fontWeight: 800 },
  colCount: { color: 'var(--muted)', fontSize: 11, fontWeight: 700 },
  colBody: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 },
  colEmpty: { color: 'var(--muted)', textAlign: 'center', margin: '10px 0', fontSize: 13 },
  card: { display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', cursor: 'grab' },
  cardMain: { display: 'flex', flexDirection: 'column', gap: 3, textDecoration: 'none', color: 'var(--text)' },
  cardDragging: { opacity: 0.5 },
  cardWarn: { borderLeft: '3px solid var(--bad)' },
  cardCustomer: { fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardMeta: { fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  warnBadge: { marginTop: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--bad)' },
  listWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '10px', borderBottom: '1px solid var(--border)', color: 'var(--text)' },
  tdMuted: { padding: '10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', whiteSpace: 'nowrap' },
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 },
};
