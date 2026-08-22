'use client';

import { useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import LeadCapture from './lead-capture';

// Sales Pipeline — one board. A LEADS column sits first (a separate entity, styled distinctly), then
// the real opportunity stages. Lead and Opportunity stay different records with different lifecycles —
// the board just shows the whole journey in one place. Converting a lead is NOT a board action: a
// lead card opens its 360, where conversion-readiness (identity match + duplicates) is shown before
// the convert. The board never tries to be the 360.

export interface PipelineOpp {
  id: string;
  title: string;
  value: number;
  stage: string;
  closeDate: string | null;
  ownerId: string | null;
  accountName: string | null;
  nextAction: string | null;
  nextActionDueDate: string | null;
}
export interface PipelineLead {
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
}
export interface PipelineAtRisk { id: string; reasons: string[] }

const OPP_COLUMNS: Array<{ stage: string; label: string }> = [
  { stage: 'qualification', label: 'Qualified' },
  { stage: 'proposal', label: 'Proposal' },
  { stage: 'negotiation', label: 'Negotiation' },
  { stage: 'won', label: 'Won' },
  { stage: 'lost', label: 'Lost' },
];
const OPEN_STAGES = ['qualification', 'proposal', 'negotiation'];
// Lead precedence so the convertible ones surface at the top of the Leads column.
const LEAD_ORDER = ['qualified', 'qualifying', 'nurturing', 'contacted', 'assigned', 'verified', 'new'];

const aed = (n: number): string => 'AED ' + Math.round(n).toLocaleString('en-AE');
function isoDaysAhead(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + days * 86_400_000));
}

export default function PipelineWorkspace({
  opportunities,
  leads,
  atRisk,
}: {
  opportunities: PipelineOpp[];
  leads: PipelineLead[];
  atRisk: PipelineAtRisk[];
}) {
  const router = useRouter();
  const [opps, setOpps] = useState<PipelineOpp[]>(opportunities);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [customer, setCustomer] = useState('');
  const [stageF, setStageF] = useState('');
  const [minValue, setMinValue] = useState('');
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [onlySoon, setOnlySoon] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const todayIso = isoDaysAhead(0);
  const soonIso = isoDaysAhead(30);
  const atRiskReason = useMemo(() => new Map(atRisk.map((a) => [a.id, a.reasons?.[0] ?? 'Needs attention'])), [atRisk]);

  const warnOf = (o: PipelineOpp): string | null => {
    if (o.stage === 'won' || o.stage === 'lost') return null;
    if (atRiskReason.has(o.id)) return atRiskReason.get(o.id)!;
    if (!o.nextAction) return 'No next action';
    if (o.nextActionDueDate && o.nextActionDueDate < todayIso) return 'Follow-up overdue';
    return null;
  };
  const isSoon = (o: PipelineOpp): boolean =>
    !!o.closeDate && o.closeDate >= todayIso && o.closeDate <= soonIso && o.stage !== 'won' && o.stage !== 'lost';

  const owners = useMemo(() => [...new Set(opps.map((o) => o.ownerId).filter((x): x is string => !!x))].sort(), [opps]);
  const customers = useMemo(() => [...new Set(opps.map((o) => o.accountName).filter((x): x is string => !!x))].sort(), [opps]);

  const matches = (o: PipelineOpp): boolean => {
    if (q && !`${o.title} ${o.accountName ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (owner && o.ownerId !== owner) return false;
    if (customer && o.accountName !== customer) return false;
    if (stageF && o.stage !== stageF) return false;
    if (minValue && (o.value || 0) < Number(minValue)) return false;
    if (onlyAttention && !warnOf(o)) return false;
    if (onlySoon && !isSoon(o)) return false;
    return true;
  };
  const filtered = opps.filter(matches);

  const openOpps = opps.filter((o) => OPEN_STAGES.includes(o.stage));
  const kpis = [
    { label: 'Open deals', value: String(openOpps.length) },
    { label: 'Pipeline value', value: aed(openOpps.reduce((s, o) => s + (o.value || 0), 0)) },
    { label: 'Needs attention', value: String(openOpps.filter((o) => warnOf(o)).length), tone: 'bad' as const },
    { label: 'Closing soon', value: String(openOpps.filter(isSoon).length), tone: 'warn' as const },
  ];

  // Leads column — separate entity; shown in the board but never mixed into an opportunity stage.
  const boardLeads = useMemo(() => leads
    .filter((l) => l.status !== 'converted' && l.status !== 'disqualified')
    .filter((l) => !q || `${l.companyName ?? ''} ${l.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => LEAD_ORDER.indexOf(a.status) - LEAD_ORDER.indexOf(b.status)), [leads, q]);
  const leadOverdue = (l: PipelineLead): boolean => !!l.nextActivityDue && l.nextActivityDue < todayIso;

  async function moveTo(id: string, stage: string): Promise<void> {
    const current = opps.find((o) => o.id === id);
    if (!current || current.stage === stage) return;
    setBusy(true);
    setErr(null);
    const prev = opps;
    setOpps(opps.map((o) => (o.id === id ? { ...o, stage } : o)));
    try {
      const res = await fetch(`/api/crm/opportunities/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage }),
      });
      if (!res.ok) { setOpps(prev); setErr('Could not move the deal — the stage change was refused.'); }
      else router.refresh();
    } catch {
      setOpps(prev);
      setErr('Could not reach the server — the deal was not moved.');
    } finally {
      setBusy(false);
    }
  }

  const onDrop = (e: DragEvent, stage: string): void => {
    e.preventDefault();
    setDropKey(null);
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (id) void moveTo(id, stage);
    setDragId(null);
  };

  return (
    <div style={st.page}>
      <div style={st.head}>
        <div>
          <h1 style={st.h1}>Pipeline</h1>
          <p style={st.sub}>Leads to qualify and the deals they become — where each stands and what’s next.</p>
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads, deals or customers…" style={{ ...st.input, flex: 2, minWidth: 180 }} />
        <select value={owner} onChange={(e) => setOwner(e.target.value)} style={st.input} aria-label="Owner">
          <option value="">All owners</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={stageF} onChange={(e) => setStageF(e.target.value)} style={st.input} aria-label="Stage">
          <option value="">All stages</option>
          {OPP_COLUMNS.map((c) => <option key={c.stage} value={c.stage}>{c.label}</option>)}
        </select>
        <select value={customer} onChange={(e) => setCustomer(e.target.value)} style={st.input} aria-label="Customer">
          <option value="">All customers</option>
          {customers.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={minValue} onChange={(e) => setMinValue(e.target.value)} placeholder="Min value" inputMode="numeric" style={{ ...st.input, width: 110 }} aria-label="Minimum value" />
        <label style={st.check}><input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} /> Needs attention</label>
        <label style={st.check}><input type="checkbox" checked={onlySoon} onChange={(e) => setOnlySoon(e.target.checked)} /> Closing soon</label>
      </div>

      <div style={st.kpiRow}>
        {kpis.map((k) => (
          <div key={k.label} style={st.kpi}>
            <span style={st.kpiLabel}>{k.label}</span>
            <span style={{ ...st.kpiVal, ...(k.tone === 'bad' ? { color: 'var(--bad)' } : k.tone === 'warn' ? { color: '#d99a42' } : {}) }}>{k.value}</span>
          </div>
        ))}
      </div>

      {view === 'board' ? (
        <div style={st.board}>
          {/* Leads column — distinct: separate entity, no drag into stages. A card opens the Lead 360. */}
          <div style={{ ...st.col, ...st.leadCol }}>
            <div style={st.colHead}><span>◇ Leads</span><span style={st.colCount}>{boardLeads.length}</span></div>
            <div style={st.colBody}>
              {boardLeads.length === 0 ? <p style={st.colEmpty}>—</p> : boardLeads.map((l) => {
                const overdue = leadOverdue(l);
                return (
                  <div key={l.id} style={{ ...st.leadCard, ...(overdue ? st.cardWarn : {}) }}>
                    <a href={`/crm/leads/${l.id}`} style={st.leadCardMain}>
                      <span style={st.leadTag}>LEAD · {l.status}</span>
                      <strong style={st.cardCustomer}>{l.companyName ?? l.name}</strong>
                      <span style={st.cardMeta}>{l.companyName ? l.name : 'Lead'}{l.source ? ` · ${l.source.replace('_', ' ')}` : ''}</span>
                      <span style={st.cardMeta}>{l.nextActivityDue ? `follow-up ${l.nextActivityDue}` : 'no follow-up set'}</span>
                      {overdue && <span style={st.warnBadge}>⚠ Follow-up overdue</span>}
                    </a>
                    {/* Conversion is NOT offered from the board — it lives in Lead 360 (open the lead),
                        which shows the conversion-readiness (identity match + duplicates) before acting. */}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Opportunity stage columns — draggable. */}
          {OPP_COLUMNS.map((col) => {
            const cards = filtered.filter((o) => o.stage === col.stage);
            const colValue = cards.reduce((s, o) => s + (o.value || 0), 0);
            return (
              <div
                key={col.stage}
                style={{ ...st.col, ...(dropKey === col.stage ? st.colDrop : {}) }}
                onDragOver={(e) => { e.preventDefault(); setDropKey(col.stage); }}
                onDragLeave={() => setDropKey((k) => (k === col.stage ? null : k))}
                onDrop={(e) => onDrop(e, col.stage)}
              >
                <div style={st.colHead}>
                  <span>{col.label}</span>
                  <span style={st.colCount}>{cards.length}{colValue > 0 ? ` · ${aed(colValue)}` : ''}</span>
                </div>
                <div style={st.colBody}>
                  {cards.length === 0 ? <p style={st.colEmpty}>—</p> : cards.map((o) => {
                    const warn = warnOf(o);
                    return (
                      <a
                        key={o.id}
                        href={`/crm/opportunities/${o.id}`}
                        draggable={!busy}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', o.id); e.dataTransfer.effectAllowed = 'move'; setDragId(o.id); }}
                        onDragEnd={() => { setDragId(null); setDropKey(null); }}
                        style={{ ...st.card, ...(dragId === o.id ? st.cardDragging : {}), ...(warn ? st.cardWarn : {}) }}
                      >
                        <strong style={st.cardCustomer}>{o.accountName ?? 'No customer'}</strong>
                        <span style={st.cardTitle}>{o.title}</span>
                        <span style={st.cardMeta}>{aed(o.value || 0)}{o.ownerId ? ` · ${o.ownerId}` : ''}</span>
                        <span style={st.cardMeta}>{o.closeDate ? `Close ${o.closeDate}` : 'No close date'}{o.nextAction ? ` · next: ${o.nextAction}` : ''}</span>
                        {warn && <span style={st.warnBadge}>⚠ {warn}</span>}
                      </a>
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
            <thead>
              <tr>{['Customer', 'Opportunity', 'Stage', 'Value', 'Owner', 'Expected close', 'Next action', ''].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td style={st.td} colSpan={8}>No deals match the current filters.</td></tr>
              ) : filtered.map((o) => {
                const warn = warnOf(o);
                return (
                  <tr key={o.id}>
                    <td style={st.td}>{o.accountName ?? '—'}</td>
                    <td style={st.td}><a href={`/crm/opportunities/${o.id}`} style={st.link}>{o.title}</a></td>
                    <td style={st.tdMuted}><span className="badge">{o.stage}</span></td>
                    <td style={st.tdNum}>{aed(o.value || 0)}</td>
                    <td style={st.tdMuted}>{o.ownerId ?? '—'}</td>
                    <td style={st.tdMuted}>{o.closeDate ?? '—'}</td>
                    <td style={st.tdMuted}>{o.nextAction ?? <span style={{ color: 'var(--bad)' }}>No next action</span>}</td>
                    <td style={st.tdMuted}>{warn ? <span style={{ color: 'var(--bad)', fontSize: 11.5 }}>⚠ {warn}</span> : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1440, margin: '0 auto', padding: '24px 24px 64px' },
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
  check: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: 16 },
  kpi: { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 4 },
  kpiLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' },
  kpiVal: { fontSize: 21, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  board: { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(190px, 1fr))', gap: 10, overflowX: 'auto' },
  col: { minWidth: 0, background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border)', borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 },
  leadCol: { background: 'color-mix(in srgb, var(--accent) 5%, var(--panel-2, var(--panel)))', borderStyle: 'dashed' },
  colDrop: { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 6%, var(--panel))' },
  colHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', fontSize: 12.5, fontWeight: 800 },
  colCount: { color: 'var(--muted)', fontSize: 11, fontWeight: 700 },
  colBody: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 },
  colEmpty: { color: 'var(--muted)', textAlign: 'center', margin: '10px 0', fontSize: 13 },
  card: { display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', textDecoration: 'none', color: 'var(--text)', cursor: 'grab' },
  cardDragging: { opacity: 0.5 },
  cardWarn: { borderLeft: '3px solid var(--bad)' },
  leadCard: { display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' },
  leadCardMain: { display: 'flex', flexDirection: 'column', gap: 3, textDecoration: 'none', color: 'var(--text)' },
  leadTag: { alignSelf: 'flex-start', fontSize: 9, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 999, padding: '1px 7px' },
  cardCustomer: { fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardTitle: { fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardMeta: { fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  warnBadge: { marginTop: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--bad)' },
  listWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '10px', borderBottom: '1px solid var(--border)', color: 'var(--text)' },
  tdMuted: { padding: '10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', whiteSpace: 'nowrap' },
  tdNum: { padding: '10px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 },
};
