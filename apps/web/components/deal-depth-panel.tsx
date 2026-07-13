'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

// Deal Depth — the Opportunity 360 execution layer: the buying committee (with coverage
// scoring), our deal team, and the promises made either way (with overdue surfacing).

interface Stakeholder { id: string; contactName: string; role: string; sentiment: string; isChampion: boolean; decisionPower: boolean }
interface Coverage { count: number; gaps: string[]; score: number; needsAttention: boolean }
interface DealMember { id: string; userId: string; userName: string | null; role: string; responsibility: string | null }
interface Commitment { id: string; direction: string; description: string; dueAt: string | null; status: string }
interface CommitSummary { open: number; overdue: number; fulfilled: number; broken: number; needsAttention: boolean }
interface RegisterItem { id: string; kind: string; statement: string; status: string; detail: string | null; dueAt: string | null; confidence: number | null }
interface RegisterSummary { decisions: number; assumptions: number; openQuestions: number; open: number; unvalidatedAssumptions: number; invalidatedAssumptions: number; overdue: number; needsAttention: boolean }
interface HealthDim { key: string; label: string; score: number; band: string; reasons: string[]; applicable: boolean }
interface Health { score: number; band: string; dimensions: HealthDim[]; reasons: string[]; needsAttention: boolean }
interface Depth {
  stakeholders: Stakeholder[]; coverage: Coverage; dealTeam: DealMember[];
  commitments: Commitment[]; commitmentSummary: CommitSummary;
  register: RegisterItem[]; registerSummary: RegisterSummary;
  health: Health;
}

const S_ROLES = ['DECISION_MAKER', 'ECONOMIC_BUYER', 'CHAMPION', 'INFLUENCER', 'TECHNICAL_EVALUATOR', 'PROCUREMENT', 'FINANCE', 'EXECUTIVE_SPONSOR', 'END_USER', 'BLOCKER', 'OTHER'];
const T_ROLES = ['OWNER', 'ACCOUNT_OWNER', 'SALES_MANAGER', 'PRESALES', 'ESTIMATION', 'PROCUREMENT', 'FINANCE', 'LEGAL', 'EXECUTIVE_SPONSOR', 'OTHER'];
const scoreColor = (n: number): string => (n >= 80 ? '#16a34a' : n >= 50 ? '#d97706' : '#dc2626');
const bandColor = (b: string): string => (b === 'HEALTHY' ? '#16a34a' : b === 'AT_RISK' ? '#d97706' : '#dc2626');
const bandDot = (b: string): string => (b === 'HEALTHY' ? '🟢' : b === 'AT_RISK' ? '🟠' : '🔴');
const bandLabel = (b: string): string => (b === 'HEALTHY' ? 'Healthy' : b === 'AT_RISK' ? 'At risk' : 'Critical');
const isOverdue = (c: Commitment): boolean => c.status === 'OPEN' && !!c.dueAt && c.dueAt.slice(0, 10) < new Date().toISOString().slice(0, 10);

export default function DealDepthPanel({ opportunityId }: { opportunityId: string }) {
  const [depth, setDepth] = useState<Depth | null>(null);
  const [busy, setBusy] = useState(false);
  const [sForm, setSForm] = useState({ contactName: '', role: 'DECISION_MAKER' });
  const [tForm, setTForm] = useState({ userName: '', role: 'PRESALES' });
  const [cForm, setCForm] = useState({ direction: 'OURS', description: '', dueAt: '' });
  const [rForm, setRForm] = useState({ kind: 'DECISION', statement: '' });

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/opportunities/${opportunityId}/depth`, { cache: 'no-store' });
    if (res.ok) setDepth(await res.json());
  }, [opportunityId]);
  useEffect(() => { void load(); }, [load]);

  const post = async (path: string, body: unknown): Promise<void> => {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}/${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) await load();
    } finally { setBusy(false); }
  };

  if (!depth) return <section style={st.panel}><p style={st.empty}>Loading deal depth…</p></section>;
  const cov = depth.coverage;
  const health = depth.health;
  const dims = health.dimensions.filter((d) => d.applicable);

  return (
    <section style={st.panel}>
      <h2 style={st.h2}>Deal Depth</h2>

      {/* Deal Health — the S7 roll-up of the four signals below. */}
      <div style={st.healthCard}>
        <div style={st.healthHead}>
          <span style={{ ...st.healthBand, color: bandColor(health.band) }}>
            {bandDot(health.band)} {bandLabel(health.band)}
          </span>
          <span style={{ ...st.healthScore, color: bandColor(health.band) }}>{health.score}<span style={st.healthOf}>/100</span></span>
        </div>
        <div style={st.dimGrid}>
          {dims.map((d) => (
            <div key={d.key} style={st.dimCard} title={d.reasons.join(' · ') || 'no issues'}>
              <div style={st.dimTop}>
                <span style={st.dimName}>{d.label}</span>
                <span style={{ ...st.dimScore, color: bandColor(d.band) }}>{d.score}</span>
              </div>
              <div style={st.bar}><div style={{ ...st.barFill, width: `${d.score}%`, background: bandColor(d.band) }} /></div>
              {d.reasons.length > 0 && <span style={st.dimReason}>{d.reasons[0]}</span>}
            </div>
          ))}
        </div>
        {health.reasons.length > 0 && (
          <div style={st.whyRow}>
            <span style={st.whyLabel}>Why:</span>
            {health.reasons.slice(0, 4).map((r, i) => <span key={i} style={st.whyChip}>{r}</span>)}
          </div>
        )}
      </div>

      {/* Stakeholders + coverage */}
      <div style={st.block}>
        <div style={st.blockHead}>
          <h3 style={st.h3}>Buying Committee</h3>
          <span style={{ ...st.score, color: scoreColor(cov.score) }}>coverage {cov.score}</span>
        </div>
        {cov.gaps.length > 0 && (
          <div style={st.chips}>{cov.gaps.map((g) => <span key={g} style={st.gap}>{g.replace(/_/g, ' ').toLowerCase()}</span>)}</div>
        )}
        {depth.stakeholders.length > 0 && (
          <ul style={st.list}>
            {depth.stakeholders.map((s) => (
              <li key={s.id} style={st.row}>
                <span style={st.name}>{s.contactName}{s.isChampion ? ' ★' : ''}</span>
                <span style={st.roleChip}>{s.role.replace(/_/g, ' ').toLowerCase()}</span>
                <span style={st.meta}>{s.sentiment}{s.decisionPower ? ' · decision power' : ''}</span>
              </li>
            ))}
          </ul>
        )}
        <div style={st.form}>
          <input style={st.input} placeholder="Name" value={sForm.contactName} onChange={(e) => setSForm({ ...sForm, contactName: e.target.value })} />
          <select style={st.sel} value={sForm.role} onChange={(e) => setSForm({ ...sForm, role: e.target.value })}>
            {S_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ').toLowerCase()}</option>)}
          </select>
          <button style={st.btn} disabled={busy || !sForm.contactName.trim()}
            onClick={() => { void post('stakeholders', { ...sForm }); setSForm({ contactName: '', role: 'DECISION_MAKER' }); }}>Add</button>
        </div>
      </div>

      {/* Deal team */}
      <div style={st.block}>
        <h3 style={st.h3}>Deal Team</h3>
        {depth.dealTeam.length > 0 && (
          <ul style={st.list}>
            {depth.dealTeam.map((m) => (
              <li key={m.id} style={st.row}>
                <span style={st.name}>{m.userName ?? m.userId}</span>
                <span style={st.roleChip}>{m.role.replace(/_/g, ' ').toLowerCase()}</span>
                {m.responsibility ? <span style={st.meta}>{m.responsibility}</span> : null}
              </li>
            ))}
          </ul>
        )}
        <div style={st.form}>
          <input style={st.input} placeholder="Member name / id" value={tForm.userName} onChange={(e) => setTForm({ ...tForm, userName: e.target.value })} />
          <select style={st.sel} value={tForm.role} onChange={(e) => setTForm({ ...tForm, role: e.target.value })}>
            {T_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ').toLowerCase()}</option>)}
          </select>
          <button style={st.btn} disabled={busy || !tForm.userName.trim()}
            onClick={() => { void post('deal-team', { userId: tForm.userName, userName: tForm.userName, role: tForm.role }); setTForm({ userName: '', role: 'PRESALES' }); }}>Add</button>
        </div>
      </div>

      {/* Commitments */}
      <div style={st.block}>
        <div style={st.blockHead}>
          <h3 style={st.h3}>Commitments</h3>
          <span style={st.meta}>
            {depth.commitmentSummary.open} open
            {depth.commitmentSummary.overdue > 0 ? <b style={st.overdueTag}> · {depth.commitmentSummary.overdue} overdue</b> : null}
            {' '}· {depth.commitmentSummary.fulfilled} done
          </span>
        </div>
        {depth.commitments.length > 0 && (
          <ul style={st.list}>
            {depth.commitments.map((c) => (
              <li key={c.id} style={st.row}>
                <span style={st.dirChip}>{c.direction === 'OURS' ? 'we' : 'they'}</span>
                <span style={{ ...st.name, textDecoration: c.status === 'FULFILLED' ? 'line-through' : 'none' }}>{c.description}</span>
                {c.dueAt ? <span style={{ ...st.meta, color: isOverdue(c) ? '#dc2626' : 'var(--muted)' }}>due {c.dueAt.slice(0, 10)}</span> : null}
                {c.status === 'OPEN'
                  ? <button style={st.smallBtn} disabled={busy} onClick={() => void post(`commitments/${c.id}/fulfil`, {})}>Fulfil</button>
                  : <span style={st.statusTag}>{c.status.toLowerCase()}</span>}
              </li>
            ))}
          </ul>
        )}
        <div style={st.form}>
          <select style={st.sel} value={cForm.direction} onChange={(e) => setCForm({ ...cForm, direction: e.target.value })}>
            <option value="OURS">we commit</option>
            <option value="THEIRS">they commit</option>
          </select>
          <input style={st.input} placeholder="What was promised?" value={cForm.description} onChange={(e) => setCForm({ ...cForm, description: e.target.value })} />
          <input style={st.date} type="date" value={cForm.dueAt} onChange={(e) => setCForm({ ...cForm, dueAt: e.target.value })} />
          <button style={st.btn} disabled={busy || !cForm.description.trim()}
            onClick={() => { void post('commitments', { ...cForm, dueAt: cForm.dueAt || undefined }); setCForm({ direction: 'OURS', description: '', dueAt: '' }); }}>Add</button>
        </div>
      </div>

      {/* Decisions / Assumptions / Open Questions */}
      <div style={st.block}>
        <div style={st.blockHead}>
          <h3 style={st.h3}>Decisions · Assumptions · Questions</h3>
          <span style={st.meta}>
            {depth.registerSummary.open} open
            {depth.registerSummary.invalidatedAssumptions > 0 ? <b style={st.overdueTag}> · {depth.registerSummary.invalidatedAssumptions} invalidated</b> : null}
            {depth.registerSummary.overdue > 0 ? <b style={st.overdueTag}> · {depth.registerSummary.overdue} overdue</b> : null}
          </span>
        </div>
        {depth.register.length > 0 && (
          <ul style={st.list}>
            {depth.register.map((r) => (
              <li key={r.id} style={st.row}>
                <span style={st.kindChip}>{r.kind === 'OPEN_QUESTION' ? 'question' : r.kind.toLowerCase()}</span>
                <span style={{ ...st.name, textDecoration: r.status !== 'OPEN' ? 'line-through' : 'none' }}>{r.statement}</span>
                {r.status === 'OPEN'
                  ? (r.kind === 'ASSUMPTION'
                      ? <>
                          <button style={st.smallBtn} disabled={busy} onClick={() => void post(`register/${r.id}/resolve`, { to: 'VALIDATED' })}>Validate</button>
                          <button style={st.smallBtn} disabled={busy} onClick={() => void post(`register/${r.id}/resolve`, { to: 'INVALIDATED' })}>Invalidate</button>
                        </>
                      : <button style={st.smallBtn} disabled={busy}
                          onClick={() => void post(`register/${r.id}/resolve`, { to: r.kind === 'DECISION' ? 'DECIDED' : 'RESOLVED' })}>
                          {r.kind === 'DECISION' ? 'Decide' : 'Resolve'}
                        </button>)
                  : <span style={{ ...st.statusTag, color: r.status === 'INVALIDATED' ? '#dc2626' : 'var(--muted)' }}>{r.status.toLowerCase()}</span>}
              </li>
            ))}
          </ul>
        )}
        <div style={st.form}>
          <select style={st.sel} value={rForm.kind} onChange={(e) => setRForm({ ...rForm, kind: e.target.value })}>
            <option value="DECISION">decision</option>
            <option value="ASSUMPTION">assumption</option>
            <option value="OPEN_QUESTION">question</option>
          </select>
          <input style={st.input} placeholder="Statement / question" value={rForm.statement} onChange={(e) => setRForm({ ...rForm, statement: e.target.value })} />
          <button style={st.btn} disabled={busy || !rForm.statement.trim()}
            onClick={() => { void post('register', { ...rForm }); setRForm({ kind: 'DECISION', statement: '' }); }}>Add</button>
        </div>
      </div>
    </section>
  );
}

const st = {
  panel: { border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)', padding: 18, marginTop: 18 } as CSSProperties,
  h2: { fontSize: 17, margin: '0 0 14px', letterSpacing: -0.3 } as CSSProperties,
  block: { paddingTop: 12, marginTop: 12, borderTop: '1px solid var(--border)' } as CSSProperties,
  blockHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 } as CSSProperties,
  h3: { fontSize: 14, margin: '0 0 8px', fontWeight: 600 } as CSSProperties,
  score: { fontSize: 13, fontWeight: 700 } as CSSProperties,
  healthCard: { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel-2)', padding: 14, marginBottom: 4 } as CSSProperties,
  healthHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12 } as CSSProperties,
  healthBand: { fontSize: 15, fontWeight: 700 } as CSSProperties,
  healthScore: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5 } as CSSProperties,
  healthOf: { fontSize: 12, fontWeight: 600, color: 'var(--muted)' } as CSSProperties,
  dimGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 } as CSSProperties,
  dimCard: { display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  dimTop: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 } as CSSProperties,
  dimName: { fontSize: 12, fontWeight: 600 } as CSSProperties,
  dimScore: { fontSize: 13, fontWeight: 700 } as CSSProperties,
  bar: { height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' } as CSSProperties,
  barFill: { height: '100%', borderRadius: 3 } as CSSProperties,
  dimReason: { fontSize: 10.5, color: 'var(--muted)' } as CSSProperties,
  whyRow: { display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 } as CSSProperties,
  whyLabel: { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3 } as CSSProperties,
  whyChip: { fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'var(--panel)', border: '1px solid #d9770655', color: '#b45309' } as CSSProperties,
  chips: { display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 } as CSSProperties,
  gap: { fontSize: 11, padding: '2px 7px', borderRadius: 5, background: 'var(--panel-2)', border: '1px solid #dc262655', color: '#dc2626' } as CSSProperties,
  list: { listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 } as CSSProperties,
  name: { fontWeight: 600 } as CSSProperties,
  roleChip: { fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--panel-2)', border: '1px solid var(--border)', textTransform: 'capitalize' } as CSSProperties,
  dirChip: { fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--panel-2)', border: '1px solid var(--border)', textTransform: 'uppercase', color: 'var(--muted)' } as CSSProperties,
  kindChip: { fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--panel-2)', border: '1px solid var(--border)', textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: 0.3 } as CSSProperties,
  meta: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  overdueTag: { color: '#dc2626' } as CSSProperties,
  statusTag: { fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' } as CSSProperties,
  form: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { flex: '1 1 160px', minWidth: 120, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 12.5 } as CSSProperties,
  sel: { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 12.5 } as CSSProperties,
  date: { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 12.5 } as CSSProperties,
  btn: { fontSize: 12, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--fg)', background: 'var(--fg)', color: 'var(--panel)', cursor: 'pointer' } as CSSProperties,
  smallBtn: { fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer' } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 13, margin: 0 } as CSSProperties,
};
