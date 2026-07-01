'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ScheduleTask {
  name: string; plannedStart: string; plannedEnd: string;
  baselineStart: string | null; baselineEnd: string | null;
  actualStart: string | null; actualEnd: string | null; percentComplete: number;
}
interface ProjectSchedule {
  id: string; projectId: string; projectName: string | null; tasks: ScheduleTask[]; baselineSetAt: string | null;
}

const DAY = 86_400_000;
const d = (s: string) => Date.parse(s);
const days = (a: string, b: string) => Math.round((d(b) - d(a)) / DAY);

function span(tasks: ScheduleTask[]): { min: number; total: number } {
  const starts = tasks.flatMap((t) => [d(t.plannedStart), t.baselineStart ? d(t.baselineStart) : d(t.plannedStart)]);
  const ends = tasks.flatMap((t) => [d(t.plannedEnd), t.baselineEnd ? d(t.baselineEnd) : d(t.plannedEnd)]);
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  return { min, total: Math.max(1, (max - min) / DAY + 1) };
}

export default function GanttClient({ schedules }: { schedules: ProjectSchedule[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function setBaseline(projectId: string) {
    setBusy(projectId);
    try {
      await fetch(`/api/projects/schedules/${projectId}/baseline`, { method: 'POST' });
      router.refresh();
    } finally { setBusy(null); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {schedules.map((sch) => {
        const { min, total } = span(sch.tasks);
        const pct = (iso: string) => ((d(iso) - min) / DAY / total) * 100;
        const wid = (a: string, b: string) => ((days(a, b) + 1) / total) * 100;
        return (
          <section key={sch.id} style={s.card}>
            <div style={s.head}>
              <strong>{sch.projectName ?? sch.projectId}</strong>
              <span style={s.meta}>{sch.tasks.length} tasks · {sch.baselineSetAt ? 'baseline set' : 'no baseline'}</span>
              <div style={{ flex: 1 }} />
              <button type="button" style={s.btn} disabled={busy === sch.projectId} onClick={() => setBaseline(sch.projectId)}>
                {busy === sch.projectId ? '…' : 'Set baseline'}
              </button>
            </div>
            <div style={s.rows}>
              {sch.tasks.map((t) => (
                <div key={t.name} style={s.row}>
                  <div style={s.label} title={t.name}>{t.name}</div>
                  <div style={s.track}>
                    {t.baselineStart && t.baselineEnd && (
                      <div style={{ ...s.baseline, left: `${pct(t.baselineStart)}%`, width: `${wid(t.baselineStart, t.baselineEnd)}%` }} />
                    )}
                    <div style={{ ...s.bar, left: `${pct(t.plannedStart)}%`, width: `${wid(t.plannedStart, t.plannedEnd)}%` }}>
                      <div style={{ ...s.fill, width: `${t.percentComplete}%` }} />
                      <span style={s.barlbl}>{t.percentComplete}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={s.legend}>
              <span><i style={{ ...s.swatch, background: 'var(--accent)' }} /> planned</span>
              <span><i style={{ ...s.swatch, background: 'var(--good)' }} /> % complete</span>
              <span><i style={{ ...s.swatch, background: 'var(--border)' }} /> baseline</span>
            </div>
          </section>
        );
      })}
    </div>
  );
}

const s = {
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' } as CSSProperties,
  head: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 15 } as CSSProperties,
  meta: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  btn: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '5px 11px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  rows: { display: 'flex', flexDirection: 'column', gap: 7 } as CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 10 } as CSSProperties,
  label: { width: 150, minWidth: 150, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--muted)' } as CSSProperties,
  track: { position: 'relative', flex: 1, height: 22, background: 'var(--panel-2)', borderRadius: 5 } as CSSProperties,
  baseline: { position: 'absolute', top: 17, height: 3, background: 'var(--border)', borderRadius: 2 } as CSSProperties,
  bar: { position: 'absolute', top: 2, height: 15, background: 'rgba(255,193,7,0.25)', border: '1px solid var(--accent)', borderRadius: 4, overflow: 'hidden' } as CSSProperties,
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, background: 'var(--good)', opacity: 0.5 } as CSSProperties,
  barlbl: { position: 'absolute', right: 4, top: 0, fontSize: 10, lineHeight: '15px', color: 'var(--text)' } as CSSProperties,
  legend: { display: 'flex', gap: 16, marginTop: 10, fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  swatch: { display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 5, verticalAlign: 'middle' } as CSSProperties,
};
