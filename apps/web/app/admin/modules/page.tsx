import { AdminHeader, adminPage } from '@/components/admin-chrome';
import ModulesAdminClient from '@/components/modules-admin-client';

export const dynamic = 'force-dynamic';

// Admin Center — Module Manager: enable/disable business modules per tenant.
// Disabling hides the module from every user's navigation AND rejects its API
// routes (403) on the next request.
export default function ModulesAdminPage() {
  return (
    <div style={adminPage}>
      <AdminHeader
        title="Module Manager"
        glyph="🧩"
        backToHub
        subtitle="Switch whole business modules on or off for this tenant. Off = hidden from every user's navigation and rejected by the API — data is kept and returns untouched when re-enabled."
      />
      <ModulesAdminClient />
    </div>
  );
}
