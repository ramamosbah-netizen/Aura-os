'use client';

import { useState } from 'react';
import { CalendarPlus, Layers3, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import EmptyState from './ui/empty-state';
import styles from './gantt-client.module.css';

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

export default function GanttClient({ schedules, projects = [], selectedProjectId }: { schedules: ProjectSchedule[]; projects?: Project[]; selectedProjectId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addTask, setAddTask] = useState<Record<string, NewTask>>({});
  const [newProjectId, setNewProjectId] = useState(selectedProjectId ?? '');
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

  async function handleRemoveTask(sch: ProjectSchedule, taskIndex: number) {
    setBusy(sch.projectId); setError(null);
    try {
      const newTasks = sch.tasks.filter((_, idx) => idx !== taskIndex);
      await saveSchedule(sch.projectId, sch.projectName, newTasks);
    } catch (e: any) {
      setError(e.message || 'Failed to remove task');
    }
  }

  async function handleUpdateTaskPercent(sch: ProjectSchedule, taskIndex: number, newPct: number) {
    setBusy(sch.projectId); setError(null);
    try {
      const newTasks = sch.tasks.map((t, idx) => (idx === taskIndex ? { ...t, percentComplete: newPct } : t));
      await saveSchedule(sch.projectId, sch.projectName, newTasks);
    } catch (e: any) {
      setError(e.message || 'Failed to update task percentage');
    }
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
    <div className={styles.ganttStack}>
      {error && <div className={styles.error} role="alert">{error}</div>}

      {/* Start a schedule for a project that has none */}
      {unscheduled.length > 0 && (
        <form onSubmit={handleStartSchedule} className={styles.startCard}>
          <strong className={styles.startTitle}><CalendarPlus size={16} /> Start a schedule</strong>
          <div className={styles.formRow}>
            <select value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)} className={styles.input}>
              <option value="">Select a project…</option>
              {unscheduled.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <input placeholder="First task" value={newTask.name} onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} className={styles.input} />
            <input type="date" value={newTask.plannedStart} onChange={(e) => setNewTask({ ...newTask, plannedStart: e.target.value })} className={styles.input} />
            <input type="date" value={newTask.plannedEnd} onChange={(e) => setNewTask({ ...newTask, plannedEnd: e.target.value })} className={styles.input} />
            <button type="submit" className={styles.btnPrimary} disabled={busy === newProjectId}>Create</button>
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
          <section key={sch.id} className={styles.card}>
            <div className={styles.head}>
              <span className={styles.projectMark}><Layers3 size={15} /></span>
              <div className={styles.headMain}><strong>{sch.projectName ?? sch.projectId}</strong><span className={styles.meta}>{sch.tasks.length} {sch.tasks.length === 1 ? 'activity' : 'activities'}</span></div>
              <span className={`${styles.statusChip} ${sch.baselineSetAt ? styles.ready : ''}`}>{sch.baselineSetAt ? 'Baseline locked' : 'Draft plan'}</span>
              <div style={{ flex: 1 }} />
              <button type="button" className={styles.btn} disabled={busy === sch.projectId || sch.tasks.length === 0} onClick={() => setBaseline(sch.projectId)}>
                {busy === sch.projectId ? '…' : 'Set baseline'}
              </button>
            </div>
            <div className={styles.timeline} aria-hidden="true"><span /> <div className={styles.timelineScale}><span>{new Date(min).toLocaleDateString('en-AE', { day: '2-digit', month: 'short' })}</span><span>Today</span><span>{new Date(min + total * 86_400_000).toLocaleDateString('en-AE', { day: '2-digit', month: 'short' })}</span></div><span /><span /></div>
            <div className={styles.rows}>
              {sch.tasks.map((t, idx) => (
                <div key={`${t.name}-${idx}`} className={styles.row}>
                  <div className={styles.label} title={t.name}>{t.name}</div>
                  <div className={styles.track} aria-label={`${t.name}, ${t.percentComplete}% complete`}>
                    {t.baselineStart && t.baselineEnd && (
                      <div className={styles.baseline} style={{ left: `${pct(t.baselineStart)}%`, width: `${wid(t.baselineStart, t.baselineEnd)}%` }} />
                    )}
                    <div className={styles.bar} style={{ left: `${pct(t.plannedStart)}%`, width: `${wid(t.plannedStart, t.plannedEnd)}%` }}>
                      <div className={styles.fill} style={{ width: `${t.percentComplete}%` }} />
                      <span className={styles.barLabel}>{t.percentComplete}%</span>
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={t.percentComplete}
                    onChange={(e) => handleUpdateTaskPercent(sch, idx, Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                    className={styles.input}
                    style={{ width: 50, padding: '2px 4px', fontSize: 11 }}
                    title="Quick update %"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveTask(sch, idx)}
                    className={styles.removeButton}
                    title="Remove task"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {sch.tasks.length === 0 && <p className={styles.meta}>No tasks yet — add one below.</p>}
            </div>

            {/* Add task */}
            <div className={styles.addRow}>
              <input placeholder="Task name" value={nt.name} onChange={(e) => upd(sch.projectId, { name: e.target.value })} className={styles.input} style={{ flex: 2 }} />
              <input type="date" value={nt.plannedStart} onChange={(e) => upd(sch.projectId, { plannedStart: e.target.value })} className={styles.input} />
              <input type="date" value={nt.plannedEnd} onChange={(e) => upd(sch.projectId, { plannedEnd: e.target.value })} className={styles.input} />
              <input type="number" min={0} max={100} value={nt.percentComplete} onChange={(e) => upd(sch.projectId, { percentComplete: e.target.value })} className={styles.input} style={{ width: 64 }} title="% complete" />
              <button type="button" className={styles.btn} disabled={busy === sch.projectId} onClick={() => handleAddTask(sch)}>+ Add task</button>
            </div>

            <div className={styles.legend}><span><i className={styles.swatch} style={{ background: 'var(--accent)' }} /> planned</span><span><i className={styles.swatch} style={{ background: 'var(--good)' }} /> % complete</span><span><i className={styles.swatch} style={{ background: 'var(--border)' }} /> baseline</span></div>
          </section>
        );
      })}
    </div>
  );
}
