'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import EmptyState from './ui/empty-state';

interface Project { id: string; title: string }

interface SerialUnit {
  id: string;
  serialNumber: string;
  itemCode: string;
  itemName: string;
  warehouse: string | null;
  status: 'in_stock' | 'issued' | 'installed' | 'returned' | 'faulty';
  projectId: string | null;
  projectName: string | null;
  location: string | null;
  installedAt: string | null;
  warrantyStartDate: string | null;
  warrantyMonths: number | null;
  notes: string | null;
}

const FILTERS = ['all', 'in_stock', 'issued', 'installed', 'faulty'] as const;
const label = (s: string) => s.replace(/_/g, ' ');

export default function SerialsClient({
  initialSerials,
  projects,
}: {
  initialSerials: SerialUnit[];
  projects: Project[];
}) {
  const [serials, setSerials] = useState<SerialUnit[]>(initialSerials);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  // register form
  const [serialNumber, setSerialNumber] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [warehouse, setWarehouse] = useState('');

  // per-row inputs
  const [issueProj, setIssueProj] = useState<Record<string, string>>({});

  const patch = (u: SerialUnit) => setSerials((prev) => prev.map((x) => (x.id === u.id ? u : x)));

  async function call(url: string, method: string, body: unknown): Promise<SerialUnit | null> {
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
      return data as SerialUnit;
    } catch (e: any) { setError(e.message || 'Request failed'); return null; }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!serialNumber.trim() || !itemCode.trim() || !itemName.trim()) return;
    const created = await call('/api/inventory/serials', 'POST', { serialNumber, itemCode, itemName, warehouse: warehouse || undefined });
    if (created) { setSerials([created, ...serials]); setSerialNumber(''); }
  }

  async function issue(u: SerialUnit) {
    const pid = issueProj[u.id] || projects[0]?.id;
    if (!pid) { setError('Select a project to issue to.'); return; }
    const projectName = projects.find((p) => p.id === pid)?.title;
    const up = await call(`/api/inventory/serials/${u.id}/issue`, 'PUT', { projectId: pid, projectName });
    if (up) patch(up);
  }
  async function install(u: SerialUnit) {
    const location = window.prompt(`Install location for ${u.serialNumber} (e.g. L3 corridor):`) || undefined;
    const up = await call(`/api/inventory/serials/${u.id}/install`, 'PUT', { location, warrantyMonths: 12 });
    if (up) patch(up);
  }
  async function ret(u: SerialUnit) {
    const up = await call(`/api/inventory/serials/${u.id}/return`, 'PUT', {});
    if (up) patch(up);
  }
  async function fault(u: SerialUnit) {
    const reason = window.prompt(`Fault reason for ${u.serialNumber}:`);
    if (!reason?.trim()) return;
    const up = await call(`/api/inventory/serials/${u.id}/fault`, 'PUT', { reason });
    if (up) patch(up);
  }

  const rows = useMemo(() => (filter === 'all' ? serials : serials.filter((s) => s.status === filter)), [serials, filter]);
  const count = (f: string) => (f === 'all' ? serials.length : serials.filter((s) => s.status === f).length);

  const tagStyle = (s: SerialUnit['status']): CSSProperties =>
    s === 'installed' ? st.tagGood : s === 'faulty' ? st.tagBad : s === 'issued' ? st.tagInfo : st.tagMuted;

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      <form onSubmit={handleRegister} style={st.formCard}>
        <h3 style={st.formTitle}>Register a serialised unit</h3>
        <div style={st.grid}>
          <div style={st.field}><label style={st.label}>Serial number</label><input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="e.g. DS-2CD-A1B2C3" style={st.input} required /></div>
          <div style={st.field}><label style={st.label}>Item code</label><input value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="e.g. CAM-4MP-DOME" style={st.input} required /></div>
          <div style={st.field}><label style={st.label}>Item name</label><input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. 4MP Dome Camera" style={st.input} required /></div>
          <div style={st.field}><label style={st.label}>Warehouse</label><input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} placeholder="e.g. Main Store" style={st.input} /></div>
        </div>
        <button type="submit" style={st.btn}>Register unit</button>
      </form>

      <div style={st.filterRow}>
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={filter === f ? st.pillActive : st.pill}>
            {label(f)} <span style={st.pillCount}>{count(f)}</span>
          </button>
        ))}
      </div>

      <section style={st.panel}>
        {rows.length === 0 ? (
          <EmptyState compact title="No serialised units here" description="Register a unit on receipt to track it by serial from stock → issued → installed (with warranty). Serials power warranty claims, asset registers and recalls." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={st.table}>
              <thead>
                <tr>{['Serial', 'Item', 'Status', 'Project', 'Location', 'Warranty', 'Actions'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td style={st.tdCode}>{u.serialNumber}</td>
                    <td style={st.td}>{u.itemName}<div style={st.sub}>{u.itemCode}</div></td>
                    <td style={st.td}><span style={tagStyle(u.status)}>{label(u.status)}</span></td>
                    <td style={st.tdMuted}>{u.projectName || '—'}</td>
                    <td style={st.tdMuted}>{u.location || (u.warehouse ? `📦 ${u.warehouse}` : '—')}</td>
                    <td style={st.tdMuted}>{u.warrantyStartDate ? `${u.warrantyMonths}mo · ${u.warrantyStartDate}` : '—'}</td>
                    <td style={st.td}>
                      <div style={st.actions}>
                        {(u.status === 'in_stock' || u.status === 'returned') && (
                          <>
                            <select value={issueProj[u.id] ?? ''} onChange={(e) => setIssueProj({ ...issueProj, [u.id]: e.target.value })} style={st.miniSelect}>
                              <option value="">project…</option>
                              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                            </select>
                            <button onClick={() => issue(u)} style={st.btnSm}>Issue</button>
                          </>
                        )}
                        {u.status === 'issued' && <button onClick={() => install(u)} style={st.btnSmGood}>Install</button>}
                        {u.status !== 'in_stock' && u.status !== 'faulty' && <button onClick={() => ret(u)} style={st.btnSm}>Return</button>}
                        {u.status !== 'faulty' && <button onClick={() => fault(u)} style={st.btnSmDanger}>Fault</button>}
                        {u.status === 'faulty' && <button onClick={() => ret(u)} style={st.btnSm}>Return to stock</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const st = {
  errorPanel: { background: 'var(--bad-soft)', color: 'var(--bad)', border: '1px solid var(--bad)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13.5 } as CSSProperties,
  formCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 18 } as CSSProperties,
  formTitle: { fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: 'var(--text)' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  btn: { background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  filterRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 } as CSSProperties,
  pill: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 999, padding: '5px 13px', fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer', textTransform: 'capitalize' } as CSSProperties,
  pillActive: { background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 999, padding: '5px 13px', fontSize: 12.5, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  pillCount: { fontSize: 11, opacity: 0.7 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 16px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' } as CSSProperties,
  td: { padding: '10px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', color: 'var(--text)' } as CSSProperties,
  tdCode: { padding: '10px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' } as CSSProperties,
  tdMuted: { padding: '10px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', whiteSpace: 'nowrap' } as CSSProperties,
  sub: { fontSize: 11, color: 'var(--muted)' } as CSSProperties,
  actions: { display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  miniSelect: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', fontSize: 12, color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer', maxWidth: 130 } as CSSProperties,
  btnSm: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  btnSmGood: { background: 'var(--good)', border: '1px solid var(--good)', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#04140b', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  btnSmDanger: { background: 'transparent', border: '1px solid var(--bad)', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: 'var(--bad)', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  tagGood: { fontSize: 11, background: 'var(--good-soft)', color: 'var(--good)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagBad: { fontSize: 11, background: 'var(--bad-soft)', color: 'var(--bad)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagInfo: { fontSize: 11, background: 'var(--info-soft)', color: 'var(--info)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagMuted: { fontSize: 11, background: 'var(--panel-2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
};
