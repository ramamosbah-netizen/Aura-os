import { getJson } from '@/lib/api';
import { AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import FormsAdminClient from '@/components/forms-admin-client';

export const dynamic = 'force-dynamic';

interface SchemaSummary {
  id: string;
  entity: string;
  endpoint: string;
  fieldCount: number;
  overridden: number;
}

// Form Designer P1 (Vol 15 §2.4): tune registered forms without code — labels,
// placeholders, hints, required flags, visibility. Rendered forms and server-side
// validation both run on the merged result.
export default async function FormsAdminPage() {
  const schemas = await getJson<SchemaSummary[]>('/api/admin/forms');

  if (schemas === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Form Designer" glyph="📝" backToHub subtitle="Tune form fields without code — enforced end to end." />
        <AdminOffline label="Forms" />
      </div>
    );
  }

  const customized = schemas.filter((s) => s.overridden > 0).length;
  const kpis: Kpi[] = [
    { label: 'Designable Forms', value: schemas.length, sub: schemas.map((s) => s.entity).join(', '), tone: 'accent' },
    { label: 'Customized', value: customized, sub: customized ? 'forms carry overrides' : 'all on code defaults', tone: customized ? 'info' : undefined },
    { label: 'Enforcement', value: '2×', sub: 'renderer + API validate the same merge', tone: 'good' },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Form Designer"
        glyph="📝"
        backToHub
        subtitle="Rename fields, change placeholders and hints, flip required flags, and hide fields — per tenant, no code. What you design here is what users see and what the API enforces."
        kpis={kpis}
      />
      <FormsAdminClient initialSchemas={schemas} />
    </div>
  );
}
