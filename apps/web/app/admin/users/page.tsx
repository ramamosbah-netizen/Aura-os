import { AdminHeader, adminPage } from '@/components/admin-chrome';
import UsersAdminClient from '@/components/users-admin-client';

export const dynamic = 'force-dynamic';

// Admin Center depth (Vol 15 §2.2): the users registry — register/invite, deactivate,
// company assignment. Deactivation is enforced at login and on every guarded request.
export default function UsersAdminPage() {
  return (
    <div style={adminPage}>
      <AdminHeader
        title="Users"
        glyph="👥"
        backToHub
        subtitle="The user registry: register or invite accounts, assign their company, and deactivate leavers — enforcement is immediate at login and on every API request. Roles live in Roles & Access; workspace visibility in Workspace Access."
      />
      <UsersAdminClient />
    </div>
  );
}
