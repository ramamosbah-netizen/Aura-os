import { AdminHeader, adminPage } from '@/components/admin-chrome';
import ModuleSettingsClient from '@/components/module-settings-client';

export const dynamic = 'force-dynamic';

// Admin Center — per-module business settings (NEW-ERP parity): VAT rate, purchase
// thresholds, default stages, retention, leave defaults… catalog-driven over the
// tenant settings store; modules read the keys at runtime.
export default function ModuleSettingsPage() {
  return (
    <div style={adminPage}>
      <AdminHeader
        title="Module Settings"
        glyph="🎛"
        backToHub
        subtitle="Business defaults per module — rates, thresholds, stages, and policies. Stored as tenant settings the modules read at runtime; raw view stays available in Organisation Settings."
      />
      <ModuleSettingsClient />
    </div>
  );
}
