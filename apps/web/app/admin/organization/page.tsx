import { getJson } from '@/lib/api';
import { AdminCard, AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import OrgProfileClient from '@/components/org-profile-client';
import CompaniesAdminClient, { type Company } from '@/components/companies-admin-client';

export const dynamic = 'force-dynamic';

interface TenantSetting {
  key: string;
  value: string;
  description: string;
}

// Admin Center phase 2 (Vol 15 §2.1): the organization profile — a typed form over
// the tenant settings service (company identity, finance defaults, locale) — plus the
// multi-company registry the app-shell switcher reads.
export default async function OrganizationPage() {
  const [settings, companies] = await Promise.all([
    getJson<TenantSetting[]>('/api/admin/settings'),
    getJson<Company[]>('/api/admin/companies'),
  ]);

  if (settings === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Organization" glyph="🏢" backToHub subtitle="Company identity, finance defaults, and locale conventions." />
        <AdminOffline label="Settings" />
      </div>
    );
  }

  const byKey: Record<string, string> = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const name = byKey['company.name'];
  const trn = byKey['company.trn'];
  const currency = byKey['finance.defaultCurrency'];
  const tz = byKey['locale.timezone'];

  const kpis: Kpi[] = [
    { label: 'Company', value: name ? '✓' : '—', sub: name || 'company.name not set', tone: name ? 'good' : 'warn' },
    { label: 'TRN', value: trn ? '✓' : '—', sub: trn || 'required for VAT documents', tone: trn ? 'good' : 'warn' },
    { label: 'Base Currency', value: currency || '—', sub: 'finance.defaultCurrency', tone: currency ? 'accent' : undefined },
    { label: 'Companies', value: (companies ?? []).length, sub: 'multi-company registry', tone: 'info' },
    { label: 'Timezone', value: tz || '—', sub: 'locale.timezone', tone: tz ? 'info' : undefined },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Organization"
        glyph="🏢"
        backToHub
        subtitle="Company identity, finance defaults, locale conventions, and the multi-company registry the header switcher reads."
        kpis={kpis}
      />
      <AdminCard
        title="Companies"
        desc="The legal entities documents post under. The company switcher in the top bar lists active companies from this registry."
      >
        <CompaniesAdminClient initialCompanies={companies ?? []} />
      </AdminCard>
      <OrgProfileClient initial={byKey} />
    </div>
  );
}
