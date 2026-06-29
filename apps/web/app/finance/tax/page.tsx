import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import TaxDashboard from '../../../components/tax-dashboard';

export const dynamic = 'force-dynamic';

interface TaxCode {
  id: string;
  code: string;
  description: string;
  rate: number;
  taxType: 'standard' | 'reverse_charge' | 'exempt' | 'zero_rated';
  isActive: boolean;
  createdAt: string;
}

interface TaxSummary {
  purchaseTaxLinesCount: number;
  totalTaxableAmount: number;
  totalTaxAmount: number;
  filingPeriod: string;
}

export default async function TaxPage() {
  const [taxCodes, taxSummary] = await Promise.all([
    getJson<TaxCode[]>('/api/finance/tax-codes'),
    getJson<TaxSummary>('/api/finance/tax-summary'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Tax & VAT Engine</h1>
      <p style={st.sub}>
        Configure tax codes, define rates, and track quarterly VAT liabilities.
        Invoice tax lines are automatically calculated and posted to the ledger for audit readiness.
      </p>

      <TaxDashboard
        initialTaxCodes={taxCodes ?? []}
        initialSummary={taxSummary ?? null}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
};
