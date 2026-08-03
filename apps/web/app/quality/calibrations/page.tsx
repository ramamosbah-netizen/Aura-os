import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CalibrationClient, { type Calibration } from '../../../components/calibration-client';

export const dynamic = 'force-dynamic';

export default async function CalibrationPage() {
  const calibrations = await getJson<Calibration[]>('/api/quality/calibrations');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Quality · Calibration Register</h1>
      <p style={st.sub}>
        Track the calibration of test &amp; measurement equipment — cable certifiers, multimeters,
        torque tools, gauges — with the certificate and next due date. The register flags what is
        <b> due soon</b> or <b>expired</b> so an out-of-calibration instrument never signs off work.
      </p>
      <section style={{ marginTop: 10 }}>
        {calibrations === null ? <p style={st.muted}>API offline.</p> : <CalibrationClient initial={calibrations ?? []} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1120, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 800, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
