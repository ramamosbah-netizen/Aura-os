'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmptyState from './ui/empty-state';

interface ScheduleTask {
  name: string; plannedStart: string; plannedEnd: string;
  baselineStart: string | null; baselineEnd: string | null;
  actualStart: string | null; actualEnd: string | null; percentComplete: number;
}
interface ProjectSchedule {
  id: string; projectId: string; projectName: string | null; tasks: ScheduleTask[]; baselineSetAt: string | null;
}
interface Project { id: string; title: string }

const DAY = 86_400_000;
const d = (s: string) => Date.parse(s);
const days = (a: string, b: string) => Math.round((d(b) - d(a)) / DAY);

function span(tasks: ScheduleTask[]): { min: number; total: number } {
  if (tasks.length === 0) return { min: Date.now(), total: 1 };
  const starts = tasks.flatMap((t) => [d(t.plannedStart), t.baselineStart ? d(t.baselineStart) : d(t.plannedStart)]);
  const ends = tasks.flatMap((t) => [d(t.plannedEnd), t.baselineEnd ? d(t.baselineEnd) : d(t.plannedEnd)]);
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  return { min, total: Math.max(1, (max - min) / DAY + 1) };
}

interface NewTask { name: string; plannedStart: string; plannedEnd: string; percentComplete: string }
const emptyTask = (): NewTask => ({ name: '', plannedStart: '', plannedEnd: '', percentComplete: '0' });

export default function GanttClient({ schedules, projects = [] }: { schedules: ProjectSchedule[]; projects?: Project[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addTask, setAddTask] = useState<Record<string, NewTask>>({});
  const [newProjectId, setNewProjectId] = useState('');
  const [newTask, setNewTask] = useState<NewTask>(emptyTask());

  const scheduledProjectIds = new Set(schedules.map((s) => s.projectId));
  const unscheduled = projects.filter((p) => !scheduledProjectIds.has(p.id));

  function toTask(nt: NewTask): ScheduleTask | null {
    if (!nt.name.trim() || !nt.plannedStart || !nt.plannedEnd) return null;
    return {
      name: nt.name.trim(), plannedStart: nt.plannedStart, plannedEnd: nt.plannedEnd,
      baselineStart: null, baselineEnd: null, actualStart: null, actualEnd: null,
      percentComplete: Math.min(100, Math.max(0, Number(nt.percentComplete) || 0)),
    };
  }

  async function saveSchedule(projectId: string, projectName: string | null, tasks: ScheduleTask[]) {
    setBusy(projectId); setError(null);
    try {
      const res = await fetch('/api/projects/schedules', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, projectName, tasks }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.message || e?.error || 'Failed'); }
      router.refresh();
    } catch (e: any) { setError(e.message || 'Failed to save schedule'); } finally { setBusy(null); }
  }

  async function setBaseline(projectId: string) {
    setBusy(projectId); setError(null);
    try {
      const res = await fetch(`/api/projects/schedules/${projectId}/baseline`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e: any) { setError(e.message || 'Failed to set baseline'); } finally { setBusy(null); }
  }

  async function handleAddTask(sch: ProjectSchedule) {
    const t = toTask(addTask[sch.projectId] ?? emptyTask());
    if (!t) { setError('Task needs a name and planned start/end dates.'); return; }
    await saveSchedule(sch.projectId, sch.projectName, [...sch.tasks, t]);
    setAddTask({ ...addTask, [sch.projectId]: emptyTask() });
  }

  async function handleStartSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectId) { setError('Pick a project.'); return; }
    const t = toTask(newTask);
    if (!t) { setError('First task needs a name and planned start/end dates.'); return; }
    const proj = projects.find((p) => p.id === newProjectId);
    await saveSchedule(newProjectId, proj?.title ?? null, [t]);
    setNewTask(emptyTask()); setNewProjectId('');
  }

  const upd = (pid: string, patch: Partial<NewTask>) =>
    setAddTask((m) => ({ ...m, [pid]: { ...(m[pid] ?? emptyTask()), ...patch } }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {error && <div style={s.error}>{error}</div>}

      {/* Start a schedule for a project that has none */}
      {unscheduled.length > 0 && (
        <form onSubmit={handleStartSchedule} style={s.startCard}>
          <strong style={{ fontSize: 14 }}>Start a schedule</strong>
          <div style={s.formRow}>
            <select value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)} style={s.input}>
              <option value="">Select a project…</option>
              {unscheduled.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <input placeholder="First task" value={newTask.name} onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} style={s.input} />
            <input type="date" value={newTask.plannedStart} onChange={(e) => setNewTask({ ...newTask, plannedStart: e.target.value })} style={s.input} />
            <input type="date" value={newTask.plannedEnd} onChange={(e) => setNewTask({ ...newTask, plannedEnd: e.target.value })} style={s.input} />
            <button type="submit" style={s.btnPrimary} disabled={busy === newProjectId}>Create</button>
          </div>
        </form>
      )}

      {schedules.length === 0 && unscheduled.length === 0 && (
        <EmptyState title="No schedules yet" description="Create a project first; then start a schedule here and add tasks to build the Gantt." />
      )}

      {schedules.map((sch) => {
        const { min, total } = span(sch.tasks);
        const pct = (iso: string) => ((d(iso) - min) / DAY / total) * 100;
        const wid = (a: string, b: string) => ((days(a, b) + 1) / total) * 100;
        const nt = addTask[sch.projectId] ?? emptyTask();
        return (
          <section key={sch.id} style={s.card}>
            <div style={s.head}>
              <strong>{sch.projectName ?? sch.projectId}</strong>
              <span style={s.meta}>{sch.tasks.length} tasks · {sch.baselineSetAt ? 'baseline set' : 'no baseline'}</span>
              <div style={{ flex: 1 }} />
              <button type="button" style={s.btn} disabled={busy === sch.projectId || sch.tasks.length === 0} onClick={() => setBaseline(sch.projectId)}>
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
              {sch.tasks.length === 0 && <p style={s.meta}>No tasks yet — add one below.</p>}
            </div>

            {/* Add task */}
            <div style={s.addRow}>
              <input placeholder="Task name" value={nt.name} onChange={(e) => upd(sch.projectId, { name: e.target.value })} style={{ ...s.input, flex: 2 }} />
              <input type="date" value={nt.plannedStart} onChange={(e) => upd(sch.projectId, { plannedStart: e.target.value })} style={s.input} />
              <input type="date" value={nt.plannedEnd} onChange={(e) => upd(sch.projectId, { plannedEnd: e.target.value })} style={s.input} />
              <input type="number" min={0} max={100} value={nt.percentComplete} onChange={(e) => upd(sch.projectId, { percentComplete: e.target.value })} style={{ ...s.input, width: 64 }} title="% complete" />
              <button type="button" style={s.btn} disabled={busy === sch.projectId} onClick={() => handleAddTask(sch)}>+ Add task</button>
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
  error: { background: 'var(--bad-soft)', color: 'var(--bad)', border: '1px solid var(--bad)', borderRadius: 10, padding: '9px 13px', fontSize: 13.5 } as CSSProperties,
  startCard: { background: 'var(--panel)', border: '1px dashed var(--border)', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  formRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' } as CSSProperties,
  head: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 15 } as CSSProperties,
  meta: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  btn: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '5px 11px', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  btnPrimary: { background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: 'var(--accent-ink)', padding: '6px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  rows: { display: 'flex', flexDirection: 'column', gap: 7 } as CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 10 } as CSSProperties,
  label: { width: 150, minWidth: 150, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--muted)' } as CSSProperties,
  track: { position: 'relative', flex: 1, height: 22, background: 'var(--panel-2)', borderRadius: 5 } as CSSProperties,
  baseline: { position: 'absolute', top: 17, height: 3, background: 'var(--border)', borderRadius: 2 } as CSSProperties,
  bar: { position: 'absolute', top: 2, height: 15, background: 'rgba(255,193,7,0.25)', border: '1px solid var(--accent)', borderRadius: 4, overflow: 'hidden' } as CSSProperties,
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, background: 'var(--good)', opacity: 0.5 } as CSSProperties,
  barlbl: { position: 'absolute', right: 4, top: 0, fontSize: 10, lineHeight: '15px', color: 'var(--text)' } as CSSProperties,
  addRow: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap' } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 9px', fontSize: 12.5, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  legend: { display: 'flex', gap: 16, marginTop: 12, fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  swatch: { display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 5, verticalAlign: 'middle' } as CSSProperties,
};
