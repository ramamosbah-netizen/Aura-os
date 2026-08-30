import { fetchJson, getJson } from '@/lib/api';
import SignalsRadar, { type RadarData } from '@/components/signals-radar';
import DataStateNotice from '@/components/ui/data-state';

export const dynamic = 'force-dynamic';

interface RadarOwner { username: string; roleLabel: string; }

export default async function RadarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === 'string' && value) query.set(key, value);
  const [result, owners] = await Promise.all([
    fetchJson<RadarData>(`/api/crm/signals/radar${query.toString() ? `?${query}` : ''}`),
    getJson<RadarOwner[]>('/api/workspace/users'),
  ]);
  return (
    <section aria-labelledby="sales-radar-title">
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: 'var(--accent)', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, marginBottom: 5 }}>CRM · SALES INTELLIGENCE</div>
        <h1 id="sales-radar-title" style={{ margin: 0, fontSize: 25, letterSpacing: -0.4 }}>Radar</h1>
        <p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 }}>Discover and qualify signals before they become Leads or Opportunities.</p>
      </div>
      {!result.ok ? <DataStateNotice error={result.error} subject="Sales Radar" /> : <SignalsRadar data={result.data} owners={owners ?? []} initialQuery={Object.fromEntries(query.entries())} />}
    </section>
  );
}
