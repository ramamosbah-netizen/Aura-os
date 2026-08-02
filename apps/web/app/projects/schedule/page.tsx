import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import GanttClient from '../../../components/gantt-client';

export const dynamic = 'force-dynamic';

interface ScheduleTask {
  name: string; plannedStart: string; plannedEnd: string;
  baselineStart: string | null; baselineEnd: string | null;
  actualStart: string | null; actualEnd: string | null; percentComplete: number;
}
interface ProjectSchedule {
  id: string; projectId: string; projectName: string | null; tasks: ScheduleTask[]; baselineSetAt: string | null;
}
interface Project { id: string; title: string }

export default async function SchedulePage() {
  const [schedules, projects] = await Promise.all([
    getJson<ProjectSchedule[]>('/api/projects/schedules'),
    getJson<Project[]>('/api/projects/projects'),
  ]);
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Projects · Schedule (Gantt)</h1>
      <p style={st.sub}>
        Planned vs baseline vs actual per task, with duration-weighted % complete and finish
        variance. Add tasks, then set a baseline to freeze the plan and track slippage.
      </p>
      {schedules === null ? (
        <p style={st.muted}>API offline.</p>
      ) : (
        <GanttClient schedules={schedules} projects={projects ?? []} />
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 700, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
