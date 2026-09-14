import { getJson } from '@/lib/api';
import { AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import RolesAdminClient from '@/components/roles-admin-client';

export const dynamic = 'force-dynamic';

interface Role {
  id: string;
  name: string;
  permissions: string[];
  description?: string;
  assignmentScope?: 'tenant' | 'project' | 'tenant-or-project';
}
interface Grant {
  userId: string;
  roleId: string;
  scope: { kind: string; level?: string; id?: string };
}
interface Overview {
  roles: Role[];
  grants: Grant[];
}

export default async function AccessAdminPage() {
  const data = await getJson<Overview>('/api/admin/access');

  if (data === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Roles & Access" glyph="🔐" backToHub subtitle="Permission bundles and per-user grants the API guard enforces." />
        <AdminOffline label="Access" />
      </div>
    );
  }

  const roles = data.roles ?? [];
  const grants = data.grants ?? [];
  const perms = new Set(roles.flatMap((r) => r.permissions ?? [])).size;
  const users = new Set(grants.map((g) => g.userId)).size;
  const kpis: Kpi[] = [
    { label: 'Roles', value: roles.length, sub: 'permission bundles', tone: 'accent' },
    { label: 'User Grants', value: grants.length, sub: `${users} distinct users`, tone: 'info' },
    { label: 'Permission Patterns', value: perms, sub: 'across all roles' },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Roles & Access"
        glyph="🔐"
        backToHub
        subtitle="Choose the employee's real job, assign it at company or project level, and keep preparation separate from approval."
        kpis={kpis}
      />
      <RolesAdminClient initialRoles={roles} initialGrants={grants} />
    </div>
  );
}
