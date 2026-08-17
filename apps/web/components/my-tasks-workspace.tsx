'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight, Bell, Bot, CalendarDays, Check, ChevronLeft, ChevronRight, CirclePlay, Clock3,
  List, LockKeyhole, MoreHorizontal, Pencil, Plus, Repeat2, RotateCcw, Search, SlidersHorizontal,
  Sparkles, Trash2, Undo2, UserRound, X,
} from 'lucide-react';
import AuraTabLink from '@/components/aura-tab-link';
import type { TaskRecurrence, WorkItem, WorkItemAction, WorkItemPriority, WorkItemStatus, WorkItemsPayload } from '@/lib/work-items';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import styles from '@/components/my-work-center.module.css';

type View = 'all' | 'assigned' | 'created' | 'system' | 'others' | 'upcoming' | 'overdue' | 'followups' | 'completed';
type Display = 'list' | 'calendar';
type CalendarMode = 'month' | 'week' | 'day';
export type TaskEditorState = { mode: 'create'; dueAt?: string } | { mode: 'edit'; item: WorkItem };
export interface TaskEditorInput { title: string; memo: string; dueAt: string | null; reminderAt: string | null; recurrence: TaskRecurrence; recurrenceEndsOn: string | null }

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'all', label: 'All tasks' }, { id: 'assigned', label: 'Assigned to me' },
  { id: 'created', label: 'Created by me' }, { id: 'system', label: 'From system' },
  { id: 'others', label: 'From others' }, { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' }, { id: 'followups', label: 'Follow-ups' },
  { id: 'completed', label: 'Completed' },
];
const STATUS_LABELS: Record<WorkItemStatus, string> = {
  todo: 'To do', in_progress: 'In progress', waiting: 'Waiting', blocked: 'Blocked', done: 'Done', cancelled: 'Cancelled',
};
const ACTION_LABELS: Record<WorkItemAction, string> = { start: 'Start', complete: 'Complete', reopen: 'Reopen' };
const dayKey = (date = new Date()): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateOnly = (value: string | null): string | null => value?.slice(0, 10) ?? null;
const localDateTime = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const reminderIso = (value: string): string | null => value ? new Date(value).toISOString() : null;

function prettyDate(value: string | null): string {
  if (!value) return 'No due date';
  const parsed = new Date(`${dateOnly(value)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

function matchesView(item: WorkItem, view: View): boolean {
  const due = dateOnly(item.dueAt); const now = dayKey();
  if (view === 'all') return item.status !== 'cancelled';
  if (view === 'assigned') return item.scopes.includes('assigned');
  if (view === 'created') return item.scopes.includes('created');
  if (view === 'system') return item.origin === 'system';
  if (view === 'others') return item.origin === 'other';
  if (view === 'upcoming') return !!due && due > now && !['done', 'cancelled'].includes(item.status);
  if (view === 'overdue') return !!due && due < now && !['done', 'cancelled'].includes(item.status);
  if (view === 'followups') return item.isFollowUp;
  return item.status === 'done';
}

function priorityRank(priority: WorkItemPriority): number {
  return ({ critical: 5, high: 4, medium: 3, normal: 2, low: 1 })[priority];
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const candidate = body as { message?: unknown; error?: unknown };
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.error === 'string') return candidate.error;
  }
  return fallback;
}

function calendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const cursor = new Date(first); cursor.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + index));
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function startOfWeek(date: Date): Date {
  return addDays(date, -date.getDay());
}

export function PersonalTaskEditor({ state, busy, error, onClose, onSave, onDelete, onReschedule }: {
  state: TaskEditorState; busy: boolean; error: string | null; onClose: () => void;
  onSave: (input: TaskEditorInput) => Promise<void>;
  onDelete: (item: WorkItem) => Promise<void>; onReschedule: (item: WorkItem) => void;
}) {
  const item = state.mode === 'edit' ? state.item : null;
  const [title, setTitle] = useState(item?.title ?? '');
  const [memo, setMemo] = useState(item?.memo ?? '');
  const [dueAt, setDueAt] = useState(state.mode === 'create' ? (state.dueAt ?? '') : (dateOnly(item?.dueAt ?? null) ?? ''));
  const [reminderAt, setReminderAt] = useState(localDateTime(item?.reminderAt));
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(item?.recurrence ?? 'none');
  const [recurrenceEndsOn, setRecurrenceEndsOn] = useState(item?.recurrenceEndsOn ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [busy, onClose]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (title.trim() && !busy) void onSave({ title: title.trim(), memo: memo.trim(), dueAt: dueAt || null, reminderAt: reminderIso(reminderAt), recurrence, recurrenceEndsOn: recurrence === 'none' ? null : (recurrenceEndsOn || null) }); };
  return <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className={styles.taskEditor} role="dialog" aria-modal="true" aria-labelledby="task-editor-title" data-testid="task-editor">
      <header className={styles.editorHead}><div><span>{state.mode === 'create' ? 'NEW PERSONAL TASK' : 'PERSONAL TASK'}</span><h2 id="task-editor-title">{state.mode === 'create' ? 'Create task' : 'Edit task'}</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close task editor"><X aria-hidden /></button></header>
      <form onSubmit={submit} className={styles.editorForm}>
        <label><span>Task title</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required placeholder="What needs to be done?" /></label>
        {state.mode === 'create' ? <label><span>Due date</span><input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label> : null}
        <label className={styles.editorWide}><span>Memo / notes</span><textarea value={memo} onChange={(event) => setMemo(event.target.value)} rows={5} maxLength={3000} placeholder="Add context, checklist notes or an expected outcome…" /></label>
        <details className={styles.editorAdvanced} open={!!item?.reminderAt || (item?.recurrence ?? 'none') !== 'none'}><summary><SlidersHorizontal aria-hidden />More scheduling options</summary><div><label><span>Reminder</span><input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} /></label><label><span>Repeat</span><select value={recurrence} onChange={(event) => setRecurrence(event.target.value as TaskRecurrence)}><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></label>{recurrence !== 'none' ? <label><span>Repeat until</span><input type="date" value={recurrenceEndsOn} min={dueAt || undefined} onChange={(event) => setRecurrenceEndsOn(event.target.value)} /></label> : null}</div></details>
        {error ? <p className={styles.modalError} role="alert">{error}</p> : null}
        {item ? <div className={styles.editorMeta}><span><Clock3 aria-hidden />Due {prettyDate(item.dueAt)}</span><span>{STATUS_LABELS[item.status]}</span></div> : null}
        <footer className={styles.editorActions}>
          {item?.deletable ? (confirmDelete ? <button className={styles.dangerAction} type="button" disabled={busy} onClick={() => void onDelete(item)}>Confirm delete</button> : <button className={styles.subtleAction} type="button" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden />Delete</button>) : <span />}
          <div>{item?.reschedulable ? <button className={styles.subtleAction} type="button" disabled={busy} onClick={() => onReschedule(item)}><CalendarDays aria-hidden />Reschedule</button> : null}<button className={styles.subtleAction} type="button" disabled={busy} onClick={onClose}>Cancel</button><button className={styles.primaryAction} type="submit" disabled={busy || !title.trim()}>{busy ? 'Saving…' : state.mode === 'create' ? 'Create task' : 'Save changes'}</button></div>
        </footer>
      </form>
    </section>
  </div>;
}

function RescheduleDialog({ item, proposedDueAt, busy, error, onClose, onSave }: { item: WorkItem; proposedDueAt?: string; busy: boolean; error: string | null; onClose: () => void; onSave: (dueAt: string, reason: string) => Promise<void> }) {
  const [dueAt, setDueAt] = useState(proposedDueAt ?? dateOnly(item.dueAt) ?? dayKey()); const [reason, setReason] = useState('');
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [busy, onClose]);
  return <div className={styles.modalBackdrop} role="presentation"><section className={`${styles.taskEditor} ${styles.rescheduleEditor}`} role="dialog" aria-modal="true" aria-labelledby="reschedule-title" data-testid="reschedule-dialog">
    <header className={styles.editorHead}><div><span>SCHEDULE CHANGE</span><h2 id="reschedule-title">Reschedule task</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close reschedule dialog"><X aria-hidden /></button></header>
    <form className={styles.editorForm} onSubmit={(event) => { event.preventDefault(); if (dueAt && reason.trim().length >= 3) void onSave(dueAt, reason.trim()); }}>
      <div className={styles.rescheduleSummary}><strong>{item.title}</strong><span>Current date · {prettyDate(item.dueAt)}</span></div>
      <label><span>New due date</span><input autoFocus type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required /></label>
      <label className={styles.editorWide}><span>Reason / memo / justification</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} minLength={3} required placeholder="Explain why the date is changing…" /></label>
      <p className={styles.auditHint}>AURA keeps this explanation in the task memo with the previous and new dates.</p>
      {error ? <p className={styles.modalError} role="alert">{error}</p> : null}
      <footer className={styles.editorActions}><span /><div><button className={styles.subtleAction} type="button" disabled={busy} onClick={onClose}>Cancel</button><button className={styles.primaryAction} type="submit" disabled={busy || !dueAt || reason.trim().length < 3}>{busy ? 'Rescheduling…' : 'Confirm new date'}</button></div></footer>
    </form>
  </section></div>;
}

function TaskRow({ item, focused, onAction, onEdit, onReschedule }: { item: WorkItem; focused?: boolean; onAction: (item: WorkItem, action: WorkItemAction) => Promise<void>; onEdit: (item: WorkItem) => void; onReschedule: (item: WorkItem) => void }) {
  const isFocused = focused ?? useSearchParams().get('task') === item.sourceId;
  const [busy, setBusy] = useState<WorkItemAction | null>(null);
  const run = async (action: WorkItemAction) => { setBusy(action); try { await onAction(item, action); } finally { setBusy(null); } };
  const primaryAction = item.actions.find((action) => action === 'complete') ?? item.actions[0];
  const otherActions = item.actions.filter((action) => action !== primaryAction);
  const originLabel = item.origin === 'self' ? 'Created by me' : item.origin === 'system' ? 'Created by AURA' : 'Created by another user';
  const OriginIcon = item.origin === 'system' ? Bot : UserRound;
  return <article className={`${styles.taskRow} ${isFocused ? styles.focusedTask : ''}`} data-testid="work-item" data-task-id={item.sourceId}>
    <span className={`${styles.priorityMark} ${styles[`priority_${item.priority}`]}`} aria-label={`${item.priority} priority`} />
    <div className={styles.taskIdentity}><div className={styles.taskChips}><span>{item.module}</span><span>{item.kind}</span>{item.projectName && <span>{item.projectName}</span>}<span className={styles.originChip}><OriginIcon aria-hidden />{originLabel}</span>{item.editable ? <span className={styles.personalChip}>Personal task</span> : <span className={styles.sourceOwnedChip} title={`${item.module} owns this record`}><LockKeyhole aria-hidden />Source owned</span>}{item.reminderAt && <span><Bell aria-hidden />Reminder</span>}{item.recurrence && item.recurrence !== 'none' && <span><Repeat2 aria-hidden />{item.recurrence}</span>}</div>{item.editable ? <button type="button" className={styles.taskTitleButton} onClick={() => onEdit(item)}>{item.title}</button> : <AuraTabLink href={item.href} tabTitle={item.title} tabType={item.module} className={styles.taskTitle}>{item.title}</AuraTabLink>}{(item.memo || item.detail) && <p>{item.memo ?? item.detail}</p>}</div>
    <div className={styles.taskMeta}><span className={`${styles.statusPill} ${styles[`status_${item.status}`]}`}>{STATUS_LABELS[item.status]}</span><span className={styles.due}>{prettyDate(item.dueAt)}</span><span className={styles.updated}>Updated {prettyDate(item.updatedAt)}</span></div>
    <div className={styles.taskActions}>
      {primaryAction ? <button type="button" className={styles.primaryTaskAction} disabled={busy !== null} onClick={() => void run(primaryAction)}>{primaryAction === 'start' ? <CirclePlay aria-hidden /> : primaryAction === 'complete' ? <Check aria-hidden /> : <RotateCcw aria-hidden />}{busy === primaryAction ? 'Working…' : ACTION_LABELS[primaryAction]}</button> : null}
      {!item.editable ? <AuraTabLink href={item.href} tabTitle={item.title} tabType={item.module} className={styles.sourceTaskLink}>Open in {item.module}<ArrowUpRight aria-hidden /></AuraTabLink> : null}
      {(otherActions.length || item.reschedulable || item.editable) ? <details className={styles.taskMenu}><summary aria-label={`More actions for ${item.title}`}><MoreHorizontal aria-hidden /></summary><div>{otherActions.map((action) => <button key={action} type="button" disabled={busy !== null} onClick={() => void run(action)}>{action === 'start' ? <CirclePlay aria-hidden /> : action === 'complete' ? <Check aria-hidden /> : <RotateCcw aria-hidden />}{ACTION_LABELS[action]}</button>)}{item.reschedulable ? <button type="button" onClick={() => onReschedule(item)}><CalendarDays aria-hidden />Reschedule</button> : null}{item.editable ? <button type="button" onClick={() => onEdit(item)}><Pencil aria-hidden />Edit details</button> : null}</div></details> : null}
    </div>
  </article>;
}

export default function MyTasksWorkspace({ initial }: { initial: WorkItemsPayload }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const focusedTaskId = searchParams.get('task');
  const [items, setItems] = useState(initial.items); const [view, setView] = useState<View>('all'); const [display, setDisplay] = useState<Display>('list');
  const [query, setQuery] = useState(''); const [module, setModule] = useState('all'); const [project, setProject] = useState('all'); const [priority, setPriority] = useState('all'); const [status, setStatus] = useState('all'); const [sort, setSort] = useState<'due' | 'priority' | 'updated'>('due');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1)); const [focusDate, setFocusDate] = useState(() => new Date()); const [calendarMode, setCalendarMode] = useState<CalendarMode>('month'); const [dragging, setDragging] = useState<WorkItem | null>(null); const [editor, setEditor] = useState<TaskEditorState | null>(null); const [rescheduling, setRescheduling] = useState<{ item: WorkItem; dueAt?: string } | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [showFilters, setShowFilters] = useState(false); const [recentlyDeleted, setRecentlyDeleted] = useState<WorkItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { void fetch('/api/work-items/reminders', { method: 'POST' }).catch(() => undefined); }, []);
  useEffect(() => {
    const refresh = async () => {
      const response = await fetch('/api/work-items', { cache: 'no-store' }).catch(() => null);
      if (!response?.ok) return;
      const payload = await response.json() as WorkItemsPayload;
      setItems(payload.items);
    };
    void refresh();
    window.addEventListener('aura:work-items-changed', refresh);
    return () => window.removeEventListener('aura:work-items-changed', refresh);
  }, []);
  useEffect(() => {
    if (pathname !== '/my-work/tasks' || !focusedTaskId) return;
    const item = items.find((candidate) => candidate.sourceId === focusedTaskId);
    if (!item) return;
    setDisplay('list'); setView('all'); setQuery(''); setModule('all'); setProject('all'); setPriority('all'); setStatus('all');
    if (item.editable) setEditor({ mode: 'edit', item });
    else window.setTimeout(() => document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(focusedTaskId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }, [focusedTaskId, items, pathname]);
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); setError(null); setEditor({ mode: 'create' }); }
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', shortcuts); return () => window.removeEventListener('keydown', shortcuts);
  }, []);
  const modules = useMemo(() => [...new Set(items.map((item) => item.module))].sort(), [items]);
  const projects = useMemo(() => [...new Map(items.filter((item) => item.projectId).map((item) => [item.projectId as string, item.projectName ?? 'Unnamed project'])).entries()], [items]);
  const filtered = useMemo(() => { const needle = query.trim().toLowerCase(); return items.filter((item) => module === 'all' || item.module === module).filter((item) => project === 'all' || item.projectId === project).filter((item) => priority === 'all' || item.priority === priority).filter((item) => status === 'all' || item.status === status).filter((item) => !needle || [item.title, item.detail, item.memo, item.kind, item.module, item.projectName].some((value) => value?.toLowerCase().includes(needle))); }, [items, module, priority, project, query, status]);
  const visible = useMemo(() => filtered.filter((item) => matchesView(item, view)).sort((a, b) => sort === 'priority' ? priorityRank(b.priority) - priorityRank(a.priority) : sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999')), [filtered, sort, view]);
  const openItems = items.filter((item) => !['done', 'cancelled'].includes(item.status)); const overdue = openItems.filter((item) => dateOnly(item.dueAt) && dateOnly(item.dueAt)! < dayKey()); const dueToday = openItems.filter((item) => dateOnly(item.dueAt) === dayKey()); const blocked = openItems.filter((item) => item.status === 'blocked');
  const insight = overdue.length ? `${overdue.length} overdue item${overdue.length === 1 ? '' : 's'} need attention. ${[...overdue].sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))[0]?.title} is the highest current priority.` : blocked.length ? `${blocked.length} blocked item${blocked.length === 1 ? '' : 's'} should be cleared before starting new work.` : dueToday.length ? `${dueToday.length} item${dueToday.length === 1 ? '' : 's'} due today. Your queue is otherwise on track.` : 'No overdue work is visible in the connected sources.';
  const request = async (url: string, init: RequestInit, fallback: string): Promise<WorkItem | { deleted: true } | null> => { setError(null); setNotice(null); setBusy(true); try { const res = await fetch(url, init); const body = await res.json().catch(() => ({})); if (!res.ok) { setError(errorMessage(body, fallback)); return null; } return body as WorkItem | { deleted: true }; } catch { setError(fallback); return null; } finally { setBusy(false); } };
  const act = async (item: WorkItem, action: WorkItemAction) => { const result = await request(`/api/work-items/${encodeURIComponent(item.source)}/${encodeURIComponent(item.sourceId)}/${action}`, { method: 'POST' }, 'The source record could not be updated.'); if (result && !('deleted' in result)) setItems((current) => current.map((candidate) => candidate.id === item.id ? result : candidate)); };
  const saveEditor = async (input: TaskEditorInput) => { const editing = editor?.mode === 'edit' ? editor.item : null; const url = editing ? `/api/work-items/${encodeURIComponent(editing.source)}/${encodeURIComponent(editing.sourceId)}` : '/api/work-items'; const payload = editing ? { title: input.title, memo: input.memo, reminderAt: input.reminderAt, recurrence: input.recurrence, recurrenceEndsOn: input.recurrenceEndsOn } : input; const result = await request(url, { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, 'The task could not be saved.'); if (!result || 'deleted' in result) return; setItems((current) => editing ? current.map((candidate) => candidate.id === editing.id ? result : candidate) : [result, ...current]); setEditor(null); setNotice(editing ? 'Task updated.' : 'Task created.'); };
  const deleteTask = async (item: WorkItem) => { const result = await request(`/api/work-items/${encodeURIComponent(item.source)}/${encodeURIComponent(item.sourceId)}`, { method: 'DELETE' }, 'The task could not be deleted.'); if (!result || !('deleted' in result)) return; setItems((current) => current.filter((candidate) => candidate.id !== item.id)); setEditor(null); setRecentlyDeleted(item); };
  const undoDelete = async () => {
    if (!recentlyDeleted) return;
    const item = recentlyDeleted;
    let restored = await request(`/api/work-items/${encodeURIComponent(item.source)}/${encodeURIComponent(item.sourceId)}/reopen`, { method: 'POST' }, 'The task could not be restored.');
    if (!restored || 'deleted' in restored) return;
    const restoreAction: WorkItemAction | null = item.status === 'done' ? 'complete' : item.status === 'in_progress' ? 'start' : null;
    if (restoreAction) {
      const restoredState = await request(`/api/work-items/${encodeURIComponent(item.source)}/${encodeURIComponent(item.sourceId)}/${restoreAction}`, { method: 'POST' }, 'The task was restored, but its previous status could not be recovered.');
      if (restoredState && !('deleted' in restoredState)) restored = restoredState;
    }
    setItems((current) => [restored, ...current.filter((candidate) => candidate.id !== restored.id)]);
    setRecentlyDeleted(null); setNotice('Task restored.');
  };
  const rescheduleTask = async (dueAt: string, reason: string) => { if (!rescheduling) return; const result = await request(`/api/work-items/${encodeURIComponent(rescheduling.item.source)}/${encodeURIComponent(rescheduling.item.sourceId)}/reschedule`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dueAt, reason }) }, 'The task could not be rescheduled.'); if (!result || 'deleted' in result) return; setItems((current) => current.map((candidate) => candidate.id === rescheduling.item.id ? result : candidate)); setRescheduling(null); setNotice(`Task moved to ${prettyDate(dueAt)}.`); };
  const openReschedule = (item: WorkItem, dueAt?: string) => { setError(null); setEditor(null); setRescheduling({ item, dueAt }); };
  const openEditor = (state: TaskEditorState) => { setError(null); setNotice(null); setEditor(state); };
  const clearFilters = () => { setModule('all'); setProject('all'); setPriority('all'); setStatus('all'); };
  const activeFilterCount = [module, project, priority, status].filter((value) => value !== 'all').length;
  const days = useMemo(() => calendarDays(month), [month]);
  const byDay = useMemo(() => { const map = new Map<string, WorkItem[]>(); for (const item of filtered) { const key = dateOnly(item.dueAt); if (!key) continue; map.set(key, [...(map.get(key) ?? []), item]); } return map; }, [filtered]);
  const unscheduled = filtered.filter((item) => !item.dueAt && !['done', 'cancelled'].includes(item.status));
  const agendaDays = useMemo(() => calendarMode === 'week' ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(focusDate), index)) : [focusDate], [calendarMode, focusDate]);
  const calendarTitle = calendarMode === 'month'
    ? new Intl.DateTimeFormat(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, month: 'long', year: 'numeric' }).format(month)
    : calendarMode === 'week'
      ? `${new Intl.DateTimeFormat(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, day: 'numeric', month: 'short' }).format(agendaDays[0])} — ${new Intl.DateTimeFormat(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(agendaDays[6])}`
      : new Intl.DateTimeFormat(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(focusDate);
  const goToday = () => { const today = new Date(); setFocusDate(today); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); };
  const moveCalendar = (direction: -1 | 1) => {
    if (calendarMode === 'month') setMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
    else setFocusDate((current) => addDays(current, direction * (calendarMode === 'week' ? 7 : 1)));
  };
  const dropOnDate = (dueAt: string) => { if (dragging?.reschedulable && dateOnly(dragging.dueAt) !== dueAt) openReschedule(dragging, dueAt); setDragging(null); };
  const renderCalendarTask = (item: WorkItem) => item.editable ? <button
    key={item.id}
    type="button"
    draggable={!!item.reschedulable}
    className={`${styles.calendarTask} ${styles[`calendar_${item.status}`]}`}
    onDragStart={() => setDragging(item)}
    onDragEnd={() => setDragging(null)}
    onClick={() => openEditor({ mode: 'edit', item })}
  ><i className={styles[`priority_${item.priority}`]} />{item.title}{item.recurrence && item.recurrence !== 'none' ? <Repeat2 aria-label={`${item.recurrence} recurrence`} /> : null}</button> : <AuraTabLink key={item.id} href={item.href} tabTitle={item.title} tabType={item.module} className={`${styles.calendarTask} ${styles[`calendar_${item.status}`]}`}><i className={styles[`priority_${item.priority}`]} />{item.title}</AuraTabLink>;

  return <>
    <section className={styles.taskCommandBar} aria-label="Task management controls"><div className={styles.displayToggle} aria-label="Display tasks as list or calendar"><button type="button" aria-pressed={display === 'list'} data-testid="task-display-list" onClick={() => setDisplay('list')}><List aria-hidden />List</button><button type="button" aria-pressed={display === 'calendar'} data-testid="task-display-calendar" onClick={() => { setDisplay('calendar'); if (window.innerWidth <= 680) setCalendarMode('day'); }}><CalendarDays aria-hidden />Calendar</button></div><button type="button" className={styles.createTaskButton} data-testid="create-task" aria-keyshortcuts="N" onClick={() => openEditor({ mode: 'create' })}><Plus aria-hidden />New task</button></section>
    <section className={styles.stats} aria-label="Task summary"><button type="button" className={styles.stat} onClick={() => { setDisplay('list'); setView('all'); }}><strong>{openItems.length}</strong><span>Active tasks</span></button><button type="button" className={styles.stat} onClick={() => { setDisplay('list'); setView('created'); }}><strong>{items.filter((item) => item.origin === 'self').length}</strong><span>Created by me</span></button><button type="button" className={styles.stat} onClick={() => { setDisplay('list'); setView('others'); }}><strong>{items.filter((item) => item.origin === 'other').length}</strong><span>From others</span></button><AuraTabLink href="/my-work/my-day" tabTitle="My Day" tabType="My Work" className={`${styles.stat} ${styles.myDayStat}`}><strong>{dueToday.length}</strong><span>Open My Day · due today</span><ArrowUpRight aria-hidden /></AuraTabLink></section>
    <aside className={styles.aiBrief} aria-label="AURA task summary"><Sparkles aria-hidden /><div><strong>AURA PRIORITY BRIEF</strong><p>{insight}</p></div></aside>
    {display === 'list' ? <nav className={styles.viewTabs} aria-label="Task views">{VIEWS.map((entry) => <button key={entry.id} type="button" aria-pressed={view === entry.id} onClick={() => setView(entry.id)}>{entry.label}<span>{items.filter((item) => matchesView(item, entry.id)).length}</span></button>)}</nav> : null}
    <section className={styles.taskToolbar} aria-label="Task filters"><label className={styles.searchBox}><Search aria-hidden /><span className={styles.srOnly}>Search tasks</span><input ref={searchRef} aria-keyshortcuts="/" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, projects or records" /></label><button type="button" className={styles.filterToggle} aria-expanded={showFilters} onClick={() => setShowFilters((current) => !current)}><SlidersHorizontal aria-hidden />Filters{activeFilterCount ? <span>{activeFilterCount}</span> : null}</button>{showFilters ? <div className={styles.filterControls}><select aria-label="Filter by module" value={module} onChange={(event) => setModule(event.target.value)}><option value="all">All modules</option>{modules.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by project" value={project} onChange={(event) => setProject(event.target.value)}><option value="all">All projects</option>{projects.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">All priorities</option>{['critical', 'high', 'medium', 'normal', 'low'].map((value) => <option key={value} value={value}>{value}</option>)}</select><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{display === 'list' ? <select aria-label="Sort tasks" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="due">Due date</option><option value="priority">Priority</option><option value="updated">Last updated</option></select> : null}</div> : null}{activeFilterCount ? <div className={styles.activeFilters}>{module !== 'all' ? <button type="button" onClick={() => setModule('all')}>Module: {module}<X aria-hidden /></button> : null}{project !== 'all' ? <button type="button" onClick={() => setProject('all')}>Project: {projects.find(([id]) => id === project)?.[1] ?? project}<X aria-hidden /></button> : null}{priority !== 'all' ? <button type="button" onClick={() => setPriority('all')}>Priority: {priority}<X aria-hidden /></button> : null}{status !== 'all' ? <button type="button" onClick={() => setStatus('all')}>Status: {STATUS_LABELS[status as WorkItemStatus]}<X aria-hidden /></button> : null}<button type="button" className={styles.clearFilters} onClick={clearFilters}>Clear all</button></div> : null}</section>
    {error && <p className={styles.actionError} role="alert">{error}</p>}{notice && <p className={styles.actionNotice} role="status">{notice}</p>}
    {display === 'list' ? <section className={styles.taskRegister} aria-labelledby="task-register-title"><header className={styles.registerHead}><div><h2 id="task-register-title">{VIEWS.find((entry) => entry.id === view)?.label}</h2><p>{visible.length} matching item{visible.length === 1 ? '' : 's'} connected to you</p></div><span>My Tasks owns attention · source modules own records</span></header>{visible.length ? <div className={styles.taskList}>{visible.map((item) => <TaskRow key={item.id} item={item} onAction={act} onEdit={(task) => openEditor({ mode: 'edit', item: task })} onReschedule={openReschedule} />)}</div> : <div className={styles.taskEmpty}><strong>No matching work</strong><p>Try another view or clear one of the filters.</p><button type="button" onClick={() => openEditor({ mode: 'create' })}><Plus aria-hidden />Create a personal task</button></div>}</section> : <section className={styles.calendarPanel} aria-labelledby="calendar-title">
      <header className={styles.calendarHead}>
        <div className={styles.calendarNav}><button type="button" onClick={goToday}>Today</button><button type="button" aria-label="Previous period" onClick={() => moveCalendar(-1)}><ChevronLeft aria-hidden /></button><button type="button" aria-label="Next period" onClick={() => moveCalendar(1)}><ChevronRight aria-hidden /></button></div>
        <div><h2 id="calendar-title">{calendarTitle}</h2><p>Drag a personal task to another date; AURA will require a reason before saving.</p></div>
        <div className={styles.calendarMode} aria-label="Calendar period"><button type="button" aria-pressed={calendarMode === 'month'} onClick={() => setCalendarMode('month')}>Month</button><button type="button" aria-pressed={calendarMode === 'week'} onClick={() => setCalendarMode('week')}>Week</button><button type="button" aria-pressed={calendarMode === 'day'} onClick={() => setCalendarMode('day')}>Day</button></div>
      </header>
      {calendarMode === 'month' ? <div className={styles.calendarScroller}><div className={styles.calendarWeekdays}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => <span key={label}>{label}</span>)}</div><div className={styles.calendarGrid} data-testid="calendar-grid">{days.map((date) => { const key = dayKey(date); const tasks = byDay.get(key) ?? []; const outside = date.getMonth() !== month.getMonth(); return <div key={key} className={`${styles.calendarDay} ${outside ? styles.calendarOutside : ''} ${key === dayKey() ? styles.calendarToday : ''} ${dragging ? styles.dropReady : ''}`} onDragOver={(event) => { if (dragging?.reschedulable) event.preventDefault(); }} onDrop={() => dropOnDate(key)}><button type="button" className={styles.dayNumber} aria-label={`Create task on ${prettyDate(key)}`} onClick={() => { setFocusDate(date); openEditor({ mode: 'create', dueAt: key }); }}>{date.getDate()}</button><div className={styles.dayTasks}>{tasks.slice(0, 3).map(renderCalendarTask)}{tasks.length > 3 ? <span className={styles.moreTasks}>+{tasks.length - 3} more</span> : null}</div></div>; })}</div></div> : <div className={`${styles.agendaGrid} ${calendarMode === 'day' ? styles.dayMode : ''}`} data-testid={`${calendarMode}-calendar`}>{agendaDays.map((date) => { const key = dayKey(date); const tasks = byDay.get(key) ?? []; return <section key={key} className={`${styles.agendaDay} ${key === dayKey() ? styles.calendarToday : ''} ${dragging ? styles.dropReady : ''}`} onDragOver={(event) => { if (dragging?.reschedulable) event.preventDefault(); }} onDrop={() => dropOnDate(key)}><header><span>{new Intl.DateTimeFormat(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, weekday: 'short' }).format(date)}</span><strong>{date.getDate()}</strong><button type="button" onClick={() => openEditor({ mode: 'create', dueAt: key })} aria-label={`Create task on ${prettyDate(key)}`}><Plus aria-hidden /></button></header><div className={styles.agendaTasks}>{tasks.length ? tasks.map(renderCalendarTask) : <button type="button" className={styles.agendaEmpty} onClick={() => openEditor({ mode: 'create', dueAt: key })}>No tasks · add one</button>}</div></section>; })}</div>}
      {unscheduled.length ? <aside className={styles.unscheduled}><div><strong>Unscheduled</strong><span>{unscheduled.length} task{unscheduled.length === 1 ? '' : 's'} without a date</span></div><div>{unscheduled.slice(0, 6).map((item) => item.reschedulable ? <button key={item.id} type="button" onClick={() => openReschedule(item)}>{item.title}<CalendarDays aria-hidden /></button> : <AuraTabLink key={item.id} href={item.href} tabTitle={item.title} tabType={item.module}>{item.title}<ArrowUpRight aria-hidden /></AuraTabLink>)}</div></aside> : null}
    </section>}
    <details className={styles.coverage}><summary>Task source coverage</summary><div><p><strong>Connected:</strong> {initial.coverage.connected.join(', ')}</p>{initial.coverage.notConnected.map((gap) => <p key={gap.module}><strong>{gap.module} — not connected:</strong> {gap.reason}</p>)}</div></details>
    {recentlyDeleted ? <div className={styles.undoToast} role="status"><span>Task deleted.</span><button type="button" disabled={busy} onClick={() => void undoDelete()}><Undo2 aria-hidden />Undo</button><button type="button" aria-label="Dismiss deleted task message" onClick={() => setRecentlyDeleted(null)}><X aria-hidden /></button></div> : null}
    {editor ? <PersonalTaskEditor state={editor} busy={busy} error={error} onClose={() => setEditor(null)} onSave={saveEditor} onDelete={deleteTask} onReschedule={openReschedule} /> : null}{rescheduling ? <RescheduleDialog item={rescheduling.item} proposedDueAt={rescheduling.dueAt} busy={busy} error={error} onClose={() => setRescheduling(null)} onSave={rescheduleTask} /> : null}
  </>;
}
