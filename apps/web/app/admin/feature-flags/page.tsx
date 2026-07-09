import { getJson } from '@/lib/api';
import { AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import FeatureFlagsAdminClient, { type FeatureFlag } from '@/components/feature-flags-admin-client';

export const dynamic = 'force-dynamic';

export default async function FeatureFlagsPage() {
  const flags = await getJson<FeatureFlag[]>('/api/admin/feature-flags');

  if (flags === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Feature Flags" glyph="🚩" backToHub subtitle="Stage and roll out capabilities with per-tenant overrides." />
        <AdminOffline label="Config" />
      </div>
    );
  }

  const on = flags.filter((f) => f.enabledDefault).length;
  const withRules = flags.filter((f) => (f.rules?.length ?? 0) > 0).length;
  const kpis: Kpi[] = [
    { label: 'Total Flags', value: flags.length, sub: 'defined', tone: 'accent' },
    { label: 'Enabled', value: on, sub: 'on by default', tone: 'good' },
    { label: 'Disabled', value: flags.length - on, sub: 'off by default' },
    { label: 'With Overrides', value: withRules, sub: 'per-tenant rules', tone: 'info' },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Feature Flags"
        glyph="🚩"
        backToHub
        subtitle="Toggle staged and rolled-out capabilities. A flag has a default state plus optional per-tenant overrides — the server checks it via isEnabled(flag, tenant)."
        kpis={kpis}
      />
      <FeatureFlagsAdminClient initialFlags={flags} />
    </div>
  );
}
