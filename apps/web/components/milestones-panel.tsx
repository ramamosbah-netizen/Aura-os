'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, CircleHelp, Flag, TriangleAlert } from 'lucide-react';
import styles from './milestones-panel.module.css';

/**
 * The points in this programme where something must be TRUE (PLN-04).
 *
 * THREE DATES, never conflated. The TARGET is what was committed to and does not move when the plan
 * moves — a milestone that recomputes its own deadline can never be missed. The FORECAST comes from
 * the schedule's own forecast run, so this panel and the project's completion date cannot disagree
 * about the same work. The ACHIEVED date is the day it was actually met.
 *
 * NOTHING HERE IS STORED AS A VERDICT. Every status is derived on the read, which is why a
 * milestone cannot sit on this screen reading "on track" against a programme that slipped last week.
 *
 * AND THE CONTRADICTION IS SHOWN. An achievement recorded while the work gating it is unfinished is
 * the commonest way a programme lies to management — the row goes green, the work is at forty
 * percent, and nothing says both at once. Here both are said, in the same place, every time.
 */

interface GatingActivity {
  taskId: string;
  name: string;
  percentComplete: number;
  measured: boolean;
  forecastFinish: string | null;
  complete: boolean;
}

interface MilestoneView {
  milestone: {
    id: string; name: string; targetDate: string; ownerId: string | null;
    gatingTaskIds: string[]; achievedOn: string | null; achievedBy: string | null; achievedNote: string | null;
  };
  status: 'ACHIEVED' | 'ON_TRACK' | 'AT_RISK' | 'MISSED' | 'UNKNOWN';
  forecastDate: string | null;
  varianceWorkingDays: number | null;
  gating: GatingActivity[];
  measuredGating: number;
  achievedAgainstIncompleteWork: boolean;
  incompleteGating: GatingActivity[];
  unknownReason: string | null;
}

const VERDICT: Record<MilestoneView['status'], { label: string; className: string }> = {
  ACHIEVED: { label: 'Achieved', className: 'achieved' },
  ON_TRACK: { label: 'On track', className: 'onTrack' },
  AT_RISK: { label: 'At risk', className: 'atRisk' },
  MISSED: { label: 'Missed', className: 'missed' },
  UNKNOWN: { label: 'Not established', className: 'unknown' },
};

const icon = (status: MilestoneView['status']) =>
  status === 'ACHIEVED' || status === 'ON_TRACK' ? <CircleCheck size={13} />
    : status === 'UNKNOWN' ? <CircleHelp size={13} />
    : status === 'AT_RISK' ? <TriangleAlert size={13} />
    : <CircleAlert size={13} />;

/** How a variance reads in words. Never "0 days late" where there is nothing to compare. */
function variance(view: MilestoneView): { text: string; className?: string } {
  if (view.varianceWorkingDays === null) return { text: 'nothing to measure against' };
  if (view.varianceWorkingDays === 0) return { text: 'on the committed date' };
  const days = Math.abs(view.varianceWorkingDays);
  return view.varianceWorkingDays > 0
    ? { text: `${days} working day${days === 1 ? '' : 's'} late`, className: styles.late }
    : { text: `${days} working day${days === 1 ? '' : 's'} early`, className: styles.early };
}

export default function MilestonesPanel({ projectId, tasks = [], members = [] }: {
  projectId: string;
  tasks?: Array<{ id: string; name: string }>;
  /**
   * The project's OWN members — the only people who can be made answerable for one of its
   * milestones. The API refuses anybody else, so this list is never widened to the whole tenant:
   * a picker offering a choice the server will reject is worse than no picker.
   */
  members?: Array<{ userId: string; displayName?: string }>;
}) {
  const [views, setViews] = useState<MilestoneView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [gates, setGates] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/projects/schedules/${projectId}/milestones`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || result?.error || 'Could not read the milestones');
      setViews(result as MilestoneView[]);
    } catch (e: unknown) {
      // The panel says it could not answer rather than rendering an empty list, which would read as
      // "this project has no milestones" — the one thing it must never say by accident.
      setError(e instanceof Error ? e.message : 'Could not read the milestones');
      setViews(null);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (): Promise<void> => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/projects/schedules/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, targetDate, gatingTaskIds: gates, ownerId: ownerId || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || result?.error || 'Could not add the milestone');
      setName(''); setTargetDate(''); setGates([]); setOwnerId(''); setAdding(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not add the milestone');
    } finally {
      setBusy(false);
    }
  };

  const achieve = async (id: string): Promise<void> => {
    setBusy(true); setError(null);
    try {
      // Defaults to today, which is the common case; the API takes the day it was MET rather than
      // stamping its own clock, so a date entered late still records when it actually happened.
      const response = await fetch(`/api/projects/milestones/${id}/achievement`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ on: new Date().toISOString().slice(0, 10) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || result?.error || 'Could not record the achievement');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not record the achievement');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} data-testid="milestones-panel">
      <header className={styles.head}>
        <span className={styles.icon}><Flag size={16} /></span>
        <div className={styles.headMain}>
          <strong>Milestones</strong>
          <span className={styles.meta}>
            {views === null ? 'Reading the programme…'
              : `${views.length} committed point${views.length === 1 ? '' : 's'} · target dates do not move when the plan does`}
          </span>
        </div>
        <button type="button" className={styles.add} onClick={() => setAdding((open) => !open)} data-testid="milestone-add-toggle">
          {adding ? 'Cancel' : 'Add milestone'}
        </button>
      </header>

      {adding && (
        <div className={styles.form} data-testid="milestone-form">
          <div className={styles.formRow}>
            <label className={styles.field}>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)}
                placeholder="Level 1 energisation" data-testid="milestone-name" />
            </label>
            <label className={styles.field}>
              <span>Committed date</span>
              <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)}
                data-testid="milestone-target" />
            </label>
            {/* Naming an owner puts the milestone in that person's My Work, through the same
                responsibility path every other project assignment uses — not a second inbox. */}
            {members.length > 0 && (
              <label className={styles.field}>
                <span>Answerable</span>
                <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} data-testid="milestone-owner">
                  <option value="">Nobody named</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>{member.displayName || member.userId}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className={styles.gates}>
            <span>What must finish for this to be true</span>
            {tasks.length === 0
              ? <small>This programme has no activities yet, so nothing can gate a milestone.</small>
              : (
                <div className={styles.gateList}>
                  {tasks.map((task) => (
                    <label key={task.id} className={styles.gate}>
                      <input
                        type="checkbox"
                        checked={gates.includes(task.id)}
                        data-testid={`milestone-gate-${task.id}`}
                        onChange={(event) => setGates((current) =>
                          event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))}
                      />
                      {task.name}
                    </label>
                  ))}
                </div>
              )}
            {/* Said before it is saved rather than discovered afterwards: a milestone nothing gates
                cannot be forecast, and this panel will show it as not established. */}
            {gates.length === 0 && tasks.length > 0 && (
              <small>Nothing selected — this milestone will read as not established until something gates it.</small>
            )}
            {/* Said rather than left to a rejected submission: naming an owner requires somebody on
                the project, and if nobody is on it there is nobody who could receive the milestone. */}
            {members.length === 0 && (
              <small data-testid="milestone-no-members">
                This project has no members yet, so no one can be made answerable for a milestone.
              </small>
            )}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={busy || !name.trim() || !targetDate}
              onClick={() => void submit()} data-testid="milestone-save">Add milestone</button>
          </div>
        </div>
      )}

      {error && <div className={styles.error} role="alert" data-testid="milestone-error">{error}</div>}
      {views?.length === 0 && !adding && (
        <p className={styles.empty}>No milestone has been committed on this programme.</p>
      )}

      {views && views.length > 0 && (
        <ol className={styles.list}>
          {views.map((view) => {
            const verdict = VERDICT[view.status];
            const gap = variance(view);
            return (
              <li key={view.milestone.id} className={styles.item} data-testid={`milestone-${view.milestone.id}`}>
                <div className={styles.itemHead}>
                  <span className={`${styles.badge} ${styles[verdict.className]}`} data-testid={`milestone-status-${view.milestone.id}`}>
                    {icon(view.status)}{verdict.label}
                  </span>
                  <strong>{view.milestone.name}</strong>
                  {view.status !== 'ACHIEVED' && (
                    <button type="button" className={styles.secondary} disabled={busy}
                      onClick={() => void achieve(view.milestone.id)}
                      data-testid={`milestone-achieve-${view.milestone.id}`}>Record as met</button>
                  )}
                </div>

                {/* The three dates on one row, because their relationship is the point. */}
                <div className={styles.dates} data-testid={`milestone-dates-${view.milestone.id}`}>
                  <span>Committed <strong>{view.milestone.targetDate}</strong></span>
                  {view.milestone.achievedOn
                    ? <span>Met <strong>{view.milestone.achievedOn}</strong></span>
                    : <span>Forecast <strong>{view.forecastDate ?? '—'}</strong></span>}
                  <span className={gap.className} data-testid={`milestone-variance-${view.milestone.id}`}>{gap.text}</span>
                </div>

                {view.unknownReason && (
                  <p className={styles.reason} data-testid={`milestone-unknown-${view.milestone.id}`}>{view.unknownReason}</p>
                )}

                {/* AN ACHIEVEMENT AGAINST UNFINISHED WORK. Not hidden, not softened, and not
                    presented as a warning about the future — it is a statement about the present. */}
                {view.achievedAgainstIncompleteWork && (
                  <div className={styles.contradiction} data-testid={`milestone-contradiction-${view.milestone.id}`}>
                    <strong>Recorded as met while the work behind it is unfinished.</strong>
                    Still open: {view.incompleteGating.map((activity) => activity.name).join(', ')}.
                  </div>
                )}

                {view.gating.length > 0 && (
                  <div className={styles.gatingRow}>
                    {view.gating.map((activity) => (
                      <span key={activity.taskId} className={activity.complete ? styles.done : undefined}
                        data-testid={`milestone-gate-row-${activity.taskId}`}>
                        {activity.name} · {activity.complete ? 'finished' : `${activity.percentComplete}%`}
                        {activity.measured ? ' · measured' : ' · declared'}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
