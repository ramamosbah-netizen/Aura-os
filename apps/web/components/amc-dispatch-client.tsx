'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import EmptyState from './ui/empty-state';

interface Contract { id: string; contractNumber: string; clientName: string }

interface WorkOrder {
  id: string;
  orderNumber: string;
  contractId?: string | null;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  status: 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  assignedTo?: string | null;
  cost?: number | null;
  scheduledDate?: string | null;
}

const COLUMNS: { key: WorkOrder['status']; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
];

const priorityColor: Record<string, string> = {
  critical: 'var(--bad)', high: 'var(--warn)', medium: 'var(--info)', low: 'var(--muted)',
};

export default function AmcDispatchClient({
  initialWorkOrders,
  contracts,
}: {
  initialWorkOrders: WorkOrder[];
  contracts: Contract[];
}) {
  const [orders, setOrders] = useState<WorkOrder[]>(initialWorkOrders);
  const [error, setError] = useState<string | null>(null);
  const [techFilter, setTechFilter] = useState('');

  // create form
  const [contractId, setContractId] = useState(contracts[0]?.id || '');
  const [orderNumber, setOrderNumber] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<WorkOrder['priority']>('medium');
  const [type, setType] = useState('corrective');

  // per-card inputs
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>({});

  const patch = (w: WorkOrder) => setOrders((prev) => prev.map((x) => (x.id === w.id ? w : x)));

  async function call(url: string, body: unknown): Promise<WorkOrder | null> {
    setError(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
      return data as WorkOrder;
    } catch (e: any) { setError(e.message || 'Request failed'); return null; }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    const num = orderNumber.trim() || `WO-${Date.now().toString().slice(-6)}`;
    const created = await call('/api/amc/work-orders', {
      contractId: contractId || undefined, orderNumber: num, description, priority, type,
    });
    if (created) { setOrders([created, ...orders]); setOrderNumber(''); setDescription(''); }
  }

  async function assign(w: WorkOrder) {
    const tech = assignTo[w.id];
    if (!tech?.trim()) { setError('Enter a technician to assign.'); return; }
    const updated = await call(`/api/amc/work-orders/${w.id}/assign`, { technicianId: tech });
    if (updated) { patch(updated); setAssignTo({ ...assignTo, [w.id]: '' }); }
  }

  async function complete(w: WorkOrder) {
    const c = cost[w.id];
    const updated = await call(`/api/amc/work-orders/${w.id}/complete`, { cost: c ? Number(c) : undefined });
    if (updated) { patch(updated); setCost({ ...cost, [w.id]: '' }); }
  }

  const filtered = useMemo(
    () => (techFilter.trim() ? orders.filter((o) => (o.assignedTo || '').toLowerCase().includes(techFilter.toLowerCase())) : orders),
    [orders, techFilter],
  );
  const byCol = (k: WorkOrder['status']) => filtered.filter((o) => o.status === k);
  const techs = [...new Set(orders.map((o) => o.assignedTo).filter(Boolean))] as string[];

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      <form onSubmit={handleCreate} style={st.formCard}>
        <h3 style={st.formTitle}>Raise a work order</h3>
        <div style={st.grid}>
          <div style={st.field}>
            <label style={st.label}>Contract (optional)</label>
            <select value={contractId} onChange={(e) => setContractId(e.target.value)} style={st.select}>
              <option value="">— none —</option>
              {contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNumber} · {c.clientName}</option>)}
            </select>
          </div>
          <div style={st.field}>
            <label style={st.label}>Order # (auto if blank)</label>
            <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="WO-000123" style={st.input} />
          </div>
          <div style={st.field}>
            <label style={st.label}>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. CCTV camera 4 offline — site call" style={st.input} required />
          </div>
          <div style={st.field}>
            <label style={st.label}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as WorkOrder['priority'])} style={st.select}>
              {['low', 'medium', 'high', 'critical'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={st.field}>
            <label style={st.label}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={st.select}>
              {['corrective', 'preventive', 'inspection'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <button type="submit" style={st.btn}>Raise work order</button>
      </form>

      <div style={st.filterRow}>
        <label style={st.label}>Technician view:</label>
        <input list="tech-list" value={techFilter} onChange={(e) => setTechFilter(e.target.value)} placeholder="filter the board by technician…" style={{ ...st.input, maxWidth: 280 }} />
        <datalist id="tech-list">{techs.map((t) => <option key={t} value={t} />)}</datalist>
        {techFilter && <button onClick={() => setTechFilter('')} style={st.clearBtn}>clear</button>}
      </div>

      {orders.length === 0 ? (
        <section style={st.panel}>
          <EmptyState title="No work orders yet" description="Raise a work order above (from a service ticket, a PPM visit, or a site call), then assign it to a technician and complete it on site — completion with a cost drives the AMC → AR invoice." />
        </section>
      ) : (
        <div style={st.board}>
          {COLUMNS.map((col) => {
            const items = byCol(col.key);
            return (
              <div key={col.key} style={st.column}>
                <div style={st.colHead}>
                  <span>{col.label}</span>
                  <span style={st.colCount}>{items.length}</span>
                </div>
                <div style={st.colBody}>
                  {items.length === 0 ? (
                    <p style={st.colEmpty}>—</p>
                  ) : items.map((w) => (
                    <div key={w.id} style={st.card}>
                      <div style={st.cardHead}>
                        <span style={st.orderNo}>{w.orderNumber}</span>
                        <span style={{ ...st.prio, color: priorityColor[w.priority] }}>{w.priority}</span>
                      </div>
                      <p style={st.desc}>{w.description}</p>
                      <p style={st.metaLine}>{w.type}{w.assignedTo ? ` · 👷 ${w.assignedTo}` : ''}{w.cost != null ? ` · AED ${w.cost}` : ''}</p>

                      {w.status === 'open' && (
                        <div style={st.actionRow}>
                          <input placeholder="technician" value={assignTo[w.id] ?? ''} onChange={(e) => setAssignTo({ ...assignTo, [w.id]: e.target.value })} style={st.miniInput} />
                          <button onClick={() => assign(w)} style={st.btnSm}>Assign</button>
                        </div>
                      )}
                      {(w.status === 'assigned' || w.status === 'in_progress') && (
                        <div style={st.actionRow}>
                          <input type="number" min={0} placeholder="cost (AED)" value={cost[w.id] ?? ''} onChange={(e) => setCost({ ...cost, [w.id]: e.target.value })} style={st.miniInput} />
                          <button onClick={() => complete(w)} style={st.btnSmGood}>Complete ✓</button>
                        </div>
                      )}
                      {w.status === 'completed' && <p style={st.doneNote}>✓ Completed{w.cost != null ? ` — AED ${w.cost} billable` : ''}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  select: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer' } as CSSProperties,
  btn: { background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  filterRow: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' } as CSSProperties,
  clearBtn: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' } as CSSProperties,
  board: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, alignItems: 'start' } as CSSProperties,
  column: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as CSSProperties,
  colHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border)', background: 'var(--panel-2)' } as CSSProperties,
  colCount: { fontSize: 11.5, color: 'var(--muted)', background: 'var(--panel)', borderRadius: 999, padding: '1px 8px' } as CSSProperties,
  colBody: { padding: 10, display: 'flex', flexDirection: 'column', gap: 9, minHeight: 60 } as CSSProperties,
  colEmpty: { color: 'var(--muted)', textAlign: 'center', fontSize: 13, margin: '14px 0' } as CSSProperties,
  card: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px' } as CSSProperties,
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 } as CSSProperties,
  orderNo: { fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700, color: 'var(--text)' } as CSSProperties,
  prio: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase' } as CSSProperties,
  desc: { fontSize: 13, color: 'var(--text)', margin: '0 0 5px', lineHeight: 1.4 } as CSSProperties,
  metaLine: { fontSize: 11.5, color: 'var(--muted)', margin: '0 0 8px' } as CSSProperties,
  actionRow: { display: 'flex', gap: 6, alignItems: 'center' } as CSSProperties,
  miniInput: { flex: 1, minWidth: 0, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  btnSm: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 11px', fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  btnSmGood: { background: 'var(--good)', border: '1px solid var(--good)', borderRadius: 6, padding: '5px 11px', fontSize: 12, fontWeight: 600, color: '#04140b', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  doneNote: { fontSize: 12, color: 'var(--good)', margin: 0 } as CSSProperties,
};
