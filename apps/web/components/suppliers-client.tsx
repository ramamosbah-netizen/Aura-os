'use client';

import { type CSSProperties, useMemo, useState } from 'react';

interface Supplier {
  id: string;
  code: string;
  name: string;
  category: string;
  tradeLicense: string | null;
  trn: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
}

const CATEGORIES = ['materials', 'subcontractor', 'services', 'equipment', 'other'];
const statusColor: Record<string, string> = { pending: '#d97706', approved: '#16a34a', suspended: '#dc2626' };

export default function SuppliersClient({ initialSuppliers }: { initialSuppliers: Supplier[] }) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('materials');
  const [tradeLicense, setTradeLicense] = useState('');
  const [trn, setTrn] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const counts = useMemo(() => ({
    approved: suppliers.filter((s) => s.status === 'approved').length,
    pending: suppliers.filter((s) => s.status === 'pending').length,
    suspended: suppliers.filter((s) => s.status === 'suspended').length,
  }), [suppliers]);

  const create = async () => {
    setError('');
    if (!code.trim() || !name.trim()) return setError('Code and name are required');
    try {
      const res = await fetch('/api/procurement/suppliers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, name, category, tradeLicense: tradeLicense || undefined, trn: trn || undefined, contactName: contactName || undefined, email: email || undefined, phone: phone || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setSuppliers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setCode(''); setName(''); setTradeLicense(''); setTrn(''); setContactName(''); setEmail(''); setPhone('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const act = async (id: string, action: 'approve' | 'suspend') => {
    setError('');
    try {
      const res = await fetch(`/api/procurement/suppliers/${id}/status`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setSuppliers((prev) => prev.map((s) => (s.id === id ? data : s)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Approved</div><div style={{ ...st.cardVal, color: '#16a34a' }}>{counts.approved}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Pending</div><div style={{ ...st.cardVal, color: '#d97706' }}>{counts.pending}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Suspended</div><div style={{ ...st.cardVal, color: '#dc2626' }}>{counts.suspended}</div></div>
      </div>

      <h2 style={st.h2}>Onboard supplier</h2>
      <div style={st.form}>
        <label style={st.label}>Code<input style={st.input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="SUP-001" /></label>
        <label style={st.label}>Name<input style={st.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Steel Ltd" /></label>
        <label style={st.label}>Category
          <select style={st.input} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={st.label}>Trade licence<input style={st.input} value={tradeLicense} onChange={(e) => setTradeLicense(e.target.value)} placeholder="DED-12345" /></label>
        <label style={st.label}>TRN<input style={st.input} value={trn} onChange={(e) => setTrn(e.target.value)} placeholder="15 digits" /></label>
        <label style={st.label}>Contact<input style={st.input} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name" /></label>
        <label style={st.label}>Email<input style={st.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ap@vendor.com" /></label>
        <label style={st.label}>Phone<input style={st.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+9715…" /></label>
        <button style={st.btn} onClick={create}>Add</button>
      </div>
      {error && <p style={st.err}>{error}</p>}

      <h2 style={st.h2}>Suppliers</h2>
      {suppliers.length === 0 ? (
        <p style={st.muted}>No suppliers registered.</p>
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Code</th><th style={st.th}>Name</th><th style={st.th}>Category</th><th style={st.th}>Trade licence</th><th style={st.th}>TRN</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td style={st.td}>{s.code}</td>
                <td style={st.td}>{s.name}</td>
                <td style={st.td}>{s.category}</td>
                <td style={st.td}>{s.tradeLicense || '—'}</td>
                <td style={st.td}>{s.trn || '—'}</td>
                <td style={{ ...st.td, color: statusColor[s.status] || '#000', fontWeight: 600 }}>{s.status}</td>
                <td style={st.td}>
                  {s.status !== 'approved' && <button style={st.smGreen} onClick={() => act(s.id, 'approve')}>{s.status === 'suspended' ? 'Reinstate' : 'Approve'}</button>}
                  {s.status === 'approved' && <button style={st.smRed} onClick={() => act(s.id, 'suspend')}>Suspend</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const st = {
  cards: { display: 'flex', gap: 14, marginBottom: 22 } as CSSProperties,
  card: { padding: '12px 18px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', minWidth: 120 } as CSSProperties,
  cardLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 10 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smRed: { padding: '4px 10px', borderRadius: 4, background: '#dc2626', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
