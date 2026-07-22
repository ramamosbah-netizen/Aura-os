import { getJson } from '@/lib/api';
import RecordChrome from '../../../../../components/record-chrome';
import QuotationPricingClient, { type PricingSheet } from '../../../../../components/quotation-pricing-client';
import SheetItemsAuthor from '../../../../../components/sheet-items-author';
import PricingAdvicePanel from '../../../../../components/pricing-advice-panel';

export const dynamic = 'force-dynamic';

interface QuotationHead { id: string; quoteNumber: string; revision: number; status: string; customerName: string }

export default async function QuotationPricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [q, sheet] = await Promise.all([
    getJson<QuotationHead>(`/api/crm/quotations/${id}`),
    getJson<PricingSheet>(`/api/crm/quotations/${id}/pricing`),
  ]);
  if (!q || !sheet) return <div style={{ padding: 40 }}>Quotation not found or API offline.</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 28px 64px' }}>
      <RecordChrome type="Quotation" title={`${q.quoteNumber} — pricing sheet`} />
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
        <a href="/crm/quotations" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Quotations</a>
        {' · '}
        <a href={`/crm/quotations/${id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>{q.quoteNumber}</a>
        {' · Pricing sheet'}
      </div>
      <h1 style={{ fontSize: 24, margin: '0 0 4px', letterSpacing: -0.5 }}>
        Pricing sheet <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{q.quoteNumber} · Rev {q.revision}</span>
      </h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 20px', fontSize: 13, maxWidth: 680, lineHeight: 1.5 }}>
        The internal cost build-up that authors this quotation. Enter each line’s cost and its target margin;
        the sell price is derived, and <b>Apply to quotation</b> writes those prices onto the quote. Once the
        quotation is approved the sheet locks (read-only) — re-price by raising a revision.
      </p>
      <SheetItemsAuthor id={id} locked={sheet.locked} />
      <PricingAdvicePanel id={id} />
      <QuotationPricingClient id={id} customerName={q.customerName} status={q.status} initialSheet={sheet} />
    </div>
  );
}
