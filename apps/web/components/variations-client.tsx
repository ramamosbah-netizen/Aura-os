'use client';

import { type CSSProperties, useState } from 'react';

interface Project {
  id: string;
  title: string;
  value: number;
}

interface Variation {
  id: string;
  projectId: string;
  projectTitle: string | null;
  title: string;
  type: 'addition' | 'omission';
  amount: number;
  signedAmount: number;
  status: string;
  createdAt: string;
}

interface Summary {
  project: { id: string; title: string; value: number } | null;
  impact: {
    originalValue: number;
    approvedAdditions: number;
    approvedOmissions: number;
    netVariation: number;
    revisedValue: number;
    approvedCount: number;
    pendingCount: number;
  };
}

function money(n: number): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n);
}

export default function VariationsClient({ projects, initialVariations }: { projects: Project[]; initialVariations: Variation[] }) {
  const [variations, setVariations] = useState<Variation[]>(initialVariations);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'addition' | 'omission'>('addition');
  const [amount, setAmount] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState('');

  async function refresh(): Promise<void> {
    const res = await fetch('/api/projects/variations');
    if (res.ok) setVariations(await res.json());
  }

  async function loadSummary(pid: string): Promise<void> {
    if (!pid) {
      setSummary(null);
      return;
    }
    const res = await fetch(`/api/projects/variations/summary/${pid}`);
    if (res.ok) setSummary(await res.json());
  }

  async function create(): Promise<void> {
    setErr('');
    if (!projectId || !title.trim() || !(Number(amount) > 0)) {
      setErr('Project, title and a positive amount are required.');
      return;
    }
    const proj = projects.find((p) => p.id === projectId);
    const res = await fetch('/api/projects/variations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, projectTitle: proj?.title, title, type, amount: Number(amount) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.message ?? data.error ?? 'Create failed');
      return;
    }
    setTitle('');
    setAmount('');
    await refresh();
    await loadSummary(projectId);
  }

  async function setStatus(id: string, status: string): Promise<void> {
    await fetch(`/api/projects/variations/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await refresh();
    if (summary?.project) await loadSummary(summary.project.id);
  }

  return (
    <div>
      <div style={s.card}>
        <div style={s.row}>
          <label style={s.field}>
            <span style={s.label}>Project</span>
            <select style={s.input} value={projectId} onChange={(e) => { setProjectId(e.target.value); loadSummary(e.target.value); }}>
              <option value="">— select —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title} ({money(p.value)})</option>)}
            </select>
          </label>
          <label style={s.field}><span style={s.label}>Variation title</span><input style={s.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Additional MEP works" /></label>
          <label style={s.fieldSm}>
            <span style={s.label}>Type</span>
            <select style={s.input} value={type} onChange={(e) => setType(e.target.value as 'addition' | 'omission')}>
              <option value="addition">Addition (+)</option>
              <option value="omission">Omission (−)</option>
            </select>
          </label>
          <label style={s.fieldSm}><span style={s.label}>Amount</span><input style={s.input} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <button type="button" style={s.primary} onClick={create}>Raise</button>
        </div>
        {err && <p style={s.err}>{err}</p>}
        {summary?.project && (
          <div style={s.summary}>
            <Stat label="Original value" value={money(summary.impact.originalValue)} />
            <Stat label="Approved additions" value={`+${money(summary.impact.approvedAdditions)}`} />
            <Stat label="Approved omissions" value={`−${money(summary.impact.approvedOmissions)}`} />
            <Stat label="Net variation" value={money(summary.impact.netVariation)} />
            <Stat label="Revised value" value={money(summary.impact.revisedValue)} accent />
            {summary.impact.pendingCount > 0 && <Stat label="Pending" value={String(summary.impact.pendingCount)} />}
          </div>
        )}
      </div>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Project</th>
            <th style={s.th}>Variation</th>
            <th style={s.th}>Type</th>
            <th style={s.thR}>Amount</th>
            <th style={s.th}>Status</th>
            <th style={s.th} />
          </tr>
        </thead>
        <tbody>
          {variations.length === 0 ? (
            <tr><td style={s.muted} colSpan={6}>No variations yet — raise one above.</td></tr>
          ) : (
            variations.map((v) => (
              <tr key={v.id} style={s.trow}>
                <td style={s.tdMuted}>{v.projectTitle ?? v.projectId.slice(0, 8)}</td>
                <td style={s.td}>{v.title}</td>
                <td style={s.td}>{v.type === 'addition' ? 'Addition' : 'Omission'}</td>
                <td style={v.type === 'addition' ? s.tdAdd : s.tdOmit}>{v.type === 'addition' ? '+' : '−'}{money(v.amount)}</td>
                <td style={s.td}><span style={s.tag(v.status)}>{v.status}</span></td>
                <td style={s.tdR}>
                  {v.status === 'draft' && <button type="button" style={s.smallBtn} onClick={() => setStatus(v.id, 'submitted')}>Submit</button>}
                  {v.status === 'submitted' && (
                    <>
                      <button type="button" style={s.approveBtn} onClick={() => setStatus(v.id, 'approved')}>Approve</button>
                      <button type="button" style={s.smallBtn} onClick={() => setStatus(v.id, 'rejected')}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={s.stat}>
      <span style={s.statLabel}>{label}</span>
      <span style={accent ? s.statValueAccent : s.statValue}>{value}</span>
    </div>
  );
}

const tagColor = (st: string): string => (st === 'approved' ? 'var(--good)' : st === 'rejected' ? 'var(--bad)' : st === 'submitted' ? 'var(--accent)' : 'var(--muted)');

const s = {
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 } as CSSProperties,
  row: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 170 } as CSSProperties,
  fieldSm: { display: 'flex', flexDirection: 'column', gap: 5, width: 130 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 14 } as CSSProperties,
  primary: { background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#fff', padding: '9px 16px', fontSize: 14, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '8px 2px 0' } as CSSProperties,
  summary: { display: 'flex', gap: 26, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' } as CSSProperties,
  stat: { display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  statLabel: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  statValue: { fontSize: 16, fontWeight: 600 } as CSSProperties,
  statValueAccent: { fontSize: 18, fontWeight: 700, color: 'var(--accent)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 18 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  thR: { textAlign: 'right', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  trow: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px' } as CSSProperties,
  tdMuted: { padding: '10px', color: 'var(--muted)' } as CSSProperties,
  tdAdd: { padding: '10px', textAlign: 'right', color: 'var(--good)', fontWeight: 600 } as CSSProperties,
  tdOmit: { padding: '10px', textAlign: 'right', color: 'var(--bad)', fontWeight: 600 } as CSSProperties,
  tdR: { padding: '10px', textAlign: 'right' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '12px 10px' } as CSSProperties,
  tag: (st: string): CSSProperties => ({ fontSize: 11.5, color: tagColor(st), border: `1px solid ${tagColor(st)}`, borderRadius: 999, padding: '1px 9px', textTransform: 'capitalize' }),
  smallBtn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '6px 11px', fontSize: 12.5, cursor: 'pointer', marginLeft: 6 } as CSSProperties,
  approveBtn: { background: 'var(--good)', border: 'none', borderRadius: 8, color: '#04210f', padding: '6px 11px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
};
