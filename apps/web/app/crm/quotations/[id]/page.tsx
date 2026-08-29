import { fetchJson } from '@/lib/api';
import RecordChrome from '@/components/record-chrome';
import Quotation360Client, { type Quotation, type QuotationPricingView } from '@/components/quotation-360-client';
import DataStateNotice from '@/components/ui/data-state';

export const dynamic = 'force-dynamic';

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quotationResult = await fetchJson<Quotation>(`/api/crm/quotations/${id}`);
  if (!quotationResult.ok) return <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 28px' }}><DataStateNotice error={quotationResult.error} subject="quotation" /></div>;
  const q = quotationResult.data;
  const [revisionsResult, pricingResult] = await Promise.all([
    fetchJson<Quotation[]>(`/api/crm/quotations/${id}/revisions`),
    fetchJson<QuotationPricingView>(`/api/crm/quotations/${id}/pricing`),
  ]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 28px 64px' }}>
      <RecordChrome type="Quotation" title={q.quoteNumber} />
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>
        <a href="/crm/quotations" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Quotations</a> · {q.quoteNumber}
      </div>
      <Quotation360Client
        quotation={q}
        revisions={revisionsResult.ok ? revisionsResult.data : []}
        pricingView={pricingResult.ok ? pricingResult.data : null}
        revisionsError={revisionsResult.ok ? null : revisionsResult.error}
        pricingError={pricingResult.ok ? null : pricingResult.error}
      />
    </div>
  );
}
