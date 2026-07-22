'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';

// Market Intelligence — browse and tend the catalogue the pricing library draws on. This is the
// "all items, brands, prices, install durations" screen: what a benchmark IS, where it came from,
// and when it was last true. Editing happens here so an estimator on a sheet just picks.

interface MarketItem {
  id: string; name: string; brand: string | null; category: string; unit: string;
  benchmarkCost: number; benchmarkSell: number; installHours: number; source: string | null; asOf: string;
}

const CATEGORIES = ['CCTV', 'ACCESS_CONTROL', 'FIRE_ALARM', 'PA_VA', 'NETWORK', 'INTERCOM', 'BMS', 'STRUCTURED_CABLING', 'AUDIO_VISUAL', 'OTHER'];
const money = (n: number): string => n.toLocaleString('en-AE', { maximumFractionDigits: 2 });
const marginOf = (c: number, s: number): number => (s > 0 ? Math.round(((s - c) / s) * 10) / 10 : 0);
const catLabel = (c: string): string => c.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

export default function MarketIntelligenceClient() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (q.trim()) params.set('q', q.trim());
      if (cat) params.set('category', cat);
      const res = await fetch(`/api/crm/market-items?${params}`, { cache: 'no-store' });
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, cat]);

  useEffect(() => { void load(); }, [load]);

  async function seed(): Promise<void> {
    setMsg(null);
    const res = await fetch('/api/crm/market-items?seed=1', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setMsg(data.added > 0 ? `Seeded ${data.added} starter items.` : 'Catalogue already seeded.');
    void load();
  }

  async function remove(id: string): Promise<void> {
    await fetch(`/api/crm/market-items/${id}`, { method: 'DELETE' }).catch(() => {});
    void load();
  }

  return (
    <div>
      <div style={st.toolbar}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or brand…" style={st.search} aria-label="search" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={st.select} aria-label="category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
        </select>
        <button type="button" onClick={() => setAdding((a) => !a)} style={st.addBtn}>{adding ? 'Close' : '+ Add item'}</button>
        {items.length === 0 && !loading && !q && !cat && (
          <button type="button" onClick={() => void seed()} style={st.seedBtn}>Seed starter catalogue</button>
        )}
        {msg && <span style={st.msg}>{msg}</span>}
      </div>

      {adding && <AddItem onAdded={() => { setAdding(false); void load(); }} />}

      {loading ? <p style={st.muted}>Loading…</p> : items.length === 0 ? (
        <p style={st.muted}>
          {q || cat ? 'No items match.' : 'The catalogue is empty. Seed the starter set, or add items — each becomes a suggestion in the pricing sheet.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={st.table}>
            <thead>
              <tr>
                {['Item', 'Brand', 'Category', 'Unit', 'Cost', 'Sell', 'Margin', 'Install', 'Source', 'As of', ''].map((h) => <th key={h} style={st.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td style={st.td}>{i.name}</td>
                  <td style={st.td}>{i.brand ?? '—'}</td>
                  <td style={st.td}>{catLabel(i.category)}</td>
                  <td style={st.td}>{i.unit}</td>
                  <td style={st.tdR}>{money(i.benchmarkCost)}</td>
                  <td style={st.tdR}>{money(i.benchmarkSell)}</td>
                  <td style={st.tdR}>{marginOf(i.benchmarkCost, i.benchmarkSell)}%</td>
                  <td style={st.tdR}>{i.installHours}h</td>
                  <td style={st.tdMuted}>{i.source ?? '—'}</td>
                  <td style={st.tdMuted}>{i.asOf}</td>
                  <td style={st.td}><button type="button" onClick={() => void remove(i.id)} style={st.del} aria-label={`delete ${i.name}`}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddItem({ onAdded }: { onAdded: () => void }) {
  const [f, setF] = useState({ name: '', brand: '', category: 'CCTV', unit: 'each', benchmarkCost: '', benchmarkSell: '', installHours: '', source: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string): void => setF((p) => ({ ...p, [k]: v }));

  async function save(): Promise<void> {
    if (busy || !f.name.trim()) return;
    setBusy(true);
    try {
      await fetch('/api/crm/market-items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: f.name.trim(), brand: f.brand.trim() || undefined, category: f.category, unit: f.unit.trim() || 'each',
          benchmarkCost: Number(f.benchmarkCost) || 0, benchmarkSell: Number(f.benchmarkSell) || 0,
          installHours: Number(f.installHours) || 0, source: f.source.trim() || undefined,
        }),
      });
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={st.addBox}>
      <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Item name" style={{ ...st.f, gridColumn: 'span 2' }} />
      <input value={f.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Brand" style={st.f} />
      <select value={f.category} onChange={(e) => set('category', e.target.value)} style={st.f}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
      </select>
      <input value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="Unit" style={st.f} />
      <input value={f.benchmarkCost} onChange={(e) => set('benchmarkCost', e.target.value)} placeholder="Cost" inputMode="decimal" style={st.f} />
      <input value={f.benchmarkSell} onChange={(e) => set('benchmarkSell', e.target.value)} placeholder="Sell" inputMode="decimal" style={st.f} />
      <input value={f.installHours} onChange={(e) => set('installHours', e.target.value)} placeholder="Install h" inputMode="decimal" style={st.f} />
      <input value={f.source} onChange={(e) => set('source', e.target.value)} placeholder="Source" style={{ ...st.f, gridColumn: 'span 2' }} />
      <button type="button" onClick={() => void save()} disabled={busy || !f.name.trim()} style={st.saveBtn}>{busy ? 'Saving…' : 'Add'}</button>
    </div>
  );
}

const st = {
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 } as CSSProperties,
  search: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 8, color: 'var(--text, var(--fg))', padding: '8px 11px', fontSize: 13, minWidth: 220 } as CSSProperties,
  select: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 8, color: 'var(--text, var(--fg))', padding: '8px 11px', fontSize: 13 } as CSSProperties,
  addBtn: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#0b1020', padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  seedBtn: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 8, color: 'var(--text, var(--fg))', padding: '8px 14px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  msg: { color: 'var(--good)', fontSize: 12.5 } as CSSProperties,
  addBox: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr) auto', gap: 8, alignItems: 'center', padding: 12, border: '1px solid var(--border)', borderRadius: 10, marginBottom: 14, background: 'var(--panel)' } as CSSProperties,
  f: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 7, color: 'var(--text, var(--fg))', padding: '7px 9px', fontSize: 12.5, width: '100%', boxSizing: 'border-box' } as CSSProperties,
  saveBtn: { background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#0b1020', padding: '7px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 } as CSSProperties,
  th: { textAlign: 'left', padding: '7px 9px', borderBottom: '1px solid var(--border)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', whiteSpace: 'nowrap' } as CSSProperties,
  td: { padding: '7px 9px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdR: { padding: '7px 9px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as CSSProperties,
  tdMuted: { padding: '7px 9px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11.5, whiteSpace: 'nowrap' } as CSSProperties,
  del: { background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 2px', fontSize: 13, lineHeight: 1.6, margin: 0 } as CSSProperties,
};
