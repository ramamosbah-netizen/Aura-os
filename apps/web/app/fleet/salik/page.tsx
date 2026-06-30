import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SalikClient from '../../../components/salik-client';

export const dynamic = 'force-dynamic';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  plateNumber: string;
}

interface SalikCharge {
  id: string;
  vehicleId: string;
  plateNumber: string;
  gate: string;
  chargeDate: string;
  chargeTime: string;
  amount: number;
  status: string;
  allocatedTo: string;
}

export default async function SalikPage() {
  const [charges, vehicles] = await Promise.all([
    getJson<SalikCharge[]>('/api/fleet/salik'),
    getJson<Vehicle[]>('/api/fleet/vehicles'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Fleet · Salik (Tolls)</h1>
      <p style={st.sub}>
        Record Dubai road-toll charges per vehicle from the monthly Salik statement — gate, date and
        amount (fixed 4 AED, 6 at Sheikh Zayed Rd peak). Allocate a charge to a cost owner
        (driver/project) for recovery, or dispute an erroneous one. Totals exclude disputed charges.
      </p>
      <section style={{ marginTop: 10 }}>
        {charges === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <SalikClient initialCharges={charges ?? []} vehicles={vehicles ?? []} />
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
