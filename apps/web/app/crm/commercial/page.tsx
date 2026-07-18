import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CommercialWorkspace, { type CommQuotation, type CommContract, type CommSheet } from '../../../components/commercial-workspace';

export const dynamic = 'force-dynamic';

// CRM · Commercial — a WORKSPACE, not a module/entity/database. It gathers everything
// about the commercial DECISION (Pricing · Quotations · Contracts · Approvals · Margins)
// as LINKED VIEWS; every record stays owned by its origin domain (quotations in CRM,
// contracts in the deal chain, pricing in tendering). The doctrine permits views onto
// records that live elsewhere — no data or ownership moves here.

export default async function CommercialPage() {
  const [quotations, contracts, sheets] = await Promise.all([
    getJson<CommQuotation[]>('/api/crm/quotations'),
    getJson<CommContract[]>('/api/contracts/contracts'),
    getJson<CommSheet[]>('/api/tendering/tenders/pricing/sheets'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>CRM · Commercial</h1>
      <p style={st.sub}>
        Everything the commercial decision needs, in one place — pricing, quotations, contracts,
        approvals and margins. These are linked views; each record is still owned and edited in its
        home (a quote in Quotations, a contract in Contracts, a pricing sheet in Tendering).
      </p>
      <CommercialWorkspace
        quotations={quotations ?? []}
        contracts={contracts ?? []}
        sheets={sheets ?? []}
        apiDown={quotations === null}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1120, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 760, lineHeight: 1.5 } as CSSProperties,
};
