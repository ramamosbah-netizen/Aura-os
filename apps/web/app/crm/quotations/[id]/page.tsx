import { getJson } from '@/lib/api';
import RecordChrome from '@/components/record-chrome';
import Quotation360Client, { type Quotation } from '@/components/quotation-360-client';

export const dynamic = 'force-dynamic';

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await getJson<Quotation>(`/api/crm/quotations/${id}`);
  if (!q) return <div style={{ padding: 40 }}>Quotation not found or API offline.</div>;
  const revisions = (await getJson<Quotation[]>(`/api/crm/quotations/${id}/revisions`)) ?? [];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 28px 64px' }}>
      <RecordChrome type="Quotation" title={q.quoteNumber} />
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>
        <a href="/crm/quotations" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Quotations</a> · {q.quoteNumber}
      </div>
      <Quotation360Client quotation={q} revisions={revisions} />
    </div>
  );
}
