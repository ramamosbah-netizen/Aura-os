'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ExportButton from './export-button';
import CreateDrawer from './ui/create-drawer';

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
const badgeKind: Record<string, string> = { pending: 'badge badge-warn', approved: 'badge badge-good', suspended: 'badge badge-bad' };

export default function SuppliersClient({ initialSuppliers }: { initialSuppliers: Supplier[] }) {
  const router = useRouter();
  const suppliers = initialSuppliers;
  const [error, setError] = useState('');

  const counts = useMemo(() => ({
    approved: suppliers.filter((s) => s.status === 'approved').length,
    pending: suppliers.filter((s) => s.status === 'pending').length,
    suspended: suppliers.filter((s) => s.status === 'suspended').length,
  }), [suppliers]);

  const act = async (id: string, action: 'approve' | 'suspend') => {
    setError('');
    try {
      const res = await fetch(`/api/procurement/suppliers/${id}/status`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Approved</div><div style={{ ...st.cardVal, color: 'var(--good)' }}>{counts.approved}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Pending</div><div style={{ ...st.cardVal, color: 'var(--warn)' }}>{counts.pending}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Suspended</div><div style={{ ...st.cardVal, color: 'var(--bad)' }}>{counts.suspended}</div></div>
      </div>

      <div style={st.toolbar}>
        <CreateDrawer
          entity="Supplier"
          subtitle="Onboard a vendor to the approved-supplier master. New suppliers start as Pending until approved."
          endpoint="/api/procurement/suppliers"
          fields={[
            { name: 'code', label: 'Supplier code', kind: 'text', required: true, placeholder: 'SUP-001' },
            { name: 'name', label: 'Company name', kind: 'text', required: true, placeholder: 'e.g. Gulf Cables & Electrical' },
            {
              name: 'category',
              label: 'Category',
              kind: 'select',
              defaultValue: 'materials',
              options: CATEGORIES.map((c) => ({ value: c, label: c })),
            },
            { name: 'tradeLicense', label: 'Trade licence', kind: 'text', placeholder: 'DED-12345' },
            { name: 'trn', label: 'TRN', kind: 'text', placeholder: '15-digit tax registration no.' },
            { name: 'contactName', label: 'Contact person', kind: 'text', placeholder: 'Name' },
            { name: 'email', label: 'Email', kind: 'text', placeholder: 'ap@vendor.com' },
            { name: 'phone', label: 'Phone', kind: 'text', placeholder: '+9715…' },
          ]}
        />
        <ExportButton filename="suppliers" rows={suppliers as unknown as Array<Record<string, unknown>>} />
        {error && <span style={st.err}>{error}</span>}
      </div>

      {suppliers.length === 0 ? (
        <p style={st.muted}>No suppliers registered — onboard the first one.</p>
      ) : (
        <section className="panel">
          <table className="data-table">
            <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Trade licence</th><th>TRN</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td style={{ color: 'var(--muted)' }}>{s.code}</td>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ textTransform: 'capitalize' }}>{s.category}</td>
                  <td style={{ color: 'var(--muted)' }}>{s.tradeLicense || '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{s.trn || '—'}</td>
                  <td><span className={badgeKind[s.status] ?? 'badge'}>{s.status}</span></td>
                  <td>
                    {s.status !== 'approved' && <button type="button" className="btn" style={{ ...st.smBtn, color: 'var(--good)' }} onClick={() => act(s.id, 'approve')}>{s.status === 'suspended' ? 'Reinstate' : 'Approve'}</button>}
                    {s.status === 'approved' && <button type="button" className="btn" style={{ ...st.smBtn, color: 'var(--bad)' }} onClick={() => act(s.id, 'suspend')}>Suspend</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

const st = {
  cards: { display: 'flex', gap: 14, marginBottom: 18 } as CSSProperties,
  card: { padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', minWidth: 140 } as CSSProperties,
  cardLabel: { fontSize: 11.5, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 } as CSSProperties,
  smBtn: { padding: '5px 12px', fontSize: 12.5, marginRight: 6 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
};
