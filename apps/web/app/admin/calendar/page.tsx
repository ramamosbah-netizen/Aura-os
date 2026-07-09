import { getJson } from '@/lib/api';
import { AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import CalendarAdminClient, { type CalendarDef } from '@/components/calendar-admin-client';

export const dynamic = 'force-dynamic';

// Admin Center phase 2 (Vol 15 §2.1): business calendars — weekends, public holidays,
// and reduced-hour periods (Ramadan). The kernel CalendarService drives working-day
// math for HR timesheets and project scheduling.
export default async function CalendarAdminPage() {
  const calendars = await getJson<CalendarDef[]>('/api/admin/calendar');

  if (calendars === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Business Calendar" glyph="🗓" backToHub subtitle="Working days, holidays, and Ramadan-hour adjustments." />
        <AdminOffline label="Calendar" />
      </div>
    );
  }

  const kpis: Kpi[] = [
    { label: 'Calendars', value: calendars.length, sub: calendars.map((c) => c.name).slice(0, 2).join(', ') || 'none yet', tone: 'accent' },
    {
      label: 'Weekend Pattern',
      value: calendars[0] ? calendars[0].weekends.length : '—',
      sub: calendars[0] ? `days off in ${calendars[0].name}` : 'add a calendar',
      tone: 'info',
    },
    {
      label: 'Standard Hours',
      value: calendars[0]?.standardHoursPerDay ?? '—',
      sub: 'per working day',
    },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Business Calendar"
        glyph="🗓"
        backToHub
        subtitle="Working days, public holidays, and reduced-hour periods. HR timesheets and project schedules count working days through these calendars."
        kpis={kpis}
      />
      <CalendarAdminClient initialCalendars={calendars} />
    </div>
  );
}
