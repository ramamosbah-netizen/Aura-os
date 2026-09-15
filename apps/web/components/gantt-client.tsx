'use client';

import { labourSummary, outputSummary, soldAndInstalled, type PlannedOutput } from '@/lib/planned-output';
import { Fragment, useState } from 'react';
import { CalendarPlus, Layers3, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import EmptyState from './ui/empty-state';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import styles from './gantt-client.module.css';

interface ScheduleTask {
  /**
   * Stable task identity. Round-tripped on every save — that is what tells the server this is an
   * EDIT rather than a replacement, and what keeps each task's baseline attached to it through a
   * rename. Omitting it would silently mint new tasks and drop their baselines.
   */
  id?: string;
  wbsNodeId: string | null;
  name: string; plannedStart: string; plannedEnd: string;
  baselineStart: string | null; baselineEnd: string | null;
  actualStart: string | null; actualEnd: string | null; percentComplete: number;
  durationWorkingDays: number | null;
  requirements: Array<{
    id?: string;
    resource: { resourceType: 'employee' | 'vehicle' | 'asset' | 'pool'; canonicalResourceId: string };
    quantity: number;
    unit: 'hours' | 'persons' | 'crews' | 'units';
  }>;
}
interface ProjectSchedule {
  id: string; projectId: string; projectName: string | null; tasks: ScheduleTask[]; baselineSetAt: string | null;
  /**
   * Where each activity's progress came from, keyed by activity id — DERIVED by the server on
   * every read, never stored on the activity. `declared` is a typed number with nothing measured
   * behind it; `evidence` is the work package's measured progress; `override` is somebody stating
   * a figure against that measurement, with a reason.
   */
  progress?: Record<string, {
    effective: number | null;
    source: 'evidence' | 'override' | 'declared';
    evidence: number | null;
    override: { value: number; reason: string; at: string; by: string | null } | null;
  }>;
  /**
   * What that progress is measured AGAINST, keyed by activity id — also derived on every read:
   * the quantity the award line sold, the rate it was priced at, and the pace the work is going
   * at over this activity's own window. UNKNOWN wherever one of those was never stated.
   */
  output?: Record<string, PlannedOutput>;
}
interface Project { id: string; title: string }
interface WbsNode { id: string; projectId: string; code: string; title: string; parentId: string | null }
interface ResourceCatalogItem {
  resourceType: 'employee' | 'vehicle' | 'asset' | 'pool';
  canonicalResourceId: string;
  label: string;
  secondary: string | null;
  status: string;
  unit: RequirementDraft['unit'] | null;
}

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

interface RequirementDraft { id?: string; resourceKey: string; quantity: string; unit: 'hours' | 'persons' | 'crews' | 'units' }
interface NewTask { name: string; plannedStart: string; plannedEnd: string; percentComplete: string; durationWorkingDays: string; wbsNodeId: string; requirements: RequirementDraft[] }
const emptyRequirement = (): RequirementDraft => ({ resourceKey: '', quantity: '1', unit: 'persons' });
const emptyTask = (): NewTask => ({ name: '', plannedStart: '', plannedEnd: '', percentComplete: '0', durationWorkingDays: '', wbsNodeId: '', requirements: [] });

export default function GanttClient({ schedules, projects = [], wbsNodes = [], resourceCatalog = [], selectedProjectId }: { schedules: ProjectSchedule[]; projects?: Project[]; wbsNodes?: WbsNode[]; resourceCatalog?: ResourceCatalogItem[]; selectedProjectId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<Record<string, { value: string; reason: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [addTask, setAddTask] = useState<Record<string, NewTask>>({});
  const [editTask, setEditTask] = useState<Record<string, NewTask>>({});
  const [newProjectId, setNewProjectId] = useState(selectedProjectId ?? '');
  const [newTask, setNewTask] = useState<NewTask>(emptyTask());

  const scheduledProjectIds = new Set(schedules.map((s) => s.projectId));
  const unscheduled = projects.filter((p) => !scheduledProjectIds.has(p.id));

  function toTask(nt: NewTask, existing?: ScheduleTask): ScheduleTask | null {
    const duration = Number(nt.durationWorkingDays);
    if (!nt.name.trim() || !nt.plannedStart || !nt.plannedEnd || !nt.wbsNodeId || !Number.isInteger(duration) || duration < 1) return null;
    if (nt.requirements.some((item) => !item.resourceKey || !(Number(item.quantity) > 0))) return null;
    return {
      // No id: this task does not exist yet, and the server mints one.
      id: existing?.id,
      wbsNodeId: nt.wbsNodeId,
      name: nt.name.trim(), plannedStart: nt.plannedStart, plannedEnd: nt.plannedEnd,
      baselineStart: existing?.baselineStart ?? null, baselineEnd: existing?.baselineEnd ?? null,
      actualStart: existing?.actualStart ?? null, actualEnd: existing?.actualEnd ?? null,
      percentComplete: Math.min(100, Math.max(0, Number(nt.percentComplete) || 0)),
      durationWorkingDays: duration,
      requirements: nt.requirements.map((item) => {
        const [resourceType, canonicalResourceId] = item.resourceKey.split(':', 2) as ['employee' | 'vehicle' | 'asset', string];
        return { id: item.id, resource: { resourceType, canonicalResourceId }, quantity: Number(item.quantity), unit: item.unit };
      }),
    };
  }

  const taskDraft = (task: ScheduleTask): NewTask => ({
    name: task.name,
    plannedStart: task.plannedStart,
    plannedEnd: task.plannedEnd,
    percentComplete: String(task.percentComplete),
    durationWorkingDays: task.durationWorkingDays ? String(task.durationWorkingDays) : '',
    wbsNodeId: task.wbsNodeId ?? '',
    requirements: (task.requirements ?? []).map((requirement) => ({
      id: requirement.id,
      resourceKey: `${requirement.resource.resourceType}:${requirement.resource.canonicalResourceId}`,
      quantity: String(requirement.quantity),
      unit: requirement.unit,
    })),
  });

  const catalogLabel = (resourceType: string, id: string): string => {
    const item = resourceCatalog.find((candidate) => candidate.resourceType === resourceType && candidate.canonicalResourceId === id);
    return item ? `${item.label}${item.secondary ? ` · ${item.secondary}` : ''}` : 'Canonical resource unavailable';
  };

  const requirementsEditor = (task: NewTask, setTask: (next: NewTask) => void, label: string) => (
    <div className={styles.resourceEditor} aria-label={label}>
      <div className={styles.resourceEditorHead}>
        <span>People &amp; equipment needed</span>
        <button type="button" className={styles.resourceAdd} onClick={() => setTask({ ...task, requirements: [...task.requirements, emptyRequirement()] })}>
          <Plus size={13} /> Add resource
        </button>
      </div>
      {task.requirements.length === 0 ? <small>No resource demand recorded yet.</small> : task.requirements.map((requirement, index) => (
        <div
          className={styles.resourceRow}
          key={requirement.id ?? `${requirement.resourceKey || 'new'}-${index}`}
          data-resource-key={requirement.resourceKey || undefined}
        >
          <select
            className={styles.input}
            aria-label={`Resource ${index + 1}`}
            value={requirement.resourceKey}
            onChange={(event) => {
              const selected = resourceCatalog.find((item) => `${item.resourceType}:${item.canonicalResourceId}` === event.target.value);
              setTask({ ...task, requirements: task.requirements.map((item, i) => i === index ? { ...item, resourceKey: event.target.value, unit: selected?.unit ?? (event.target.value.startsWith('employee:') ? 'persons' : 'units') } : item) });
            }}
          >
            <option value="">Select employee or equipment…</option>
            {(['employee', 'pool', 'vehicle', 'asset'] as const).map((type) => (
              <optgroup key={type} label={type === 'employee' ? 'Employees' : type === 'pool' ? 'Teams & resource pools' : type === 'vehicle' ? 'Vehicles' : 'Equipment & assets'}>
                {resourceCatalog.filter((item) => item.resourceType === type).map((item) => (
                  <option key={`${type}:${item.canonicalResourceId}`} value={`${type}:${item.canonicalResourceId}`}>
                    {item.label}{item.secondary ? ` · ${item.secondary}` : ''}{item.status !== 'active' ? ` (${item.status})` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <input className={styles.input} aria-label={`Resource quantity ${index + 1}`} type="number" min="0.01" step="0.01" value={requirement.quantity} onChange={(event) => setTask({ ...task, requirements: task.requirements.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item) })} />
          <select className={styles.input} aria-label={`Resource unit ${index + 1}`} value={requirement.unit} onChange={(event) => setTask({ ...task, requirements: task.requirements.map((item, i) => i === index ? { ...item, unit: event.target.value as RequirementDraft['unit'] } : item) })}>
            <option value="persons">people</option><option value="crews">crews</option><option value="hours">hours</option><option value="units">units</option>
          </select>
          <button type="button" className={styles.removeButton} aria-label={`Remove resource ${index + 1}`} onClick={() => setTask({ ...task, requirements: task.requirements.filter((_, i) => i !== index) })}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );

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

  /**
   * Record a DECLARED figure — only where nothing has been measured.
   *
   * Where the activity's work package is measured, this path is not offered at all: the plan does
   * not get to quietly overwrite the Quantity Ledger, and the governed statement below is the way
   * to say something different.
   */
  async function handleUpdateTaskPercent(sch: ProjectSchedule, taskIndex: number, newPct: number) {
    setBusy(sch.projectId); setError(null);
    try {
      const newTasks = sch.tasks.map((t, idx) => (idx === taskIndex ? { ...t, percentComplete: newPct } : t));
      await saveSchedule(sch.projectId, sch.projectName, newTasks);
    } catch (e: any) {
      setError(e.message || 'Failed to update task percentage');
    }
  }

  /** State a figure against the measurement, or withdraw the statement by passing null. */
  async function handleOverrideProgress(sch: ProjectSchedule, taskId: string, value: number | null, reason: string) {
    setBusy(sch.projectId); setError(null);
    try {
      const response = await fetch(`/api/projects/schedules/${sch.projectId}/activities/${taskId}/progress`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value, reason }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || result?.error || 'Failed to state progress');
      setOverrideDraft((current) => ({ ...current, [taskId]: { value: '', reason: '' } }));
      router.refresh();
    } catch (e: any) {
      setError(e.message || 'Failed to state progress');
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveTask(sch: ProjectSchedule, taskIndex: number) {
    const original = sch.tasks[taskIndex];
    if (!original.id) return;
    const next = toTask(editTask[original.id], original);
    if (!next) { setError('Activity needs a name, dates, working-day duration and complete resource lines.'); return; }
    await saveSchedule(sch.projectId, sch.projectName, sch.tasks.map((task, index) => index === taskIndex ? next : task));
    setEditTask((current) => { const copy = { ...current }; delete copy[original.id!]; return copy; });
  }

  async function handleAddTask(sch: ProjectSchedule) {
    const t = toTask(addTask[sch.projectId] ?? emptyTask());
    if (!t) { setError('Task needs a WBS package, name, dates, working-day duration and complete resource lines.'); return; }
    await saveSchedule(sch.projectId, sch.projectName, [...sch.tasks, t]);
    setAddTask({ ...addTask, [sch.projectId]: emptyTask() });
  }

  async function handleStartSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectId) { setError('Pick a project.'); return; }
    const t = toTask(newTask);
    if (!t) { setError('First task needs a WBS package, name, dates, working-day duration and complete resource lines.'); return; }
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
        <form onSubmit={handleStartSchedule} className={styles.startCard} data-testid="start-schedule-form">
          <strong className={styles.startTitle}><CalendarPlus size={16} /> Start a schedule</strong>
          <div className={styles.formRow}>
            <select value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)} className={styles.input}>
              <option value="">Select a project…</option>
              {unscheduled.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <select value={newTask.wbsNodeId} onChange={(e) => setNewTask({ ...newTask, wbsNodeId: e.target.value })} className={styles.input} disabled={!newProjectId} aria-label="WBS work package">
              <option value="">Select WBS package…</option>
              {wbsNodes.filter((node) => node.projectId === newProjectId).map((node) => <option key={node.id} value={node.id}>{node.code} · {node.title}</option>)}
            </select>
            <input placeholder="First task" value={newTask.name} onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} className={styles.input} />
            <input type="date" value={newTask.plannedStart} onChange={(e) => setNewTask({ ...newTask, plannedStart: e.target.value })} className={styles.input} />
            <input type="date" value={newTask.plannedEnd} onChange={(e) => setNewTask({ ...newTask, plannedEnd: e.target.value })} className={styles.input} />
            <input aria-label="Working-day duration" type="number" min={1} step={1} placeholder="Working days" value={newTask.durationWorkingDays} onChange={(e) => setNewTask({ ...newTask, durationWorkingDays: e.target.value })} className={styles.input} />
            <button type="submit" className={styles.btnPrimary} disabled={busy === newProjectId}>Create</button>
          </div>
          {requirementsEditor(newTask, setNewTask, 'Resource needs for first activity')}
        </form>
      )}

      {schedules.length === 0 && (
        <section className={styles.emptyChart} aria-label="Gantt chart awaiting activities">
          <div className={styles.emptyChartHead}>
            <div><strong>Gantt timeline</strong><span>Awaiting first dated activity</span></div>
            <span className={styles.emptyChartBadge}>Not established</span>
          </div>
          <div className={styles.emptyChartAxis} aria-hidden="true"><span>Start</span><i /><span>Today</span><i /><span>Target</span></div>
          <p>Add a task with planned start and finish dates to populate the chart. No schedule bars are shown until canonical planning evidence exists.</p>
        </section>
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
            <div className={styles.timeline} aria-hidden="true"><span /> <div className={styles.timelineScale}><span>{new Date(min).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, day: '2-digit', month: 'short' })}</span><span>Today</span><span>{new Date(min + total * 86_400_000).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, day: '2-digit', month: 'short' })}</span></div><span /><span /></div>
            <div className={styles.rows}>
              {sch.tasks.map((t, idx) => (
                <Fragment key={t.id ?? `${t.name}-${idx}`}>
                <div className={styles.row}>
                  <div className={styles.label} title={t.name}>
                    {t.name}
                    <small>{t.wbsNodeId ? (() => { const node = wbsNodes.find((item) => item.id === t.wbsNodeId); return node ? `${node.code} · ${node.title}` : 'WBS record unavailable'; })() : 'Legacy activity · WBS not linked'}</small>
                    <small>{t.durationWorkingDays ? `${t.durationWorkingDays} working day${t.durationWorkingDays === 1 ? '' : 's'}` : 'Working duration not authored'}</small>
                    {(t.requirements ?? []).map((requirement) => <small key={`${requirement.resource.resourceType}:${requirement.resource.canonicalResourceId}`}>{requirement.quantity} {requirement.unit} · {catalogLabel(requirement.resource.resourceType, requirement.resource.canonicalResourceId)}</small>)}
                    {(() => {
                      const taskId = t.id;
                      const progress = taskId ? sch.progress?.[taskId] : undefined;
                      if (!taskId || !progress) return null;
                      // Said plainly, because "45%" means three different things depending on this.
                      if (progress.source === 'evidence') return <small data-testid={`progress-source-${taskId}`}>Measured from installed quantity · {progress.evidence}%</small>;
                      if (progress.source === 'override') return <small data-testid={`progress-source-${taskId}`}>Stated {progress.override?.value}% against a measured {progress.evidence}% · {progress.override?.reason}</small>;
                      return <small data-testid={`progress-source-${taskId}`}>Declared · nothing measured against this activity</small>;
                    })()}
                    {(() => {
                      const taskId = t.id;
                      if (!taskId) return null;
                      const output = sch.output?.[taskId] ?? null;
                      const sold = soldAndInstalled(output);
                      const summary = outputSummary(output);
                      // The cost half, said separately: a crew can be behind the programme and
                      // perfectly efficient, or ahead of it and ruinous. One line cannot carry both.
                      const labour = labourSummary(output);
                      // "75%" is a fraction of something. These two lines are the something: what
                      // was sold, and the rate the company priced itself to install it at.
                      return (
                        <>
                          {sold && <small data-testid={`output-sold-${taskId}`}>{sold}</small>}
                          {summary && (
                            <small
                              data-testid={`output-rate-${taskId}`}
                              className={summary.tone === 'BEHIND' ? styles.behind : undefined}
                            >{summary.text}</small>
                          )}
                          {labour && (
                            <small
                              data-testid={`output-labour-${taskId}`}
                              className={labour.tone === 'WORSE_THAN_PRICED' ? styles.behind : undefined}
                            >{labour.text}</small>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className={styles.track} aria-label={`${t.name}, ${(t.id && sch.progress?.[t.id]?.effective) ?? t.percentComplete}% complete`}>
                    {t.baselineStart && t.baselineEnd && (
                      <div className={styles.baseline} style={{ left: `${pct(t.baselineStart)}%`, width: `${wid(t.baselineStart, t.baselineEnd)}%` }} />
                    )}
                    <div className={styles.bar} style={{ left: `${pct(t.plannedStart)}%`, width: `${wid(t.plannedStart, t.plannedEnd)}%` }}>
                      <div className={styles.fill} style={{ width: `${(t.id && sch.progress?.[t.id]?.effective) ?? t.percentComplete}%` }} />
                      <span className={styles.barLabel}>{(t.id && sch.progress?.[t.id]?.effective) ?? t.percentComplete}%</span>
                    </div>
                  </div>
                  {(() => {
                    const taskId = t.id;
                    const progress = taskId ? sch.progress?.[taskId] : undefined;
                    // Where nothing has been measured, the plain box stays exactly as it was: that
                    // number is a declaration and always has been. Where something HAS been
                    // measured, the plan does not get to overwrite it — stating something different
                    // costs a reason and is recorded against a name.
                    if (!taskId || !progress || progress.source === 'declared') {
                      return (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={t.percentComplete}
                          onChange={(e) => handleUpdateTaskPercent(sch, idx, Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                          className={styles.input}
                          style={{ width: 50, padding: '2px 4px', fontSize: 11 }}
                          title="Declared progress — nothing measured against this activity"
                        />
                      );
                    }
                    const draft = overrideDraft[taskId] ?? { value: '', reason: '' };
                    return (
                      <div className={styles.progressStatement} data-testid={`progress-statement-${taskId}`}>
                        <input
                          type="number" min={0} max={100}
                          aria-label={`Stated progress for ${t.name}`}
                          value={draft.value}
                          placeholder={String(progress.evidence ?? '')}
                          onChange={(e) => setOverrideDraft((current) => ({ ...current, [taskId]: { value: e.target.value, reason: current[taskId]?.reason ?? '' } }))}
                        />
                        <input
                          aria-label={`Reason for stated progress for ${t.name}`}
                          value={draft.reason}
                          placeholder="Why this differs from the measurement"
                          onChange={(e) => setOverrideDraft((current) => ({ ...current, [taskId]: { value: current[taskId]?.value ?? '', reason: e.target.value } }))}
                        />
                        <button
                          type="button"
                          disabled={busy === sch.projectId}
                          onClick={() => handleOverrideProgress(sch, taskId, Number(draft.value), draft.reason)}
                        >State</button>
                        {progress.source === 'override' && (
                          <button
                            type="button"
                            disabled={busy === sch.projectId}
                            aria-label={`Withdraw stated progress for ${t.name}`}
                            onClick={() => handleOverrideProgress(sch, taskId, null, '')}
                          >Use the measurement</button>
                        )}
                      </div>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => t.id && setEditTask((current) => ({ ...current, [t.id!]: taskDraft(t) }))}
                    className={styles.editButton}
                    aria-label={`Edit plan for ${t.name}`}
                    title="Edit activity plan"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveTask(sch, idx)}
                    className={styles.removeButton}
                    title="Remove task"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {t.id && editTask[t.id] && (() => {
                  const draft = editTask[t.id!];
                  const setDraft = (next: NewTask) => setEditTask((current) => ({ ...current, [t.id!]: next }));
                  return (
                    <div className={styles.editPanel} data-testid={`edit-task-${t.id}`}>
                      <div className={styles.editGrid}>
                        <label>Activity name<input className={styles.input} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                        <label>Planned start<input className={styles.input} type="date" value={draft.plannedStart} onChange={(event) => setDraft({ ...draft, plannedStart: event.target.value })} /></label>
                        <label>Planned finish<input className={styles.input} type="date" value={draft.plannedEnd} onChange={(event) => setDraft({ ...draft, plannedEnd: event.target.value })} /></label>
                        <label>Working days<input className={styles.input} aria-label={`Edit working days for ${t.name}`} type="number" min={1} step={1} value={draft.durationWorkingDays} onChange={(event) => setDraft({ ...draft, durationWorkingDays: event.target.value })} /></label>
                      </div>
                      <div className={styles.lockedPackage}>WBS package remains fixed: {t.wbsNodeId ? (() => { const node = wbsNodes.find((item) => item.id === t.wbsNodeId); return node ? `${node.code} · ${node.title}` : 'record unavailable'; })() : 'legacy activity is not linked'}</div>
                      {requirementsEditor(draft, setDraft, `Edit resource needs for ${t.name}`)}
                      <div className={styles.editActions}>
                        <button type="button" className={styles.btn} onClick={() => setEditTask((current) => { const copy = { ...current }; delete copy[t.id!]; return copy; })}><X size={13} /> Cancel</button>
                        <button type="button" className={styles.btnPrimary} disabled={busy === sch.projectId} onClick={() => handleSaveTask(sch, idx)}><Save size={13} /> Save activity</button>
                      </div>
                    </div>
                  );
                })()}
                </Fragment>
              ))}
              {sch.tasks.length === 0 && <p className={styles.meta}>No tasks yet — add one below.</p>}
            </div>

            {/* Add task */}
            <div className={styles.addRow}>
              <select value={nt.wbsNodeId} onChange={(e) => upd(sch.projectId, { wbsNodeId: e.target.value })} className={styles.input} aria-label={`WBS work package for ${sch.projectName ?? sch.projectId}`}>
                <option value="">Select WBS package…</option>
                {wbsNodes.filter((node) => node.projectId === sch.projectId).map((node) => <option key={node.id} value={node.id}>{node.code} · {node.title}</option>)}
              </select>
              <input placeholder="Task name" value={nt.name} onChange={(e) => upd(sch.projectId, { name: e.target.value })} className={styles.input} style={{ flex: 2 }} />
              <input type="date" value={nt.plannedStart} onChange={(e) => upd(sch.projectId, { plannedStart: e.target.value })} className={styles.input} />
              <input type="date" value={nt.plannedEnd} onChange={(e) => upd(sch.projectId, { plannedEnd: e.target.value })} className={styles.input} />
              <input aria-label={`Working-day duration for ${sch.projectName ?? sch.projectId}`} type="number" min={1} step={1} placeholder="Working days" value={nt.durationWorkingDays} onChange={(e) => upd(sch.projectId, { durationWorkingDays: e.target.value })} className={styles.input} />
              <input type="number" min={0} max={100} value={nt.percentComplete} onChange={(e) => upd(sch.projectId, { percentComplete: e.target.value })} className={styles.input} style={{ width: 64 }} title="% complete" />
              <button type="button" className={styles.btn} disabled={busy === sch.projectId} onClick={() => handleAddTask(sch)}>+ Add task</button>
            </div>
            {requirementsEditor(nt, (next) => setAddTask((current) => ({ ...current, [sch.projectId]: next })), `Resource needs for ${sch.projectName ?? sch.projectId}`)}

            <div className={styles.legend}><span><i className={styles.swatch} style={{ background: 'var(--accent)' }} /> planned</span><span><i className={styles.swatch} style={{ background: 'var(--good)' }} /> % complete</span><span><i className={styles.swatch} style={{ background: 'var(--border)' }} /> baseline</span></div>
          </section>
        );
      })}
    </div>
  );
}
