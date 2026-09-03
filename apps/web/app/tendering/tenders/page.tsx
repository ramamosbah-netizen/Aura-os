import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import TendersClient from '../../../components/tenders-client';

export const dynamic = 'force-dynamic';

interface Tender {
  id: string;
  title: string;
  reference: string | null;
  accountId: string | null;
  accountName: string | null;
  status: string;
  value: number;
  submissionDeadline: string | null;
  source: string | null;
  sourceOpportunityId: string | null;
  ownerId: string | null;
  createdAt: string;
}
interface AccountLite { id: string; name: string; }
interface SheetSummary { tenderId: string; pricedItems: number; boqItems: number; marginPercent: number; }
interface QuotationLite { id: string; sourceTenderId: string | null; quoteNumber: string; status: string; }
interface ContractLite { id: string; tenderId: string | null; status: string; }

export default async function TendersPage() {
  const [tenders, accounts, sheets, quotations, contracts] = await Promise.all([
    getJson<Tender[]>('/api/tendering/tenders'),
    getJson<AccountLite[]>('/api/crm/accounts'),
    getJson<SheetSummary[]>('/api/tendering/tenders/pricing/sheets'),
    getJson<QuotationLite[]>('/api/crm/quotations'),
    getJson<ContractLite[]>('/api/contracts/contracts'),
  ]);

  return (
    <div style={st.page}>
      <TendersClient
        tenders={tenders ?? []}
        accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
        sheets={sheets ?? []}
        quotations={quotations ?? []}
        contracts={contracts ?? []}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
};
