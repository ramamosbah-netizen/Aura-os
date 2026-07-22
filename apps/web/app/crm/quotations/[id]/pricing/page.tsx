import { getJson } from '@/lib/api';
import type { EstimationLineInput } from '@aura/shared';
import RecordChrome from '../../../../../components/record-chrome';
import QuotationPricingClient, { type PricingSheet } from '../../../../../components/quotation-pricing-client';
import PricingAdvicePanel from '../../../../../components/pricing-advice-panel';
import PricingWorkspace from '../../../../../components/pricing-workspace';

export const dynamic = 'force-dynamic';

interface QuotationHead { id: string; quoteNumber: string; revision: number; status: string; customerName: string }

export default async function QuotationPricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [q, sheet, estimation] = await Promise.all([
    getJson<QuotationHead>(`/api/crm/quotations/${id}`),
    getJson<PricingSheet>(`/api/crm/quotations/${id}/pricing`),
    getJson<EstimationLineInput[]>(`/api/crm/quotations/${id}/estimation`),
  ]);
  if (!q || !sheet) return <div style={{ padding: 40 }}>Quotation not found or API offline.</div>;

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 28px 64px' }}>
      <RecordChrome type="Quotation" title={`${q.quoteNumber} — pricing`} />
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
        <a href="/crm/quotations" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Quotations</a>
        {' · '}
        <a href={`/crm/quotations/${id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>{q.quoteNumber}</a>
        {' · Pricing'}
      </div>
      <h1 style={{ fontSize: 24, margin: '0 0 4px', letterSpacing: -0.5 }}>
        Pricing workspace <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{q.quoteNumber} · Rev {q.revision}</span>
      </h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 20px', fontSize: 13, maxWidth: 760, lineHeight: 1.5 }}>
        Build up each item’s cost — materials, labour by productivity, equipment, and the overhead / risk /
        warranty / contingency loadings — take a margin, and <b>save</b> to generate the quote lines. The
        right pane shows the market benchmark, price history and advice for the item you’re working on.
      </p>

      <PricingWorkspace id={id} initial={estimation ?? []} locked={sheet.locked} />
      <div style={{ marginTop: 20 }}><PricingAdvicePanel id={id} /></div>

      <details style={{ marginTop: 20 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 12.5 }}>Advanced — detailed cost sheet (legacy)</summary>
        <div style={{ marginTop: 12 }}>
          <QuotationPricingClient id={id} customerName={q.customerName} status={q.status} initialSheet={sheet} />
        </div>
      </details>
    </div>
  );
}
