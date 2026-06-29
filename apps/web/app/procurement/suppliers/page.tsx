import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SuppliersClient from '../../../components/suppliers-client';

export const dynamic = 'force-dynamic';

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

export default async function SuppliersPage() {
  const suppliers = await getJson<Supplier[]>('/api/procurement/suppliers');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Procurement · Supplier Master</h1>
      <p style={st.sub}>
        The approved-vendor registry behind POs and RFQs. Onboard a supplier (trade licence, TRN,
        category, contact), then approve to clear them for orders; suspend on a compliance lapse and
        reinstate later. Only approved vendors should receive new purchase orders.
      </p>
      <section style={{ marginTop: 10 }}>
        {suppliers === null ? <p style={st.muted}>API offline.</p> : <SuppliersClient initialSuppliers={suppliers} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
