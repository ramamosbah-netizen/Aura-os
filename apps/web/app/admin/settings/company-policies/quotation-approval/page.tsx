import Link from 'next/link';
import { getJson } from '@/lib/api';
import { AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import QuotationApprovalPolicyClient, { type PolicyOverview } from '@/components/quotation-approval-policy-client';

export const dynamic = 'force-dynamic';

// Settings → Company Policies → Quotation Approval (EST-17).
export default async function QuotationApprovalPolicyPage() {
  const data = await getJson<PolicyOverview>('/api/admin/company-policies/quotation-approval');
  const subtitle = (
    <>
      Who approves a customer offer, in what order and above which amounts — this company&apos;s own rule, versioned. The server enforces it on every approval.
      {' '}<Link href="/admin/settings/company-policies">← Company Policies</Link>
    </>
  );

  if (data === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Quotation Approval" glyph="⚖" backToHub subtitle={subtitle} />
        <AdminOffline label="Company policy" />
      </div>
    );
  }

  const draft = data.versions.find((v) => v.status === 'draft');
  const kpis: Kpi[] = [
    { label: 'Active version', value: data.active ? `v${data.active.version}` : 'None', sub: data.active ? 'offers follow it' : 'single approval', tone: data.active ? 'good' : undefined },
    { label: 'Draft', value: draft ? `v${draft.version}` : '—', sub: draft ? 'not yet in force' : 'none open', tone: draft ? 'info' : undefined },
    { label: 'Approval steps', value: data.active ? data.active.body.steps.length : 1, sub: data.active ? `${data.active.body.currency}, ${data.active.body.amountBasis === 'net' ? 'before VAT' : 'after VAT'}` : 'any approver' },
    { label: 'Changes logged', value: data.changes.length, sub: 'who · when · why', tone: 'accent' },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader title="Quotation Approval" glyph="⚖" backToHub subtitle={subtitle} kpis={kpis} />
      <QuotationApprovalPolicyClient initial={data} />
    </div>
  );
}
