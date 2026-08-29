import type { CSSProperties } from 'react';
import { fetchJson } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import QuotationsWorkspace, { type QuotationFilters, type QuotationPage, type QuotationSummary } from '../../../../components/quotations-workspace';

export const dynamic = 'force-dynamic';

export default async function QuotationRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; ownerId?: string; from?: string; to?: string; offset?: string; view?: string }>;
}) {
  const params = await searchParams;
  const filters: QuotationFilters = { search: params.search ?? '', status: params.status ?? '', ownerId: params.ownerId ?? '', from: params.from ?? '', to: params.to ?? '' };
  const query = quotationQuery(filters, params.offset);
  const [result, summaryResult] = await Promise.all([
    fetchJson<QuotationPage>(`/api/crm/quotations/paged?${query.toString()}`),
    params.view === 'board'
      ? fetchJson<QuotationSummary>(`/api/crm/quotations/summary?${quotationQuery(filters).toString()}`)
      : Promise.resolve(null),
  ]);
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Quotation Register</h1>
      <p style={st.sub}>Search, filter, review, export, and progress quotations through their lifecycle.</p>
      <section style={{ marginTop: 10 }}>
        {result.ok
          ? <QuotationsWorkspace initialPage={result.data} initialSummary={summaryResult?.ok ? summaryResult.data : undefined} surface="register" registerView={params.view === 'board' ? 'board' : 'list'} initialFilters={filters} />
          : <DataStateNotice error={result.error} subject="quotations" />}
      </section>
    </div>
  );
}

function quotationQuery(filters: QuotationFilters, offset?: string): URLSearchParams {
  const query = new URLSearchParams({ limit: '50', offset: offset && /^\d+$/.test(offset) ? offset : '0' });
  for (const [key, value] of [['search', filters.search], ['status', filters.status], ['ownerId', filters.ownerId], ['issueDateFrom', filters.from], ['issueDateTo', filters.to]] as const) {
    if (value.trim()) query.set(key, value.trim());
  }
  return query;
}

const st = {
  page: { maxWidth: 1280, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
};
