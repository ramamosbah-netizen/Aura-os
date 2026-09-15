'use client';

import { useState } from 'react';
import { Plus, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './resource-pool-client.module.css';

type Unit = 'hours' | 'persons' | 'crews' | 'units';
interface ResourcePool {
  id: string; name: string; unit: Unit; sourceType: 'internal' | 'subcontractor'; sourceId: string | null;
}
interface ResourceCapacity {
  id: string; resource: { resourceType: string; canonicalResourceId: string }; unit: Unit;
  quantity: number | null; from: string; to: string; note: string | null;
}
interface Supplier { id: string; code: string; name: string }
interface PoolMember { id: string; poolId: string; employeeId: string }
interface EmployeeOption { canonicalResourceId: string; label: string; secondary: string | null }

export default function ResourcePoolClient({ pools, capacity, suppliers, members, employees }: {
  pools: ResourcePool[]; capacity: ResourceCapacity[]; suppliers: Supplier[];
  members: PoolMember[]; employees: EmployeeOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pool, setPool] = useState({ name: '', unit: 'crews' as Unit, sourceType: 'internal' as 'internal' | 'subcontractor', sourceId: '' });
  const [window, setWindow] = useState({ poolId: '', quantity: '', from: '', to: '', note: '' });
  const [member, setMember] = useState({ poolId: '', employeeId: '' });

  async function send(url: string, body: unknown): Promise<boolean> {
    setBusy(true); setError(null);
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || result?.error || 'Unable to save resource planning record');
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save resource planning record');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createPool(event: React.FormEvent) {
    event.preventDefault();
    if (await send('/api/projects/resource-pools', { ...pool, sourceId: pool.sourceType === 'subcontractor' ? pool.sourceId : null })) {
      setPool({ name: '', unit: 'crews', sourceType: 'internal', sourceId: '' });
    }
  }

  async function createCapacity(event: React.FormEvent) {
    event.preventDefault();
    const selected = pools.find((item) => item.id === window.poolId);
    if (!selected) { setError('Select a governed resource pool.'); return; }
    if (await send('/api/projects/resource-capacity', {
      resourceType: 'pool', canonicalResourceId: selected.id, unit: selected.unit,
      quantity: window.quantity === '' ? null : Number(window.quantity), from: window.from, to: window.to, note: window.note || null,
    })) setWindow({ poolId: '', quantity: '', from: '', to: '', note: '' });
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    if (!member.poolId || !member.employeeId) { setError('Choose a pool and a person.'); return; }
    if (await send(`/api/projects/resource-pools/${member.poolId}/members`, { employeeId: member.employeeId })) {
      setMember({ poolId: member.poolId, employeeId: '' });
    }
  }

  async function removeMember(poolId: string, memberId: string) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/projects/resource-pools/${poolId}/members/${memberId}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || result?.error || 'Unable to remove this member');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove this member');
    } finally {
      setBusy(false);
    }
  }

  const poolName = (id: string) => pools.find((item) => item.id === id)?.name ?? 'Unavailable pool';
  // Read through to HR's own catalogue. A member whose employee record is gone says so rather than
  // showing a uuid or the last name anybody happened to cache.
  const employeeName = (id: string) => employees.find((item) => item.canonicalResourceId === id)?.label ?? 'Unavailable employee';

  return (
    <div className={styles.stack}>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.summary}>
        <div><span>Governed pools</span><strong>{pools.length}</strong><small>Shared across projects in this tenant</small></div>
        <div><span>Capacity windows</span><strong>{capacity.length}</strong><small>Known availability periods</small></div>
        <div><span>Named members</span><strong data-testid="pool-member-count">{members.length}</strong><small>Who is on these crews — not how much they can field</small></div>
      </div>
      <div className={styles.grid}>
        <form className={styles.card} onSubmit={createPool} data-testid="resource-pool-form">
          <div className={styles.cardHead}><UsersRound size={16} /><div><strong>Create resource pool</strong><small>Define one reusable team or equipment group.</small></div></div>
          <label>Pool name<input required value={pool.name} onChange={(event) => setPool({ ...pool, name: event.target.value })} placeholder="ELV installation crew" /></label>
          <div className={styles.row}>
            <label>Measurement<select value={pool.unit} onChange={(event) => setPool({ ...pool, unit: event.target.value as Unit })}><option value="crews">crews</option><option value="persons">people</option><option value="hours">hours</option><option value="units">units</option></select></label>
            <label>Source<select value={pool.sourceType} onChange={(event) => setPool({ ...pool, sourceType: event.target.value as typeof pool.sourceType })}><option value="internal">Internal</option><option value="subcontractor">Subcontractor</option></select></label>
          </div>
          {pool.sourceType === 'subcontractor' && <label>Approved subcontractor<select required value={pool.sourceId} onChange={(event) => setPool({ ...pool, sourceId: event.target.value })}><option value="">Select supplier…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select>{suppliers.length === 0 && <small>No approved subcontractor supplier is available.</small>}</label>}
          <button disabled={busy} type="submit"><Plus size={14} /> Add pool</button>
        </form>

        <form className={styles.card} onSubmit={createCapacity} data-testid="resource-capacity-form">
          <div className={styles.cardHead}><UsersRound size={16} /><div><strong>Declare capacity</strong><small>State how much is available and for which dates.</small></div></div>
          <label>Resource pool<select required value={window.poolId} onChange={(event) => setWindow({ ...window, poolId: event.target.value })}><option value="">Select pool…</option>{pools.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label>
          <div className={styles.row}>
            <label>Available quantity<input type="number" min="0" step="0.01" value={window.quantity} onChange={(event) => setWindow({ ...window, quantity: event.target.value })} placeholder="Blank = unknown" /></label>
            <label>From<input required type="date" value={window.from} onChange={(event) => setWindow({ ...window, from: event.target.value })} /></label>
            <label>To<input required type="date" value={window.to} onChange={(event) => setWindow({ ...window, to: event.target.value })} /></label>
          </div>
          <label>Capacity note<input value={window.note} onChange={(event) => setWindow({ ...window, note: event.target.value })} placeholder="Shift, hire period or availability basis" /></label>
          <button disabled={busy || pools.length === 0} type="submit"><Plus size={14} /> Add capacity</button>
        </form>
      </div>
      <form className={styles.card} onSubmit={addMember} data-testid="pool-member-form">
        <div className={styles.cardHead}><UsersRound size={16} /><div><strong>Crew roster</strong><small>Name who belongs to a pool so its commitments reach them. Membership is not capacity: twelve people can field two crews.</small></div></div>
        <div className={styles.row}>
          <label>Resource pool<select required value={member.poolId} onChange={(event) => setMember({ ...member, poolId: event.target.value })}><option value="">Select pool…</option>{pools.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label>
          <label>Employee<select required value={member.employeeId} onChange={(event) => setMember({ ...member, employeeId: event.target.value })}><option value="">Select employee…</option>{employees.map((item) => <option key={item.canonicalResourceId} value={item.canonicalResourceId}>{item.label}{item.secondary ? ` · ${item.secondary}` : ''}</option>)}</select></label>
        </div>
        <button disabled={busy || pools.length === 0 || employees.length === 0} type="submit"><Plus size={14} /> Add member</button>
      </form>
      {members.length > 0 && <div className={styles.roster} aria-label="Pool members">
        {members.map((item) => <div key={item.id} data-testid={`pool-member-${item.id}`}>
          <strong>{poolName(item.poolId)}</strong>
          <span>{employeeName(item.employeeId)}</span>
          <button type="button" disabled={busy} aria-label={`Remove ${employeeName(item.employeeId)} from ${poolName(item.poolId)}`} onClick={() => removeMember(item.poolId, item.id)}>Remove</button>
        </div>)}
      </div>}
      {capacity.length > 0 && <div className={styles.windows} aria-label="Resource capacity windows">
        {capacity.map((item) => <div key={item.id}><strong>{poolName(item.resource.canonicalResourceId)}</strong><span>{item.quantity === null ? 'Unknown' : `${item.quantity} ${item.unit}`}</span><small>{item.from} → {item.to}{item.note ? ` · ${item.note}` : ''}</small></div>)}
      </div>}
    </div>
  );
}
