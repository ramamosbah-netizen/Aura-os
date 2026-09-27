import { getJson } from '@/lib/api';
import Link from 'next/link';
import { AdminCard, AdminHeader, AdminOffline, adminPage } from '@/components/admin-chrome';
import SettingsAdminClient, { type TenantSetting } from '@/components/settings-admin-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const settings = await getJson<TenantSetting[]>('/api/admin/settings');

  if (settings === null) {
    return (
      <div style={adminPage}>
        <AdminHeader
          title="Organisation Settings"
          glyph="⚙"
          backToHub
          subtitle="Per-tenant key/value configuration that modules read at runtime."
        />
        <AdminOffline label="Settings" />
      </div>
    );
  }

  return (
    <div style={adminPage}>
      <SettingsAdminClient initialSettings={settings} />
      <AdminCard title="Company Policies" desc="Versioned business rules the server enforces, such as who approves a customer offer." right={<Link href="/admin/settings/company-policies" className="btn">Open →</Link>}>
        <span style={{ fontSize: 13 }}>Quotation Approval</span>
      </AdminCard>
    </div>
  );
}
