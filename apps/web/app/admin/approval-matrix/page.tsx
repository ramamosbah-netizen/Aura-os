import { getJson } from '@/lib/api';
import { AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import ApprovalMatrixClient, { type ApprovalRule } from '@/components/approval-matrix-client';

export const dynamic = 'force-dynamic';

export default async function ApprovalMatrixPage() {
  const data = await getJson<{ entityType: string; rules: ApprovalRule[] }>('/api/admin/approval-matrix?entityType=purchase-request');

  if (data === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Approval Matrix" glyph="⚖" backToHub subtitle="Threshold rules deciding who must approve each document type." />
        <AdminOffline label="Approval" />
      </div>
    );
  }

  const rules = data.rules ?? [];
  const approvers = new Set(rules.flatMap((r) => r.approvers ?? [])).size;
  const maxApprovals = rules.reduce((m, r) => Math.max(m, r.minApprovals ?? 0), 0);
  const kpis: Kpi[] = [
    { label: 'Rules', value: rules.length, sub: data.entityType, tone: 'accent' },
    { label: 'Distinct Approvers', value: approvers, sub: 'referenced' },
    { label: 'Max Approvals', value: maxApprovals, sub: 'strictest rule', tone: 'info' },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Approval Matrix"
        glyph="⚖"
        backToHub
        subtitle="Ordered approval rules per entity type. At runtime the first rule whose conditions all match decides who must approve and how many. Lower order is evaluated first — put a catch-all default last."
        kpis={kpis}
      />
      <ApprovalMatrixClient initialEntityType={data.entityType} initialRules={rules} />
    </div>
  );
}
