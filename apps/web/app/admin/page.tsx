import { getJson } from '@/lib/api';
import { AdminHeader, adminPage } from '@/components/admin-chrome';
import AdminControlCenterShell from '@/components/admin/admin-control-center-shell';
import type { AdminOverviewData } from '@/components/admin/admin-overview';

export const dynamic = 'force-dynamic';

// AURA OS Master Control Center — the single unified admin landing page.
// Fetches a read-only summary snapshot from GET /api/admin/platform/overview,
// then hands it to the modular Control Center shell. Domain-level detail
// panels continue using their own existing dedicated APIs.

export default async function AdminHubPage() {
  // Single aggregator API call — not 6–10 parallel fetches
  const overview = await getJson<AdminOverviewData>('/api/admin/platform/overview');

  // Fallback values if overview API is offline (dev mode without API running)
  const overviewData: AdminOverviewData = overview ?? {
    usersCount: 0,
    activeModulesCount: 0,
    totalModulesCount: 0,
    pendingApprovals: 0,
    failedJobs: 0,
    securityAlerts: 0,
    lastBackup: 'Unknown',
    securityPosture: {
      status: 'warning',
      healthyCount: 0,
      totalCount: 7,
      checks: {
        authRequired: false,
        rlsEnabled: false,
        forceRls: false,
        dbRoleSafe: false,
        rateLimiting: false,
        auditLogging: false,
        corsPosture: false,
      },
    },
  };

  return (
    <div style={adminPage}>
      <AdminHeader
        title="AURA OS — Master Control Center"
        glyph="🛡"
        subtitle="Enterprise Control Plane: govern security, business logic, workflows, communications, document templates, modules, and system operations — all in one unified cockpit."
      />

      <AdminControlCenterShell overviewData={overviewData} />
    </div>
  );
}
