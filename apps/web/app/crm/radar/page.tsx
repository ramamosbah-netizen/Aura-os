import { getJson } from '@/lib/api';
import SignalsRadar, { type RadarData } from '@/components/signals-radar';

export const dynamic = 'force-dynamic';

export default async function RadarPage() {
  const radar = await getJson<RadarData>('/api/crm/signals/radar');
  return (
    <section aria-labelledby="sales-radar-title">
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: 'var(--accent)', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, marginBottom: 5 }}>CRM · SALES INTELLIGENCE</div>
        <h1 id="sales-radar-title" style={{ margin: 0, fontSize: 25, letterSpacing: -0.4 }}>Radar</h1>
        <p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 }}>Discover and qualify signals before they become Leads or Opportunities.</p>
      </div>
      <SignalsRadar data={radar} />
    </section>
  );
}
