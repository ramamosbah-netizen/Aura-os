'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Lead {
  id: string; name: string; companyName: string | null; email: string | null;
  phone: string | null; status: string; source: string | null; createdAt: string;
}
interface Opportunity {
  id: string; leadId: string | null; accountId: string | null; accountName: string | null;
  title: string; value: number;
  stage: string; winProbability: number; closeDate: string | null; createdAt: string;
}
interface Account { id: string; name: string; }

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'nurturing', 'disqualified'] as const;
const OPP_STAGES = ['qualification', 'proposal', 'negotiation', 'won', 'lost'] as const;
const SOURCES = ['website', 'referral', 'campaign', 'cold_call', 'other'] as const;

function money(n: number) { return n ? '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'; }
function fmt(iso: string) { return new Date(iso).toLocaleDateString(); }

export default function CrmPipelineClient({ initialLeads, initialOpportunities, initialAccounts }: {
  initialLeads: Lead[]; initialOpportunities: Opportunity[]; initialAccounts: Account[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'leads' | 'pipeline'>('leads');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Lead form
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [lName, setLName] = useState(''); const [lCompany, setLCompany] = useState('');
  const [lEmail, setLEmail] = useState(''); const [lPhone, setLPhone] = useState('');
  const [lSource, setLSource] = useState('website');

  // Opp form
  const [showOppForm, setShowOppForm] = useState(false);
  const [oTitle, setOTitle] = useState(''); const [oValue, setOValue] = useState('');
  const [oStage, setOStage] = useState('qualification'); const [oLeadId, setOLeadId] = useState('');
  const [oAccountId, setOAccountId] = useState('');

  // Forecast
  const [forecast, setForecast] = useState<{ id: string; prob: number; reason: string } | null>(null);

  async function createLead() {
    if (!lName.trim()) { setErr('Lead name required'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/crm/leads', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: lName, companyName: lCompany || undefined, email: lEmail || undefined, phone: lPhone || undefined, source: lSource }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Error'); }
      else { setShowLeadForm(false); setLName(''); setLCompany(''); setLEmail(''); setLPhone(''); router.refresh(); }
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  }

  async function createOpportunity() {
    if (!oTitle.trim()) { setErr('Opportunity title required'); return; }
    setBusy(true); setErr(null);
    try {
      const account = initialAccounts.find(a => a.id === oAccountId);
      const res = await fetch('/api/crm/opportunities', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: oTitle, value: Number(oValue) || 0, stage: oStage, leadId: oLeadId || undefined,
          accountId: oAccountId || undefined, accountName: account?.name || undefined,
        }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Error'); }
      else { setShowOppForm(false); setOTitle(''); setOValue(''); setOAccountId(''); router.refresh(); }
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  }

  async function changeStage(id: string, stage: string) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/crm/opportunities/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Error'); }
      else { router.refresh(); }
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  }

  async function runForecast(id: string) {
    setBusy(true); setErr(null); setForecast(null);
    try {
      const res = await fetch(`/api/crm/opportunities/${id}/forecast`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setForecast({ id, prob: data.winProbability, reason: data.reason });
      else setErr(data.error ?? 'Forecast failed');
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  }

  const totalPipeline = initialOpportunities.filter(o => !['won', 'lost'].includes(o.stage)).reduce((s, o) => s + o.value, 0);
  const weightedPipeline = initialOpportunities.filter(o => !['won', 'lost'].includes(o.stage)).reduce((s, o) => s + o.value * (o.winProbability / 100), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {err && <div style={s.errorBar}>{err}</div>}

      {/* KPI Strip */}
      <div style={s.kpiStrip}>
        <div style={s.kpiCard}><span style={s.kpiLabel}>Total Leads</span><span style={s.kpiVal}>{initialLeads.length}</span></div>
        <div style={s.kpiCard}><span style={s.kpiLabel}>Active Opportunities</span><span style={s.kpiVal}>{initialOpportunities.filter(o => !['won','lost'].includes(o.stage)).length}</span></div>
        <div style={s.kpiCard}><span style={s.kpiLabel}>Pipeline Value</span><span style={s.kpiVal}>{money(totalPipeline)}</span></div>
        <div style={s.kpiCard}><span style={s.kpiLabel}>Weighted Forecast</span><span style={{ ...s.kpiVal, color: 'var(--accent)' }}>{money(weightedPipeline)}</span></div>
        <div style={s.kpiCard}><span style={s.kpiLabel}>Won Deals</span><span style={{ ...s.kpiVal, color: 'var(--good)' }}>{initialOpportunities.filter(o => o.stage === 'won').length}</span></div>
      </div>

      {/* Tab bar */}
      <div style={s.tabBar}>
        <button type="button" style={tab === 'leads' ? s.tabActive : s.tab} onClick={() => setTab('leads')}>Leads</button>
        <button type="button" style={tab === 'pipeline' ? s.tabActive : s.tab} onClick={() => setTab('pipeline')}>Pipeline</button>
        <div style={{ flex: 1 }} />
        {tab === 'leads' && <button type="button" style={s.btnAccent} onClick={() => setShowLeadForm(!showLeadForm)}>+ New Lead</button>}
        {tab === 'pipeline' && <button type="button" style={s.btnAccent} onClick={() => setShowOppForm(!showOppForm)}>+ New Opportunity</button>}
      </div>

      {/* Lead creation form */}
      {showLeadForm && (
        <div style={s.formPanel}>
          <div style={s.formRow}>
            <input style={s.input} placeholder="Contact Name *" value={lName} onChange={e => setLName(e.target.value)} />
            <input style={s.input} placeholder="Company" value={lCompany} onChange={e => setLCompany(e.target.value)} />
            <input style={s.input} placeholder="Email" value={lEmail} onChange={e => setLEmail(e.target.value)} />
            <input style={s.input} placeholder="Phone" value={lPhone} onChange={e => setLPhone(e.target.value)} />
            <select style={s.select} value={lSource} onChange={e => setLSource(e.target.value)}>
              {SOURCES.map(src => <option key={src} value={src}>{src}</option>)}
            </select>
            <button type="button" style={s.btnAccent} onClick={createLead} disabled={busy}>Create</button>
            <button type="button" style={s.btnSec} onClick={() => setShowLeadForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Opp creation form */}
      {showOppForm && (
        <div style={s.formPanel}>
          <div style={s.formRow}>
            <input style={s.input} placeholder="Opportunity Title *" value={oTitle} onChange={e => setOTitle(e.target.value)} />
            <input style={{ ...s.input, width: 120 }} placeholder="Value ($)" value={oValue} onChange={e => setOValue(e.target.value)} inputMode="numeric" />
            <select style={s.select} value={oStage} onChange={e => setOStage(e.target.value)}>
              {OPP_STAGES.filter(st => st !== 'won' && st !== 'lost').map(st => <option key={st} value={st}>{st}</option>)}
            </select>
            <select style={s.select} value={oAccountId} onChange={e => setOAccountId(e.target.value)}>
              <option value="">No linked account</option>
              {initialAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select style={s.select} value={oLeadId} onChange={e => setOLeadId(e.target.value)}>
              <option value="">No linked lead</option>
              {initialLeads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button type="button" style={s.btnAccent} onClick={createOpportunity} disabled={busy}>Create</button>
            <button type="button" style={s.btnSec} onClick={() => setShowOppForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ─── LEADS TAB ─── */}
      {tab === 'leads' && (
        <div style={s.panel}>
          {initialLeads.length === 0 ? <p style={s.muted}>No leads yet.</p> : (
            <table style={s.table}><thead><tr>
              {['Name', 'Company', 'Email', 'Source', 'Status', 'Created'].map(h => <th key={h} style={s.th}>{h}</th>)}
            </tr></thead><tbody>
              {initialLeads.map(l => (
                <tr key={l.id}>
                  <td style={s.td}><strong>{l.name}</strong></td>
                  <td style={s.tdM}>{l.companyName ?? '—'}</td>
                  <td style={s.tdM}>{l.email ?? '—'}</td>
                  <td style={s.td}><span style={s.srcTag}>{l.source ?? '—'}</span></td>
                  <td style={s.td}><span style={statusColor(l.status)}>{l.status}</span></td>
                  <td style={s.tdM}>{fmt(l.createdAt)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      )}

      {/* ─── PIPELINE TAB ─── */}
      {tab === 'pipeline' && (
        <div style={s.panel}>
          {initialOpportunities.length === 0 ? <p style={s.muted}>No opportunities yet.</p> : (
            <table style={s.table}><thead><tr>
              {['Title', 'Account', 'Value', 'Stage', 'Win %', 'Close Date', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}
            </tr></thead><tbody>
              {initialOpportunities.map(o => (
                <tr key={o.id} style={o.stage === 'won' ? { background: 'rgba(40,167,69,0.04)' } : o.stage === 'lost' ? { background: 'rgba(220,53,69,0.04)' } : undefined}>
                  <td style={s.td}><strong>{o.title}</strong></td>
                  <td style={s.tdM}>{o.accountName ?? '—'}</td>
                  <td style={s.td}>{money(o.value)}</td>
                  <td style={s.td}>
                    <select style={{ ...s.select, ...stageColor(o.stage) }} value={o.stage} onChange={e => changeStage(o.id, e.target.value)} disabled={busy}>
                      {OPP_STAGES.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={s.probBar}><div style={{ ...s.probFill, width: `${o.winProbability}%`, background: o.winProbability >= 70 ? 'var(--good)' : o.winProbability >= 40 ? 'var(--accent)' : 'var(--bad)' }} /></div>
                      <span style={{ fontSize: 12 }}>{o.winProbability}%</span>
                    </div>
                    {forecast?.id === o.id && (
                      <div style={s.forecastBubble}>
                        <strong>AI: {forecast.prob}%</strong> — {forecast.reason}
                      </div>
                    )}
                  </td>
                  <td style={s.tdM}>{o.closeDate ? fmt(o.closeDate) : '—'}</td>
                  <td style={s.td}>
                    <button type="button" style={s.btnSec} onClick={() => runForecast(o.id)} disabled={busy}>
                      🤖 AI Forecast
                    </button>
                  </td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      )}
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
  kpiStrip: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 } as CSSProperties,
  kpiCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  kpiLabel: { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  kpiVal: { fontSize: 22, fontWeight: 700 } as CSSProperties,
  tabBar: { display: 'flex', gap: 4, alignItems: 'center' } as CSSProperties,
  tab: { ...field, cursor: 'pointer', fontWeight: 500 } as CSSProperties,
  tabActive: { ...field, cursor: 'pointer', fontWeight: 700, border: '1px solid var(--accent)', color: 'var(--accent)' } as CSSProperties,
  btnAccent: { background: 'var(--accent)', color: '#0b0e14', fontWeight: 600, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnSec: { ...field, cursor: 'pointer', fontWeight: 500 } as CSSProperties,
  formPanel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' } as CSSProperties,
  formRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { ...field, flex: 1, minWidth: 140 } as CSSProperties,
  select: { ...field, minWidth: 100 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  tdM: { padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  srcTag: { fontSize: 11, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px', textTransform: 'capitalize' } as CSSProperties,
  probBar: { width: 60, height: 6, background: 'var(--panel-2)', borderRadius: 3, overflow: 'hidden' } as CSSProperties,
  probFill: { height: '100%', borderRadius: 3 } as CSSProperties,
  forecastBubble: { marginTop: 4, fontSize: 11, color: 'var(--accent)', background: 'rgba(255,193,7,0.06)', border: '1px solid rgba(255,193,7,0.15)', borderRadius: 6, padding: '4px 8px' } as CSSProperties,
  errorBar: { background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)', color: '#dc3545', padding: '10px 14px', borderRadius: 10, fontSize: 13 } as CSSProperties,
};
