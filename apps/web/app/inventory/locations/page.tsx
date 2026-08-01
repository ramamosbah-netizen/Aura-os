import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import LocationsClient from '../../../components/locations-client';

export const dynamic = 'force-dynamic';

interface StorageLocation {
  id: string; warehouse: string; binCode: string; description: string | null;
  type: 'bin' | 'rack' | 'shelf' | 'floor' | 'yard' | 'van'; active: boolean;
}

export default async function LocationsPage() {
  const locations = await getJson<StorageLocation[]>('/api/inventory/locations');
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Inventory · Warehouses &amp; Bins</h1>
      <p style={st.sub}>
        The storage-location master — every warehouse/store and the bins, racks, shelves, yards and
        vans inside it. Bin codes are how pickers and stock-counters find material; stock and serials
        reference these locations.
      </p>
      <LocationsClient initialLocations={locations ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
};
