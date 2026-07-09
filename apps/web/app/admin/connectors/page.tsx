import { getJson } from '@/lib/api';
import { AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import ConnectorsAdminClient, { type Connector } from '@/components/connectors-admin-client';

export const dynamic = 'force-dynamic';

export default async function ConnectorsPage() {
  const connectors = await getJson<Connector[]>('/api/admin/connectors');

  if (connectors === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Connectors" glyph="🔌" backToHub subtitle="Outbound links to ERP, e-invoicing, and bank-feed systems." />
        <AdminOffline label="Integration" />
      </div>
    );
  }

  const enabled = connectors.filter((c) => c.enabled).length;
  const kpis: Kpi[] = [
    { label: 'Connectors', value: connectors.length, sub: 'registered', tone: 'accent' },
    { label: 'Enabled', value: enabled, sub: 'actively pushing', tone: 'good' },
    { label: 'Disabled', value: connectors.length - enabled, sub: 'paused' },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Connectors"
        glyph="🔌"
        backToHub
        subtitle="Register connectors to external systems (ERP, e-invoicing, bank feeds). Matching events are mapped and pushed out. Auth secrets are write-only — stored but never shown here."
        kpis={kpis}
      />
      <ConnectorsAdminClient initialConnectors={connectors} />
    </div>
  );
}
