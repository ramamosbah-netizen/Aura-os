'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import EmptyState from './ui/empty-state';
import ExportButton from './export-button';
import NextBestActionBanner from './ui/next-best-action-banner';
import SaveViewButton from './save-view-button';
import SignatureCanvas from './ui/signature-canvas';

interface Project {
  id: string;
  title: string;
}

interface CommissioningRecord {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  system: string;
  location: string | null;
  status: 'pending' | 'in_progress' | 'tested' | 'commissioned' | 'failed';
  pointsTotal: number;
  pointsPassed: number;
  testDate: string | null;
  remarks: string | null;
  commissionedAt: string | null;
  commissionedBy: string | null;
  witnessedBy: string | null;
  createdAt: string;
}

const SYSTEMS = [
  'cctv', 'access_control', 'fire_alarm', 'pa_va', 'bms', 'network',
  'intercom', 'structured_cabling', 'audio_visual', 'other',
];

const label = (s: string) => s.replace(/_/g, ' ').toUpperCase();

export default function CommissioningClient({
  initialRecords,
  projects,
}: {
  initialRecords: CommissioningRecord[];
  projects: Project[];
}) {
  const [records, setRecords] = useState<CommissioningRecord[]>(initialRecords);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [system, setSystem] = useState('cctv');
  const [location, setLocation] = useState('');
  const [pointsTotal, setPointsTotal] = useState('');

  // per-record action inputs
  const [testPassed, setTestPassed] = useState<Record<string, string>>({});
  const [commBy, setCommBy] = useState<Record<string, string>>({});
  const [witBy, setWitBy] = useState<Record<string, string>>({});

  const projName = projects.find((p) => p.id === projectId)?.title || null;

  const patch = (r: CommissioningRecord) => setRecords((prev) => prev.map((x) => (x.id === r.id ? r : x)));

  async function call(url: string, method: string, body: unknown): Promise<CommissioningRecord | null> {
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
      return data as CommissioningRecord;
    } catch (e: any) {
      setError(e.message || 'Request failed');
      return null;
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !title.trim()) return;
    const created = await call('/api/commissioning/records', 'POST', {
      projectId, projectName: projName, code, title, system,
      location: location || undefined,
      pointsTotal: pointsTotal ? Number(pointsTotal) : undefined,
    });
    if (created) {
      setRecords([created, ...records]);
      setCode(''); setTitle(''); setLocation(''); setPointsTotal('');
    }
  }

  async function handleTest(r: CommissioningRecord) {
    const passed = testPassed[r.id];
    if (passed === undefined || passed === '') return;
    const updated = await call(`/api/commissioning/records/${r.id}/test`, 'PUT', {
      pointsPassed: Number(passed),
      pointsTotal: r.pointsTotal || Number(passed),
    });
    if (updated) { patch(updated); setTestPassed({ ...testPassed, [r.id]: '' }); }
  }

  async function handleCommission(r: CommissioningRecord) {
    const by = commBy[r.id]; const wit = witBy[r.id];
    if (!by?.trim() || !wit?.trim()) { setError('Commissioned-by and witnessed-by are both required to sign off.'); return; }
    const updated = await call(`/api/commissioning/records/${r.id}/commission`, 'PUT', {
      commissionedBy: by, witnessedBy: wit,
    });
    if (updated) patch(updated);
  }

  async function handleFail(r: CommissioningRecord) {
    const reason = window.prompt(`Reason ${r.code} failed its test:`);
    if (!reason?.trim()) return;
    const updated = await call(`/api/commissioning/records/${r.id}/fail`, 'PUT', { reason });
    if (updated) patch(updated);
  }

  const kpi = {
    total: records.length,
    commissioned: records.filter((r) => r.status === 'commissioned').length,
    inProgress: records.filter((r) => r.status === 'pending' || r.status === 'in_progress' || r.status === 'tested').length,
    failed: records.filter((r) => r.status === 'failed').length,
  };

  const statusStyle = (s: CommissioningRecord['status']): CSSProperties =>
    s === 'commissioned' ? st.tagGood : s === 'failed' ? st.tagBad : s === 'tested' ? st.tagInfo : st.tagPending;

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      <div style={st.kpiRow}>
        <div style={st.kpiCard}><span style={st.kpiNum}>{kpi.total}</span><span style={st.kpiLabel}>Systems</span></div>
        <div style={st.kpiCard}><span style={{ ...st.kpiNum, color: 'var(--good)' }}>{kpi.commissioned}</span><span style={st.kpiLabel}>Commissioned</span></div>
        <div style={st.kpiCard}><span style={{ ...st.kpiNum, color: 'var(--accent)' }}>{kpi.inProgress}</span><span style={st.kpiLabel}>In progress</span></div>
        <div style={st.kpiCard}><span style={{ ...st.kpiNum, color: 'var(--bad)' }}>{kpi.failed}</span><span style={st.kpiLabel}>Failed</span></div>
        <div style={{ marginLeft: 'auto', alignSelf: 'center', display: 'flex', gap: 8 }}>
          <SaveViewButton />
          <ExportButton
            filename="commissioning-register"
            title="Commissioning Register"
            rows={records as unknown as Array<Record<string, unknown>>}
            columns={[
              { key: 'code', label: 'Code' },
              { key: 'title', label: 'System Title' },
              { key: 'system', label: 'System Type' },
              { key: 'pointsPassed', label: 'Passed' },
              { key: 'pointsTotal', label: 'Total Points' },
              { key: 'status', label: 'Status' },
            ]}
          />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <NextBestActionBanner
          status={kpi.failed > 0 ? 'Failed Test Points' : kpi.inProgress > 0 ? 'Systems In Testing' : 'All Systems Commissioned'}
          recommendedAction={kpi.failed > 0 ? 'Rectify & Re-Test Failed Points' : kpi.inProgress > 0 ? 'Execute Witnessed Test & Commissioning' : 'Proceed to Project Handover'}
          explanation={
            kpi.inProgress > 0
              ? 'Complete test-point matrix and record consultant/client witnessed sign-off to unlock handover.'
              : 'All ELV systems commissioned. Compile O&M manuals and as-builts for formal client acceptance.'
          }
        />
      </div>

      {/* register form */}
      <form onSubmit={handleRegister} style={st.formCard}>
        <h3 style={st.formTitle}>Register a system for Test &amp; Commissioning</h3>
        <div style={st.grid}>
          <div style={st.field}>
            <label style={st.label}>Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={st.select}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div style={st.field}>
            <label style={st.label}>Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. TC-CCTV-01" style={st.input} required />
          </div>
          <div style={st.field}>
            <label style={st.label}>System / title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CCTV — Tower A" style={st.input} required />
          </div>
          <div style={st.field}>
            <label style={st.label}>System type</label>
            <select value={system} onChange={(e) => setSystem(e.target.value)} style={st.select}>
              {SYSTEMS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </div>
          <div style={st.field}>
            <label style={st.label}>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Level 3 lobby" style={st.input} />
          </div>
          <div style={st.field}>
            <label style={st.label}>Test points (total)</label>
            <input type="number" min={0} value={pointsTotal} onChange={(e) => setPointsTotal(e.target.value)} placeholder="e.g. 24" style={st.input} />
          </div>
        </div>
        <button type="submit" style={st.btn}>Register system</button>
      </form>

      <section style={st.panel}>
        <h3 style={st.panelTitle}>Commissioning Register</h3>
        {records.length === 0 ? (
          <EmptyState
            compact
            title="No systems registered for commissioning yet"
            description="Register each ELV system above, record its test-point pass rate, then commission it with a witnessed sign-off — the milestone that unlocks handover."
          />
        ) : (
          <div style={st.list}>
            {records.map((r) => {
              const pct = r.pointsTotal > 0 ? Math.round((r.pointsPassed / r.pointsTotal) * 100) : 0;
              const done = r.status === 'commissioned';
              return (
                <div key={r.id} style={st.card}>
                  <div style={st.cardHead}>
                    <span style={st.code}>{r.code}</span>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={st.tagMuted}>{label(r.system)}</span>
                      <span style={statusStyle(r.status)}>{r.status.replace('_', ' ')}</span>
                    </span>
                  </div>
                  <h4 style={st.cardTitle}>{r.title}</h4>
                  <p style={st.meta}>
                    {r.projectName || '—'}{r.location ? ` · ${r.location}` : ''}
                    {r.testDate ? ` · tested ${r.testDate}` : ''}
                  </p>

                  {r.pointsTotal > 0 && (
                    <div style={st.progressWrap}>
                      <div style={{ ...st.progressBar, width: `${pct}%`, background: pct === 100 ? 'var(--good)' : 'var(--accent)' }} />
                      <span style={st.progressText}>{r.pointsPassed}/{r.pointsTotal} points passed ({pct}%)</span>
                    </div>
                  )}

                  {done ? (
                    <p style={st.signoff}>
                      ✓ Commissioned {r.commissionedAt ? new Date(r.commissionedAt).toLocaleDateString('en-AE') : ''} — by <strong>{r.commissionedBy}</strong>, witnessed by <strong>{r.witnessedBy}</strong>
                    </p>
                  ) : (
                    <div style={st.actions}>
                      <div style={st.actionRow}>
                        <input
                          type="number" min={0}
                          placeholder={`Points passed${r.pointsTotal ? ` / ${r.pointsTotal}` : ''}`}
                          value={testPassed[r.id] ?? ''}
                          onChange={(e) => setTestPassed({ ...testPassed, [r.id]: e.target.value })}
                          style={st.smInput}
                        />
                        <button onClick={() => handleTest(r)} style={st.btnSm}>Record test</button>
                        <button onClick={() => handleFail(r)} style={st.btnSmDanger}>Fail</button>
                      </div>
                      <div style={st.actionRow}>
                        <input placeholder="Commissioned by" value={commBy[r.id] ?? ''} onChange={(e) => setCommBy({ ...commBy, [r.id]: e.target.value })} style={st.smInput} />
                        <input placeholder="Witnessed by (consultant/client)" value={witBy[r.id] ?? ''} onChange={(e) => setWitBy({ ...witBy, [r.id]: e.target.value })} style={st.smInput} />
                        <button onClick={() => handleCommission(r)} style={st.btnSmGood} title="Requires all test points passed">Commission ✓</button>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <SignatureCanvas label="Witnessed Sign-Off Pad (Consultant / Client)" onChange={() => {}} height={100} />
                      </div>
                      {r.remarks && <p style={st.remarks}>Remarks: {r.remarks}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const st = {
  errorPanel: { background: 'var(--bad-soft)', color: 'var(--bad)', border: '1px solid var(--bad)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13.5 } as CSSProperties,
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 22 } as CSSProperties,
  kpiCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  kpiNum: { fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1 } as CSSProperties,
  kpiLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  formCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 24 } as CSSProperties,
  formTitle: { fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: 'var(--text)' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  select: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer' } as CSSProperties,
  btn: { background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' } as CSSProperties,
  panelTitle: { fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: 'var(--text)' } as CSSProperties,
  list: { display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'var(--panel-2)' } as CSSProperties,
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' } as CSSProperties,
  cardTitle: { fontSize: 14.5, fontWeight: 600, margin: '2px 0 4px', color: 'var(--text)' } as CSSProperties,
  meta: { fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px' } as CSSProperties,
  progressWrap: { position: 'relative', height: 20, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', margin: '0 0 12px' } as CSSProperties,
  progressBar: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, transition: 'width 0.3s' } as CSSProperties,
  progressText: { position: 'relative', fontSize: 11, fontWeight: 600, color: 'var(--text)', lineHeight: '20px', paddingLeft: 10, mixBlendMode: 'difference' } as CSSProperties,
  signoff: { fontSize: 13, color: 'var(--good)', margin: '6px 0 0', background: 'var(--good-soft)', borderRadius: 8, padding: '8px 12px' } as CSSProperties,
  actions: { display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  actionRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  smInput: { flex: 1, minWidth: 130, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 12.5, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  btnSm: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  btnSmGood: { background: 'var(--good)', border: '1px solid var(--good)', borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: '#04140b', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  btnSmDanger: { background: 'transparent', border: '1px solid var(--bad)', borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--bad)', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  remarks: { fontSize: 12, color: 'var(--muted)', margin: '2px 0 0', fontStyle: 'italic' } as CSSProperties,
  tagGood: { fontSize: 11, background: 'var(--good-soft)', color: 'var(--good)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagBad: { fontSize: 11, background: 'var(--bad-soft)', color: 'var(--bad)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagInfo: { fontSize: 11, background: 'var(--info-soft)', color: 'var(--info)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagPending: { fontSize: 11, background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagMuted: { fontSize: 11, background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 } as CSSProperties,
};
