import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import AttendanceClient from '../../../components/attendance-client';

export const dynamic = 'force-dynamic';

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  workedHours: number;
  notes: string;
}

export default async function AttendancePage() {
  const records = await getJson<AttendanceRecord[]>('/api/hr/attendance');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>HR · Attendance</h1>
      <p style={st.sub}>
        Daily presence per employee — check-in/out clock times, a status (present, absent, late,
        half-day, leave, holiday), and worked hours derived from the times. Feeds payroll/overtime
        and MoHRE compliance. (Timesheets log effort against projects; attendance logs presence.)
      </p>
      <section style={{ marginTop: 10 }}>
        {records === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <AttendanceClient initialRecords={records ?? []} />
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
