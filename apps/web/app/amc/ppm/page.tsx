import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import PpmClient from '../../../components/ppm-client';

export const dynamic = 'force-dynamic';

interface Contract { id: string; contractNumber: string; clientName: string }
interface PpmSchedule {
  id: string;
  contractId: string;
  taskDescription: string;
  frequency: string;
  nextDueDate: string;
  active: boolean;
  visitsGenerated: number;
}

export default async function PpmPage() {
  const [schedules, contracts] = await Promise.all([
    getJson<PpmSchedule[]>('/api/amc/ppm-schedules'),
    getJson<Contract[]>('/api/amc/contracts'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>AMC · Preventive Maintenance</h1>
      <p style={st.sub}>
        PPM schedules attach a recurring task to a service contract (monthly / quarterly / semi-annual /
        annual). &ldquo;Generate due&rdquo; raises preventive work orders for every schedule whose next visit has
        come due, then advances each schedule one interval.
      </p>
      <section style={{ marginTop: 10 }}>
        {schedules === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <PpmClient initialSchedules={Array.isArray(schedules) ? schedules : []} contracts={Array.isArray(contracts) ? contracts : []} />
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
