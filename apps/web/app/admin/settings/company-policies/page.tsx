import Link from 'next/link';
import { getJson } from '@/lib/api';
import { AdminCard, AdminHeader, AdminOffline, adminPage } from '@/components/admin-chrome';
import type { PolicyOverview } from '@/components/quotation-approval-policy-client';

export const dynamic = 'force-dynamic';

// Settings → Company Policies (EST-17): the company's own business rules, each kept as versions with
// a change log. Quotation Approval is the first; others join this list as they become configurable.
export default async function CompanyPoliciesPage() {
  const quotation = await getJson<PolicyOverview>('/api/admin/company-policies/quotation-approval');
  const subtitle = (
    <>
      Business rules this company sets for itself — versioned, validated before activation, and enforced by the server.
      {' '}<Link href="/admin/settings">← Organisation Settings</Link>
    </>
  );

  if (quotation === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Company Policies" glyph="📜" backToHub subtitle={subtitle} />
        <AdminOffline label="Company policy" />
      </div>
    );
  }

  const draft = quotation.versions.find((v) => v.status === 'draft');
  return (
    <div style={adminPage}>
      <AdminHeader title="Company Policies" glyph="📜" backToHub subtitle={subtitle} />
      <AdminCard
        title="Quotation Approval"
        desc="Who approves a customer offer, in what order, above which amounts, and whether a manual quotation is allowed."
        right={<Link href="/admin/settings/company-policies/quotation-approval" className="btn">Open →</Link>}
      >
        <div data-testid="company-policy-quotation-approval" style={{ fontSize: 13, display: 'grid', gap: 4 }}>
          <span>{quotation.active ? `Version ${quotation.active.version} is active.` : 'No version is active — an offer is approved once, as before.'}</span>
          {draft && <span>Draft version {draft.version} is open and not yet in force.</span>}
        </div>
      </AdminCard>
    </div>
  );
}
