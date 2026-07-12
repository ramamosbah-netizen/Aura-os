'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreateDrawer from './ui/create-drawer';

// CRM · Sales Pipeline — the full sales cycle, with Lead and Opportunity kept
// as SEPARATE concepts that share one board:
//
//   Lead (new → qualified) → Opportunity (qualification → proposal → negotiation) → Won / Lost
//
// After Won the deal chain is OPTIONAL per deal: `requiresTender` decides whether
// a Tender/Estimation is auto-created; direct sales / AMC renewals / variations
// convert straight to a quotation instead.

interface Lead {
  id: string; name: string; companyName: string | null; email: string | null;
  phone: string | null; status: string; source: string | null; createdAt: string;
}
interface Opportunity {
  id: string; leadId: string | null; accountId: string | null; accountName: string | null;
  title: string; value: number; stage: string; winProbability: number; closeDate: string | null;
  requiresTender?: boolean; ownerId?: string | null; nextAction?: string | null; createdAt: string;
}
interface Account { id: string; name: string; }
interface Activity {
  id: string; type: string; subject: string; status: string;
  relatedType: string | null; dueDate: string | null; createdAt: string;
}

const OPP_STAGES = ['qualification', 'proposal', 'negotiation', 'won', 'lost'] as const;
const ACTIVE_STAGES = ['qualification', 'proposal', 'negotiation'];
const SOURCES = ['website', 'referral', 'campaign', 'cold_call', 'other'] as const;

const money = (n: number): string => (n ? 'AED ' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');
const fmt = (iso: string): string => new Date(iso).toLocaleDateString();

type View = 'board' | 'list' | 'forecast' | 'activities';

export default function CrmPipelineClient({ initialLeads, initialOpportunities, initialAccounts }: {
  initialLeads: Lead[]; initialOpportunities: Opportunity[]; initialAccounts: Account[];
}) {
  const router = useRouter();
  const [view, setView] = useState<View>('board');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forecast, setForecast] = useState<{ id: string; prob: number; reason: string } | null>(null);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  // Native HTML5 drag & drop across board columns (buttons stay as the
  // keyboard-accessible fallback for the same moves).
  const [drag, setDrag] = useState<{ kind: 'lead' | 'opp'; id: string; from: string } | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);

  useEffect(() => {
    if (view !== 'activities' || activities) return;
    void (async () => {
      const res = await fetch('/api/crm/activities', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setActivities(Array.isArray(d) ? d : (d.items ?? []));
      } else setActivities([]);
    })();
  }, [view, activities]);

  async function call(path: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(path, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Request failed');
        return false;
      }
      router.refresh();
      return true;
    } catch { setErr('API unreachable'); return false; } finally { setBusy(false); }
  }

  const changeStage = (o: Opportunity, stage: string): void => {
    setMsg(null);
    void call(`/api/crm/opportunities/${o.id}`, 'PATCH', { stage }).then((ok) => {
      if (ok && stage === 'won') {
        setMsg(o.requiresTender === false
          ? `"${o.title}" won — direct-sale path (no tender). Convert it to a quotation when ready.`
          : `"${o.title}" won — a draft tender is being created (tender path).`);
      }
    });
  };

  const toggleTenderPath = (o: Opportunity): void => {
    void call(`/api/crm/opportunities/${o.id}`, 'PATCH', { requiresTender: !(o.requiresTender ?? true) });
  };

  const qualifyLead = (l: Lead): void => { void call(`/api/crm/leads/${l.id}`, 'PATCH', { status: 'qualified' }); };

  const convertLead = (l: Lead): void => {
    setMsg(null);
    void (async () => {
      const ok = await call('/api/crm/opportunities', 'POST', {
        title: l.companyName ? `${l.companyName} — ${l.name}` : l.name,
        leadId: l.id,
        stage: 'qualification',
      });
      if (ok) {
        await call(`/api/crm/leads/${l.id}`, 'PATCH', { status: 'qualified' });
        setMsg(`Lead "${l.name}" converted to an opportunity — set its value, account and close date.`);
      }
    })();
  };

  const convertToQuotation = (o: Opportunity): void => {
    setMsg(null);
    void (async () => {
      const res = await fetch(`/api/crm/opportunities/${o.id}/convert-to-quotation`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.message ?? d.error ?? 'Convert failed');
      else setMsg(`Quotation ${d.quoteNumber} drafted from "${o.title}" — review it in CRM · Quotations.`);
    })();
  };

  async function runForecast(id: string): Promise<void> {
    setBusy(true); setErr(null); setForecast(null);
    try {
      const res = await fetch(`/api/crm/opportunities/${id}/forecast`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setForecast({ id, prob: data.winProbability, reason: data.reason });
      else setErr(data.error ?? 'Forecast failed');
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  }

  /** Which columns the current drag may drop on. */
  const canDrop = (colKey: string): boolean => {
    if (!drag) return false;
    if (drag.kind === 'opp') return OPP_STAGES.includes(colKey as (typeof OPP_STAGES)[number]) && colKey !== drag.from;
    // leads: new → Qualified Leads column; qualified → Discovery (converts to an opportunity)
    if (drag.from !== 'qualified') return colKey === 'lead-qualified';
    return colKey === 'qualification';
  };

  const onDropTo = (colKey: string): void => {
    if (!drag || !canDrop(colKey)) return;
    const d = drag;
    setDrag(null);
    setHoverCol(null);
    if (d.kind === 'opp') {
      const o = initialOpportunities.find((x) => x.id === d.id);
      if (o) changeStage(o, colKey);
      return;
    }
    const l = initialLeads.find((x) => x.id === d.id);
    if (!l) return;
    if (colKey === 'lead-qualified') qualifyLead(l);
    else convertLead(l);
  };

  const dragHandlers = (kind: 'lead' | 'opp', id: string, from: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id); // required by Firefox to start a drag
      setDrag({ kind, id, from });
    },
    onDragEnd: () => {
      setDrag(null);
      setHoverCol(null);
    },
  });

  const dropHandlers = (colKey: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!canDrop(colKey)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (hoverCol !== colKey) setHoverCol(colKey);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget === e.target && hoverCol === colKey) setHoverCol(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onDropTo(colKey);
    },
  });

  /* ── KPIs (leads and opportunities counted separately) ─────────────────── */
  const leads = initialLeads;
  const opps = initialOpportunities;
  const activeLeads = leads.filter((l) => l.status !== 'disqualified');
  const qualifiedLeads = leads.filter((l) => l.status === 'qualified');
  const activeOpps = opps.filter((o) => ACTIVE_STAGES.includes(o.stage));
  const wonOpps = opps.filter((o) => o.stage === 'won');
  const lostOpps = opps.filter((o) => o.stage === 'lost');
  const pipelineValue = activeOpps.reduce((s, o) => s + o.value, 0);
  const weighted = activeOpps.reduce((s, o) => s + o.value * (o.winProbability / 100), 0);
  const wonValue = wonOpps.reduce((s, o) => s + o.value, 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const wonThisMonth = wonOpps.filter((o) => (o.closeDate ?? o.createdAt).slice(0, 7) === thisMonth);
  const winRate = wonOpps.length + lostOpps.length > 0 ? Math.round((wonOpps.length / (wonOpps.length + lostOpps.length)) * 100) : null;

  /* ── board columns: leads first, then opportunity stages ───────────────── */
  const boardCols: Array<{ key: string; label: string; kind: 'lead' | 'opp'; leads?: Lead[]; opps?: Opportunity[] }> = [
    { key: 'lead-new', label: 'New Leads', kind: 'lead', leads: activeLeads.filter((l) => l.status !== 'qualified') },
    { key: 'lead-qualified', label: 'Qualified Leads', kind: 'lead', leads: qualifiedLeads },
    { key: 'qualification', label: 'Discovery', kind: 'opp', opps: opps.filter((o) => o.stage === 'qualification') },
    { key: 'proposal', label: 'Proposal', kind: 'opp', opps: opps.filter((o) => o.stage === 'proposal') },
    { key: 'negotiation', label: 'Negotiation', kind: 'opp', opps: opps.filter((o) => o.stage === 'negotiation') },
    { key: 'won', label: 'Won', kind: 'opp', opps: wonOpps },
    { key: 'lost', label: 'Lost', kind: 'opp', opps: lostOpps },
  ];

  /* ── forecast view: weighted pipeline by expected close month ───────────── */
  const byMonth = new Map<string, { deals: number; value: number; weighted: number }>();
  for (const o of activeOpps) {
    const key = o.closeDate ? o.closeDate.slice(0, 7) : 'unscheduled';
    const row = byMonth.get(key) ?? { deals: 0, value: 0, weighted: 0 };
    row.deals += 1; row.value += o.value; row.weighted += o.value * (o.winProbability / 100);
    byMonth.set(key, row);
  }
  const forecastRows = [...byMonth.entries()].sort(([a], [b]) => (a === 'unscheduled' ? 1 : b === 'unscheduled' ? -1 : a < b ? -1 : 1));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {err && <div style={s.errorBar}>{err}</div>}
      {msg && <div style={s.okBar}>{msg}</div>}

      {/* KPI strip — leads and opportunities are SEPARATE counts */}
      <div style={s.kpiStrip}>
        <Kpi label="Total Leads" value={String(activeLeads.length)} />
        <Kpi label="Qualified Leads" value={String(qualifiedLeads.length)} />
        <Kpi label="Active Opportunities" value={String(activeOpps.length)} />
        <Kpi label="Pipeline Value" value={money(pipelineValue)} />
        <Kpi label="Weighted Forecast" value={money(weighted)} accent />
        <Kpi label="Won Value" value={money(wonValue)} good />
        <Kpi label="Won This Month" value={`${wonThisMonth.length} · ${money(wonThisMonth.reduce((x, o) => x + o.value, 0))}`} good />
        <Kpi label="Win Rate" value={winRate === null ? '—' : `${winRate}%`} accent />
      </div>

      {/* view switch + creates */}
      <div style={s.tabBar}>
        {(['board', 'list', 'forecast', 'activities'] as View[]).map((v) => (
          <button key={v} type="button" style={view === v ? s.tabActive : s.tab} onClick={() => setView(v)}>
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <CreateDrawer
          entity="Lead"
          subtitle="A new sales lead — an unqualified contact. Qualify it, then convert it into an opportunity."
          endpoint="/api/crm/leads"
          fields={[
            { name: 'name', label: 'Contact name', kind: 'text', required: true, placeholder: 'e.g. Fatima Al Zaabi', span: 2 },
            { name: 'companyName', label: 'Company', kind: 'text', placeholder: 'e.g. Nakheel' },
            { name: 'source', label: 'Source', kind: 'select', defaultValue: 'website', options: SOURCES.map((src) => ({ value: src, label: src.replace('_', ' ') })) },
            { name: 'email', label: 'Email', kind: 'text', placeholder: 'name@company.com' },
            { name: 'phone', label: 'Phone', kind: 'text', placeholder: '+971 …' },
          ]}
        />
        <CreateDrawer
          entity="Opportunity"
          subtitle="A qualified deal. Choose its path: tender/estimation, or direct sale (straight to quotation)."
          endpoint="/api/crm/opportunities"
          fields={[
            { name: 'title', label: 'Opportunity title', kind: 'text', required: true, placeholder: 'e.g. Downtown HQ — security systems', span: 2 },
            { name: 'value', label: 'Value (AED)', kind: 'number', placeholder: '0' },
            { name: 'winProbability', label: 'Win probability %', kind: 'number', placeholder: '20' },
            { name: 'closeDate', label: 'Expected close', kind: 'date' },
            {
              name: 'accountId', label: 'Account', kind: 'select', labelField: 'accountName',
              placeholder: 'No linked account', options: initialAccounts.map((a) => ({ value: a.id, label: a.name })),
            },
            { name: 'leadId', label: 'Lead', kind: 'select', placeholder: 'No linked lead', options: initialLeads.map((l) => ({ value: l.id, label: l.name })) },
            {
              name: 'requiresTender', label: 'Path after winning', kind: 'select', defaultValue: 'true',
              hint: 'Tender path auto-creates a tender on win; direct sale goes straight to a quotation.',
              options: [
                { value: 'true', label: 'Tender / estimation' },
                { value: 'false', label: 'Direct sale (no tender)' },
              ],
            },
            { name: 'ownerId', label: 'Owner', kind: 'text', placeholder: 'e.g. u-sales' },
            {
              name: 'source', label: 'Source', kind: 'select', placeholder: 'Where did it come from?',
              options: [
                { value: 'referral', label: 'Referral' },
                { value: 'existing_client', label: 'Existing client' },
                { value: 'campaign', label: 'Campaign' },
                { value: 'cold_call', label: 'Cold call' },
                { value: 'website', label: 'Website' },
                { value: 'other', label: 'Other' },
              ],
            },
            { name: 'competitors', label: 'Competitors', kind: 'text', placeholder: 'e.g. Rival ELV LLC, Acme Systems', span: 2, hint: 'Comma-separated — who else is bidding' },
            { name: 'nextAction', label: 'Next action', kind: 'text', placeholder: 'e.g. Site survey Sunday', span: 2 },
          ]}
        />
      </div>

      {/* ── BOARD ── */}
      {view === 'board' && (
        <div style={s.board}>
          {boardCols.map((col) => (
            <div
              key={col.key}
              style={{
                ...s.col,
                ...(drag && canDrop(col.key) ? s.colDroppable : {}),
                ...(hoverCol === col.key ? s.colHover : {}),
              }}
              {...dropHandlers(col.key)}
            >
              <div style={s.colHead}>
                <span>{col.label}</span>
                <span style={s.colCount}>{col.kind === 'lead' ? col.leads!.length : col.opps!.length}</span>
              </div>
              {col.kind === 'opp' && col.opps!.length > 0 && ACTIVE_STAGES.includes(col.key) && (
                <div style={s.colValue}>{money(col.opps!.reduce((x, o) => x + o.value, 0))}</div>
              )}

              {col.kind === 'lead' && col.leads!.map((l) => (
                <div key={l.id} style={{ ...s.card, ...s.cardGrab, ...(drag?.id === l.id ? s.cardDragging : {}) }}
                  {...dragHandlers('lead', l.id, l.status)} title="Drag to qualify / convert">
                  <div style={s.cardTitle}>{l.name}</div>
                  {l.companyName && <div style={s.cardSub}>{l.companyName}</div>}
                  <div style={s.cardMetaRow}>
                    {l.source && <span style={s.srcTag}>{l.source.replace('_', ' ')}</span>}
                    <span style={{ ...s.srcTag, textTransform: 'capitalize' }}>{l.status}</span>
                  </div>
                  <div style={s.cardActions}>
                    {l.status !== 'qualified'
                      ? <button style={s.cardBtn} disabled={busy} onClick={() => qualifyLead(l)}>Qualify ✓</button>
                      : <button style={{ ...s.cardBtn, color: 'var(--accent)' }} disabled={busy} onClick={() => convertLead(l)}>→ Opportunity</button>}
                  </div>
                </div>
              ))}

              {col.kind === 'opp' && col.opps!.map((o) => {
                const stageIdx = OPP_STAGES.indexOf(o.stage as (typeof OPP_STAGES)[number]);
                const direct = o.requiresTender === false;
                return (
                  <div
                    key={o.id}
                    style={{ ...s.card, ...s.cardGrab, ...(o.stage === 'won' ? s.cardWon : o.stage === 'lost' ? s.cardLost : {}), ...(drag?.id === o.id ? s.cardDragging : {}) }}
                    {...dragHandlers('opp', o.id, o.stage)}
                    title="Drag to another stage"
                  >
                    <div style={s.cardTitle}>
                      <a href={`/crm/opportunities/${o.id}`} style={{ color: 'var(--fg)', textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>{o.title}</a>
                    </div>
                    {o.accountName && <div style={s.cardSub}>{o.accountName}</div>}
                    <div style={s.cardMetaRow}>
                      <b>{money(o.value)}</b>
                      <span style={{ color: 'var(--muted)' }}>{o.winProbability}%</span>
                      {o.closeDate && <span style={{ color: 'var(--muted)' }}>⏱ {fmt(o.closeDate)}</span>}
                    </div>
                    <div style={s.probBar}><div style={{ ...s.probFill, width: `${o.winProbability}%`, background: o.winProbability >= 70 ? 'var(--good)' : o.winProbability >= 40 ? 'var(--accent)' : 'var(--bad)' }} /></div>
                    <div style={s.cardMetaRow}>
                      <button style={{ ...s.pathTag, color: direct ? 'var(--accent)' : 'var(--muted)' }} disabled={busy || o.stage === 'won' || o.stage === 'lost'}
                        title="Toggle the path after winning" onClick={() => toggleTenderPath(o)}>
                        {direct ? 'Direct sale' : 'Tender path'}
                      </button>
                      {o.ownerId && <span style={{ color: 'var(--muted)', fontSize: 11 }}>◆ {o.ownerId}</span>}
                    </div>
                    {o.nextAction && <div style={s.nextAction}>Next: {o.nextAction}</div>}
                    <div style={s.cardActions}>
                      {ACTIVE_STAGES.includes(o.stage) && (
                        <>
                          {stageIdx > 0 && <button style={s.cardBtn} disabled={busy} onClick={() => changeStage(o, OPP_STAGES[stageIdx - 1])}>◀</button>}
                          {o.stage !== 'negotiation'
                            ? <button style={s.cardBtn} disabled={busy} onClick={() => changeStage(o, OPP_STAGES[stageIdx + 1])}>Advance ▶</button>
                            : (
                              <>
                                <button style={{ ...s.cardBtn, color: 'var(--good)' }} disabled={busy} onClick={() => changeStage(o, 'won')}>Won ✓</button>
                                <button style={{ ...s.cardBtn, color: 'var(--bad)' }} disabled={busy} onClick={() => changeStage(o, 'lost')}>Lost ✗</button>
                              </>
                            )}
                        </>
                      )}
                      {o.stage === 'won' && (
                        <button style={{ ...s.cardBtn, color: 'var(--accent)' }} disabled={busy} onClick={() => convertToQuotation(o)}>→ Quotation</button>
                      )}
                    </div>
                  </div>
                );
              })}

              {((col.kind === 'lead' && col.leads!.length === 0) || (col.kind === 'opp' && col.opps!.length === 0)) && (
                <div style={s.colEmpty}>{drag && canDrop(col.key) ? 'Drop here' : '—'}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {view === 'board' && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '-6px 2px 0' }}>
          Drag cards between stages (or use the card buttons) — a lead drops onto Qualified, a qualified lead onto Discovery to become an opportunity.
        </p>
      )}

      {/* ── LIST ── */}
      {view === 'list' && (
        <>
          <div style={s.panel}>
            <div style={s.panelTitle}>Opportunities ({opps.length})</div>
            {opps.length === 0 ? <p style={s.muted}>No opportunities yet — convert a qualified lead, or create one directly.</p> : (
              <table style={s.table}><thead><tr>
                {['Title', 'Account', 'Value', 'Stage', 'Win %', 'Close', 'Path', 'Owner', 'Next action', ''].map((h) => <th key={h} style={s.th}>{h}</th>)}
              </tr></thead><tbody>
                {opps.map((o) => (
                  <tr key={o.id} style={o.stage === 'won' ? { background: 'rgba(40,167,69,0.04)' } : o.stage === 'lost' ? { background: 'rgba(220,53,69,0.04)' } : undefined}>
                    <td style={s.td}><a href={`/crm/opportunities/${o.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 700 }}>{o.title}</a></td>
                    <td style={s.tdM}>{o.accountName ?? '—'}</td>
                    <td style={s.td}>{money(o.value)}</td>
                    <td style={s.td}>
                      <select style={{ ...s.select, ...stageColor(o.stage) }} value={o.stage} onChange={(e) => changeStage(o, e.target.value)} disabled={busy}>
                        {OPP_STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </td>
                    <td style={s.td}>
                      {o.winProbability}%
                      {forecast?.id === o.id && <div style={s.forecastBubble}><strong>AI: {forecast.prob}%</strong> — {forecast.reason}</div>}
                    </td>
                    <td style={s.tdM}>{o.closeDate ? fmt(o.closeDate) : '—'}</td>
                    <td style={s.td}>
                      <button style={{ ...s.pathTag, color: o.requiresTender === false ? 'var(--accent)' : 'var(--muted)' }} disabled={busy}
                        onClick={() => toggleTenderPath(o)}>
                        {o.requiresTender === false ? 'Direct sale' : 'Tender path'}
                      </button>
                    </td>
                    <td style={s.tdM}>{o.ownerId ?? '—'}</td>
                    <td style={s.tdM}>{o.nextAction ?? '—'}</td>
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      <button type="button" style={s.btnSec} onClick={() => void runForecast(o.id)} disabled={busy}>🤖 AI</button>
                      {o.stage === 'won' && <button type="button" style={{ ...s.btnSec, marginLeft: 6, color: 'var(--accent)' }} disabled={busy} onClick={() => convertToQuotation(o)}>→ Quote</button>}
                    </td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
          <div style={s.panel}>
            <div style={s.panelTitle}>Leads ({leads.length})</div>
            {leads.length === 0 ? <p style={s.muted}>No leads yet — capture the first contact with “+ Lead”.</p> : (
              <table style={s.table}><thead><tr>
                {['Name', 'Company', 'Email', 'Source', 'Status', 'Created', ''].map((h) => <th key={h} style={s.th}>{h}</th>)}
              </tr></thead><tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td style={s.td}><strong>{l.name}</strong></td>
                    <td style={s.tdM}>{l.companyName ?? '—'}</td>
                    <td style={s.tdM}>{l.email ?? '—'}</td>
                    <td style={s.td}><span style={s.srcTag}>{l.source ?? '—'}</span></td>
                    <td style={s.td}><span style={statusColor(l.status)}>{l.status}</span></td>
                    <td style={s.tdM}>{fmt(l.createdAt)}</td>
                    <td style={s.td}>
                      {l.status !== 'qualified' && l.status !== 'disqualified' && <button style={s.btnSec} disabled={busy} onClick={() => qualifyLead(l)}>Qualify</button>}
                      {l.status === 'qualified' && <button style={{ ...s.btnSec, color: 'var(--accent)' }} disabled={busy} onClick={() => convertLead(l)}>→ Opportunity</button>}
                    </td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </>
      )}

      {/* ── FORECAST ── */}
      {view === 'forecast' && (
        <div style={s.panel}>
          <div style={s.panelTitle}>Weighted forecast by expected close</div>
          {forecastRows.length === 0 ? <p style={s.muted}>No active opportunities to forecast.</p> : (
            <table style={s.table}><thead><tr>
              {['Month', 'Deals', 'Pipeline value', 'Weighted forecast'].map((h) => <th key={h} style={s.th}>{h}</th>)}
            </tr></thead><tbody>
              {forecastRows.map(([month, r]) => (
                <tr key={month}>
                  <td style={s.td}><strong>{month === 'unscheduled' ? 'No close date set' : new Date(month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong></td>
                  <td style={s.td}>{r.deals}</td>
                  <td style={s.td}>{money(r.value)}</td>
                  <td style={{ ...s.td, color: 'var(--accent)', fontWeight: 700 }}>{money(r.weighted)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...s.td, fontWeight: 800 }}>Total</td>
                <td style={{ ...s.td, fontWeight: 800 }}>{activeOpps.length}</td>
                <td style={{ ...s.td, fontWeight: 800 }}>{money(pipelineValue)}</td>
                <td style={{ ...s.td, fontWeight: 800, color: 'var(--accent)' }}>{money(weighted)}</td>
              </tr>
            </tbody></table>
          )}
        </div>
      )}

      {/* ── ACTIVITIES ── */}
      {view === 'activities' && (
        <div style={s.panel}>
          <div style={s.panelTitle}>Activities</div>
          {activities === null ? <p style={s.muted}>Loading…</p> : activities.length === 0 ? <p style={s.muted}>No activities logged yet.</p> : (
            <table style={s.table}><thead><tr>
              {['Type', 'Subject', 'Related to', 'Status', 'Due', 'Logged'].map((h) => <th key={h} style={s.th}>{h}</th>)}
            </tr></thead><tbody>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td style={s.td}><span style={s.srcTag}>{a.type}</span></td>
                  <td style={s.td}><strong>{a.subject}</strong></td>
                  <td style={s.tdM}>{a.relatedType ?? '—'}</td>
                  <td style={s.td}><span style={{ ...s.srcTag, textTransform: 'capitalize' }}>{a.status}</span></td>
                  <td style={s.tdM}>{a.dueDate ? fmt(a.dueDate) : '—'}</td>
                  <td style={s.tdM}>{fmt(a.createdAt)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent, good }: { label: string; value: string; accent?: boolean; good?: boolean }) {
  return (
    <div style={s.kpiCard}>
      <span style={s.kpiLabel}>{label}</span>
      <span style={{ ...s.kpiVal, ...(accent ? { color: 'var(--accent)' } : {}), ...(good ? { color: 'var(--good)' } : {}) }}>{value}</span>
    </div>
  );
}

function statusColor(status: string): CSSProperties {
  const colors: Record<string, string> = { new: '#3b82f6', contacted: '#f59e0b', qualified: '#10b981', nurturing: '#8b5cf6', disqualified: '#ef4444' };
  return { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6, background: (colors[status] ?? '#666') + '18', color: colors[status] ?? '#666', border: `1px solid ${(colors[status] ?? '#666')}33` };
}
function stageColor(stage: string): CSSProperties {
  const colors: Record<string, string> = { qualification: '#3b82f6', proposal: '#f59e0b', negotiation: '#8b5cf6', won: '#10b981', lost: '#ef4444' };
  return { color: colors[stage] ?? 'inherit', fontWeight: 600 };
}

const field: CSSProperties = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none' };
const s = {
  kpiStrip: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 } as CSSProperties,
  kpiCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  kpiLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  kpiVal: { fontSize: 18, fontWeight: 700 } as CSSProperties,
  tabBar: { display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  tab: { ...field, cursor: 'pointer', fontWeight: 500 } as CSSProperties,
  tabActive: { ...field, cursor: 'pointer', fontWeight: 700, border: '1px solid var(--accent)', color: 'var(--accent)' } as CSSProperties,
  btnSec: { ...field, cursor: 'pointer', fontWeight: 500, fontSize: 12, padding: '5px 8px' } as CSSProperties,
  select: { ...field, minWidth: 100 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  panelTitle: { fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', padding: '10px 12px 4px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  tdM: { padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  srcTag: { fontSize: 11, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px', textTransform: 'capitalize' } as CSSProperties,
  probBar: { width: '100%', height: 5, background: 'var(--panel-2)', borderRadius: 3, overflow: 'hidden', margin: '6px 0' } as CSSProperties,
  probFill: { height: '100%', borderRadius: 3 } as CSSProperties,
  forecastBubble: { marginTop: 4, fontSize: 11, color: 'var(--accent)', background: 'rgba(255,193,7,0.06)', border: '1px solid rgba(255,193,7,0.15)', borderRadius: 6, padding: '4px 8px' } as CSSProperties,
  errorBar: { background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)', color: '#dc3545', padding: '10px 14px', borderRadius: 10, fontSize: 13 } as CSSProperties,
  okBar: { border: '1px solid var(--good)', color: 'var(--good)', padding: '10px 14px', borderRadius: 10, fontSize: 13 } as CSSProperties,
  board: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(190px, 1fr))', gap: 10, overflowX: 'auto' } as CSSProperties,
  col: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 8, minWidth: 190, display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'start' } as CSSProperties,
  colHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', padding: '4px 4px 0' } as CSSProperties,
  colCount: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '0 7px', fontSize: 11 } as CSSProperties,
  colValue: { fontSize: 11, color: 'var(--accent)', fontWeight: 700, padding: '0 4px' } as CSSProperties,
  colEmpty: { color: 'var(--muted)', textAlign: 'center', padding: '14px 0', fontSize: 12 } as CSSProperties,
  card: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  cardGrab: { cursor: 'grab' } as CSSProperties,
  cardDragging: { opacity: 0.45, cursor: 'grabbing' } as CSSProperties,
  colDroppable: { borderStyle: 'dashed', borderColor: 'var(--accent)' } as CSSProperties,
  colHover: { background: 'rgba(255,193,7,0.06)', borderColor: 'var(--accent)' } as CSSProperties,
  cardWon: { borderColor: 'var(--good)' } as CSSProperties,
  cardLost: { opacity: 0.65 } as CSSProperties,
  cardTitle: { fontWeight: 700, fontSize: 12.5, lineHeight: 1.3 } as CSSProperties,
  cardSub: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  cardMetaRow: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, flexWrap: 'wrap' } as CSSProperties,
  cardActions: { display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' } as CSSProperties,
  cardBtn: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', fontSize: 11.5, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  pathTag: { background: 'transparent', border: '1px dashed var(--border)', borderRadius: 999, fontSize: 10.5, padding: '2px 8px', cursor: 'pointer', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  nextAction: { fontSize: 11.5, color: 'var(--accent)', background: 'rgba(255,193,7,0.05)', border: '1px dashed rgba(255,193,7,0.25)', borderRadius: 6, padding: '3px 7px' } as CSSProperties,
};
