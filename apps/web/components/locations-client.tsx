'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import EmptyState from './ui/empty-state';

interface StorageLocation {
  id: string; warehouse: string; binCode: string; description: string | null;
  type: 'bin' | 'rack' | 'shelf' | 'floor' | 'yard' | 'van'; active: boolean;
}

const TYPES = ['bin', 'rack', 'shelf', 'floor', 'yard', 'van'];

export default function LocationsClient({ initialLocations }: { initialLocations: StorageLocation[] }) {
  const [locations, setLocations] = useState<StorageLocation[]>(initialLocations);
  const [error, setError] = useState<string | null>(null);

  const [warehouse, setWarehouse] = useState('');
  const [binCode, setBinCode] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('bin');

  const patch = (l: StorageLocation) => setLocations((prev) => prev.map((x) => (x.id === l.id ? l : x)));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!warehouse.trim() || !binCode.trim()) return;
    setError(null);
    try {
      const res = await fetch('/api/inventory/locations', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ warehouse, binCode, description: description || undefined, type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || 'Failed to add location');
      setLocations([data, ...locations]);
      setBinCode(''); setDescription('');
    } catch (e: any) { setError(e.message || 'Failed to add location'); }
  }

  async function toggle(l: StorageLocation) {
    setError(null);
    try {
      const res = await fetch(`/api/inventory/locations/${l.id}/active`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: !l.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || 'Failed');
      patch(data);
    } catch (e: any) { setError(e.message || 'Failed'); }
  }

  // group by warehouse
  const groups = useMemo(() => {
    const m = new Map<string, StorageLocation[]>();
    for (const l of locations) { const g = m.get(l.warehouse) ?? []; g.push(l); m.set(l.warehouse, g); }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [locations]);

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      <form onSubmit={handleCreate} style={st.formCard}>
        <h3 style={st.formTitle}>Add a storage location</h3>
        <div style={st.grid}>
          <div style={st.field}><label style={st.label}>Warehouse / store</label><input list="wh-list" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} placeholder="e.g. Main Store" style={st.input} required /><datalist id="wh-list">{groups.map(([w]) => <option key={w} value={w} />)}</datalist></div>
          <div style={st.field}><label style={st.label}>Bin code</label><input value={binCode} onChange={(e) => setBinCode(e.target.value)} placeholder="e.g. A-12" style={st.input} required /></div>
          <div style={st.field}><label style={st.label}>Type</label><select value={type} onChange={(e) => setType(e.target.value)} style={st.select}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div style={st.field}><label style={st.label}>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. top shelf, near door" style={st.input} /></div>
        </div>
        <button type="submit" style={st.btn}>Add location</button>
      </form>

      {locations.length === 0 ? (
        <section style={st.panel}>
          <EmptyState compact title="No storage locations yet" description="Set up your warehouses and bin codes so pickers and stock-counters know exactly where each item lives." />
        </section>
      ) : (
        groups.map(([wh, locs]) => (
          <section key={wh} style={st.panel}>
            <h3 style={st.panelTitle}>{wh} <span style={st.count}>{locs.length} bins</span></h3>
            <div style={st.binGrid}>
              {locs.map((l) => (
                <div key={l.id} style={{ ...st.bin, opacity: l.active ? 1 : 0.5 }}>
                  <div style={st.binHead}>
                    <span style={st.binCode}>{l.binCode}</span>
                    <span style={st.binType}>{l.type}</span>
                  </div>
                  {l.description ? <p style={st.binDesc}>{l.description}</p> : null}
                  <button onClick={() => toggle(l)} style={st.toggle}>{l.active ? 'Deactivate' : 'Reactivate'}</button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

const st = {
  errorPanel: { background: 'var(--bad-soft)', color: 'var(--bad)', border: '1px solid var(--bad)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13.5 } as CSSProperties,
  formCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20 } as CSSProperties,
  formTitle: { fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: 'var(--text)' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  select: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer' } as CSSProperties,
  btn: { background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 14 } as CSSProperties,
  panelTitle: { fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10 } as CSSProperties,
  count: { fontSize: 11.5, fontWeight: 500, color: 'var(--muted)', background: 'var(--panel-2)', borderRadius: 999, padding: '1px 9px' } as CSSProperties,
  binGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 } as CSSProperties,
  bin: { border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', background: 'var(--panel-2)' } as CSSProperties,
  binHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } as CSSProperties,
  binCode: { fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 13, color: 'var(--text)' } as CSSProperties,
  binType: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  binDesc: { fontSize: 12, color: 'var(--muted)', margin: '2px 0 8px' } as CSSProperties,
  toggle: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px', fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer' } as CSSProperties,
};
