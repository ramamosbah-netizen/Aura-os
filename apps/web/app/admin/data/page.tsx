import { AdminHeader, adminPage, type Kpi } from '@/components/admin-chrome';
import DataAdminClient from '@/components/data-admin-client';

export const dynamic = 'force-dynamic';

// Admin Center phase 2 (Vol 15 §2.9): data administration — demo seed, CSV exports
// (the BI feeds), and chart-of-accounts import.
export default function DataAdminPage() {
  const kpis: Kpi[] = [
    { label: 'Exports', value: 4, sub: 'audit, AR/AP aging, invoices', tone: 'accent' },
    { label: 'Imports', value: 1, sub: 'chart of accounts (CSV)', tone: 'info' },
    { label: 'Demo Seed', value: '✓', sub: 'idempotent full deal chain', tone: 'good' },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Data Administration"
        glyph="🗄"
        backToHub
        subtitle="Move data in and out: demo-company seed, CSV exports for Excel / Power BI, and bulk chart-of-accounts import."
        kpis={kpis}
      />
      <DataAdminClient />
    </div>
  );
}
