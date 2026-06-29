import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import TimesheetClient from '../../../components/timesheet-client';

export const dynamic = 'force-dynamic';

interface TimesheetEntry {
  id: string;
  employeeId: string;
  projectId: string | null;
  date: string;
  hours: number;
  overtime: number;
  description: string;
  status: string;
  createdAt: string;
}

export default async function TimesheetsPage() {
  const entries = await getJson<TimesheetEntry[]>('/api/hr/timesheets');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>HR · Timesheets</h1>
      <p style={st.sub}>
        Daily hour logging per employee — optionally linked to a project and WBS node. Entries flow
        through draft → submitted → approved/rejected. Approved hours feed into payroll and project
        actual cost.
      </p>
      <section style={{ marginTop: 10 }}>
        {entries === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <TimesheetClient initialEntries={entries ?? []} />
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
