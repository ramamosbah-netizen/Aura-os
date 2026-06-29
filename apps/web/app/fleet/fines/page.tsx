import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import FinesClient from '../../../components/fines-client';

export const dynamic = 'force-dynamic';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  plateNumber: string;
}

interface TrafficFine {
  id: string;
  vehicleId: string;
  driverEmployeeId: string | null;
  fineNumber: string;
  violation: string;
  location: string;
  amount: number;
  blackPoints: number;
  fineDate: string;
  status: string;
  paidDate: string | null;
}

export default async function FinesPage() {
  const [fines, vehicles] = await Promise.all([
    getJson<TrafficFine[]>('/api/fleet/fines'),
    getJson<Vehicle[]>('/api/fleet/vehicles'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Fleet · Traffic Fines</h1>
      <p style={st.sub}>
        Record UAE traffic violations against fleet vehicles — amount, black points, and location.
        Assign driver liability (pending → assigned), dispute, or settle (→ paid). Totals roll up
        outstanding exposure and accumulated black points per vehicle.
      </p>
      <section style={{ marginTop: 10 }}>
        {fines === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <FinesClient initialFines={fines ?? []} vehicles={vehicles ?? []} />
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 700, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
