import { getJson } from '@/lib/api';
import { AdminHeader, adminPage, type Kpi } from '@/components/admin-chrome';
import AdminHubClient from '@/components/admin-hub-client';

export const dynamic = 'force-dynamic';

// Administration Center — the landing hub. Pulls live counts from each admin
// subsystem for the KPI strip and per-tile badges, then links out to every
// governance / configuration / integration / observability screen.

interface Role {
  id: string;
}
interface Grant {
  userId: string;
}

export default async function AdminHubPage() {
  const [settings, flags, access, connectors, webhooks, numbering, matrix] = await Promise.all([
    getJson<unknown[]>('/api/admin/settings'),
    getJson<unknown[]>('/api/admin/feature-flags'),
    getJson<{ roles: Role[]; grants: Grant[] }>('/api/admin/access'),
    getJson<unknown[]>('/api/admin/connectors'),
    getJson<unknown[]>('/api/admin/webhooks'),
    getJson<unknown[]>('/api/admin/numbering'),
    getJson<{ rules: unknown[] }>('/api/admin/approval-matrix?entityType=purchase-request'),
  ]);

  const len = (v: unknown[] | null): number => (Array.isArray(v) ? v.length : 0);
  const online =
    settings !== null || flags !== null || access !== null || connectors !== null || webhooks !== null;

  const counts: Record<string, number> = {
    settings: len(settings),
    'feature-flags': len(flags),
    access: (access?.roles?.length ?? 0),
    connectors: len(connectors),
    webhooks: len(webhooks),
    numbering: len(numbering),
    'approval-matrix': matrix?.rules?.length ?? 0,
  };

  const kpis: Kpi[] = [
    { label: 'Roles', value: access?.roles?.length ?? 0, sub: `${access?.grants?.length ?? 0} user grants`, tone: 'accent' },
    { label: 'Feature Flags', value: counts['feature-flags'], sub: 'staged & live', tone: 'info' },
    { label: 'Org Settings', value: counts.settings, sub: 'key/value pairs' },
    { label: 'Connectors', value: counts.connectors, sub: 'external systems' },
    { label: 'Webhooks', value: counts.webhooks, sub: 'outbound endpoints' },
    {
      label: 'API',
      value: online ? 'Online' : 'Offline',
      sub: online ? 'all systems nominal' : 'start the API server',
      tone: online ? 'good' : 'bad',
    },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Administration Center"
        glyph="🛡"
        subtitle="Govern access, configure the platform, wire up integrations, and observe every privileged action — one control plane for the whole tenant."
        kpis={kpis}
      />

      <AdminHubClient counts={counts} />
    </div>
  );
}

