import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CommercialWorkspace, { type CommQuotation, type CommContract, type CommSheet, type CommercialPricingSummaryRow } from '../../../components/commercial-workspace';
import type { EvidenceDoc, StoredRequirement } from '../../../components/decision-readiness';

export const dynamic = 'force-dynamic';

// CRM · Commercial — a WORKSPACE, not a module/entity/database. It gathers everything
// about the commercial DECISION (Pricing · Quotations · Contracts · Approvals · Margins)
// as LINKED VIEWS; every record stays owned by its origin domain (quotations in CRM,
// contracts in the deal chain, pricing in tendering). The doctrine permits views onto
// records that live elsewhere — no data or ownership moves here. This is a decision workspace,
// not a second cockpit.

export default async function CommercialPage() {
  const [quotations, contracts, sheets, evidence, reqs, pricing] = await Promise.all([
    getJson<CommQuotation[]>('/api/crm/quotations'),
    getJson<CommContract[]>('/api/contracts/contracts'),
    getJson<CommSheet[]>('/api/tendering/tenders/pricing/sheets'),
    // One call for every quotation's evidence — the readiness panel groups by aggregateId
    // client-side rather than asking per record.
    getJson<EvidenceDoc[]>('/api/documents?aggregateType=crm.quotation'),
    // Persisted checklists for every quotation, in one call. Where a quote has one it is the
    // truth; where it has none the panel falls back to matching documents against the template.
    getJson<{ requirements: StoredRequirement[] }>('/api/document-requirements?entityType=crm.quotation'),
    getJson<{ rows: CommercialPricingSummaryRow[] }>('/api/crm/quotations/commercial-pricing-summary'),
  ]);

  return (
    <div style={st.page}>
      <div className="commercial-hero" style={st.hero}>
        <div>
          <div style={st.eyebrow}>SALES &amp; COMMERCIAL / DECISION WORKSPACE</div>
          <h1 style={st.h1}>Commercial Decisions</h1>
          <p style={st.sub}>
            One place to see what needs a decision next. Follow the signal to its canonical record
            — Quotation 360, Tender 360 or Contracts — when work needs to be done.
          </p>
        </div>
        <div style={st.heroAside}>
          <span style={st.status}><span style={st.statusDot} />Single cockpit connected</span>
          <a href="/crm/overview" style={st.backLink}>← Sales overview</a>
        </div>
      </div>
      <CommercialWorkspace
        quotations={quotations ?? []}
        contracts={contracts ?? []}
        sheets={sheets ?? []}
        evidence={evidence ?? []}
        requirements={reqs?.requirements ?? []}
        pricingSummary={pricing?.rows}
        apiDown={quotations === null}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1120, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  hero: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, padding: '8px 0 24px' } as CSSProperties,
  eyebrow: { color: 'var(--accent)', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.4, marginBottom: 8 } as CSSProperties,
  h1: { fontSize: 34, margin: '0 0 8px', letterSpacing: -0.8, lineHeight: 1.1 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: 0, maxWidth: 700, lineHeight: 1.55, fontSize: 14 } as CSSProperties,
  heroAside: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, paddingTop: 5, flexShrink: 0 } as CSSProperties,
  status: { display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--good)', fontSize: 11.5, fontWeight: 700, border: '1px solid var(--good-soft)', background: 'var(--good-soft)', borderRadius: 999, padding: '6px 10px' } as CSSProperties,
  statusDot: { width: 7, height: 7, borderRadius: 999, background: 'var(--good)' } as CSSProperties,
  backLink: { color: 'var(--muted)', fontSize: 12.5, fontWeight: 600 } as CSSProperties,
};
