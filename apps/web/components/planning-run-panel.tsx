'use client';

import { useCallback, useEffect, useState } from 'react';
import { Play, Check, X, AlertTriangle, CircleHelp, CircleCheck } from 'lucide-react';
import styles from './planning-run-panel.module.css';

// §22 Step 12 — the planning workspace. Run the solver, read the proposal and the change it would
// make to the current plan, see the cross-project conflict, and accept or discard — a governed act.

type Feasibility = 'AVAILABLE' | 'CONFLICTED' | 'UNKNOWN';
type PlanFeasibility = 'AVAILABLE' | 'CONFLICTED';

interface ResourceRef { resourceType: string; canonicalResourceId: string }
interface ResourceVerdict {
  resource: ResourceRef; unit: string; feasibility: Feasibility;
  reason?: string; conflictDays: string[]; capacity: number | null; peakTotalDemand: number;
}
interface SolverProposal {
  projectStart: string; projectFinish: string;
  feasibility: PlanFeasibility; coverage: 'COMPLETE' | 'PARTIAL'; established: boolean;
  resourceVerdicts: ResourceVerdict[];
  unmetDemand: { taskId: string; reason: string; detail: string }[];
  planningDeficiencies: { taskId: string; reason: string; detail: string }[];
}
type RunStatus = 'proposed' | 'accepted' | 'superseded' | 'discarded';
interface PlanningRun {
  id: string; status: RunStatus; ranAt: string; acceptanceReason?: string | null; proposal: SolverProposal;
}
type ChangeKind = 'UNCHANGED' | 'MOVED' | 'NEWLY_PLACED' | 'BECAME_UNPLACEABLE' | 'STILL_UNPLACEABLE';
interface TaskDateChange {
  taskId: string; name: string;
  currentStart: string | null; currentEnd: string | null;
  proposedStart: string | null; proposedEnd: string | null; change: ChangeKind;
}
interface ProposalComparison {
  changes: TaskDateChange[]; movedCount: number; currentFinish: string | null; proposedFinish: string;
}
interface RunView { run: PlanningRun; comparison: ProposalComparison }

const shortRef = (r: ResourceRef): string => `${r.resourceType} · ${r.canonicalResourceId.slice(0, 8)}`;
const CHANGE_CLASS: Record<ChangeKind, string> = {
  UNCHANGED: styles.unchanged, MOVED: styles.moved, NEWLY_PLACED: styles.moved,
  BECAME_UNPLACEABLE: styles.unplaceable, STILL_UNPLACEABLE: styles.unplaceable,
};
const CHANGE_LABEL: Record<ChangeKind, string> = {
  UNCHANGED: 'Unchanged', MOVED: 'Moved', NEWLY_PLACED: 'Newly placed',
  BECAME_UNPLACEABLE: 'Unplaceable', STILL_UNPLACEABLE: 'Unplaceable',
};

export default function PlanningRunPanel({ projectId, projectName }: { projectId: string; projectName?: string | null }) {
  const [view, setView] = useState<RunView | null>(null);
  const [history, setHistory] = useState<PlanningRun[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState('');

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/projects/schedules/${projectId}/planning-runs`, { cache: 'no-store' });
    if (res.ok) setHistory(await res.json().catch(() => []));
  }, [projectId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  async function run() {
    setBusy('run'); setError(null);
    try {
      const res = await fetch(`/api/projects/schedules/${projectId}/planning-runs`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? 'Planning run failed');
      setView(data as RunView); setAck('');
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Planning run failed');
    } finally { setBusy(null); }
  }

  async function accept() {
    if (!view) return;
    setBusy('accept'); setError(null);
    try {
      const res = await fetch(`/api/projects/planning-runs/${view.run.id}/accept`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acknowledgeReason: ack.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? 'Acceptance failed');
      setView(null); setAck('');
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Acceptance failed');
    } finally { setBusy(null); }
  }

  async function discard() {
    if (!view) return;
    const reason = window.prompt('Why are you discarding this proposal?');
    if (!reason?.trim()) return;
    setBusy('discard'); setError(null);
    try {
      const res = await fetch(`/api/projects/planning-runs/${view.run.id}/discard`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? 'Discard failed');
      setView(null);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Discard failed');
    } finally { setBusy(null); }
  }

  const proposal = view?.run.proposal;
  const conflicts = proposal?.resourceVerdicts.filter((v) => v.feasibility !== 'AVAILABLE') ?? [];

  return (
    <div className={styles.panel} data-testid="planning-run-panel">
      <div className={styles.head}>
        <div>
          <h3>Resource planning</h3>
          <p>
            Run the solver to level {projectName ?? 'this project'} against capacity and every other
            project&rsquo;s commitments. The result is a proposal — accepting it is a separate, recorded act.
          </p>
        </div>
        <button className={styles.runBtn} onClick={run} disabled={busy !== null} data-testid="run-plan">
          <Play size={15} /> {busy === 'run' ? 'Running…' : 'Run plan'}
        </button>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}

      {proposal && view && (
        <>
          <div className={styles.verdicts}>
            <span className={`${styles.badge} ${proposal.feasibility === 'CONFLICTED' ? styles.bad : styles.good}`}>
              {proposal.feasibility === 'CONFLICTED' ? <AlertTriangle size={14} /> : <CircleCheck size={14} />}
              {proposal.feasibility === 'CONFLICTED' ? 'Conflicted' : 'No conflict'}
            </span>
            <span className={`${styles.badge} ${proposal.coverage === 'PARTIAL' ? styles.warn : styles.good}`}>
              {proposal.coverage === 'PARTIAL' ? <CircleHelp size={14} /> : <CircleCheck size={14} />}
              Coverage {proposal.coverage === 'PARTIAL' ? 'partial' : 'complete'}
            </span>
            <span className={`${styles.badge} ${proposal.established ? styles.good : styles.warn}`}>
              {proposal.established ? 'Established' : 'Not established'}
            </span>
          </div>

          {conflicts.length > 0 && (
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Resource conflicts</span>
              {conflicts.map((v) => (
                <div key={`${v.resource.resourceType}:${v.resource.canonicalResourceId}`}
                     className={`${styles.conflict} ${v.feasibility === 'UNKNOWN' ? styles.unknown : ''}`}>
                  <span className={styles.conflictRes}>
                    {shortRef(v.resource)} — {v.feasibility === 'UNKNOWN' ? 'unknown' : 'conflicted'}
                    {v.capacity !== null ? ` · capacity ${v.capacity} ${v.unit}, peak ${v.peakTotalDemand}` : ''}
                  </span>
                  {v.reason && <span className={styles.conflictWhy}>{v.reason}</span>}
                  {v.conflictDays.length > 0 && (
                    <span className={styles.conflictWhy}>Conflict on: {v.conflictDays.join(', ')}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className={styles.section}>
            <span className={styles.sectionTitle}>What accepting would change</span>
            <div className={styles.finishRow}>
              <span>Current finish <strong>{view.comparison.currentFinish ?? '—'}</strong></span>
              <span>Proposed finish <strong>{view.comparison.proposedFinish}</strong></span>
              <span>Tasks moved <strong>{view.comparison.movedCount}</strong></span>
            </div>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Task</th><th>Current</th><th>Proposed</th><th>Change</th></tr>
                </thead>
                <tbody>
                  {view.comparison.changes.map((c) => (
                    <tr key={c.taskId}>
                      <td>{c.name}</td>
                      <td><small>{c.currentStart ?? '—'} → {c.currentEnd ?? '—'}</small></td>
                      <td><small>{c.proposedStart ?? '—'} → {c.proposedEnd ?? '—'}</small></td>
                      <td className={CHANGE_CLASS[c.change]}>{CHANGE_LABEL[c.change]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!proposal.established && (
            <div className={styles.ack}>
              <span className={styles.sectionTitle}>Acknowledgement required</span>
              <span className={styles.statusLine}>
                This proposal is not established — a known conflict, or something that could not be judged.
                Accepting it anyway is permitted, but the reason is recorded.
              </span>
              <textarea
                value={ack} onChange={(e) => setAck(e.target.value)}
                placeholder="e.g. second crane hired for the day; overrun accepted"
                data-testid="ack-reason"
              />
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={styles.runBtn} onClick={accept}
              disabled={busy !== null || (!proposal.established && ack.trim() === '')}
              data-testid="accept-run"
            >
              <Check size={15} /> {busy === 'accept' ? 'Accepting…' : 'Accept — make it the plan'}
            </button>
            <button className={styles.ghostBtn} onClick={discard} disabled={busy !== null} data-testid="discard-run">
              <X size={15} /> Discard
            </button>
          </div>
        </>
      )}

      {history.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Run history</span>
          <div className={styles.history}>
            {history.slice(0, 8).map((r) => (
              <div key={r.id} className={styles.historyRow}>
                <span className={`${styles.dot} ${styles[r.status]}`} />
                <span>{new Date(r.ranAt).toLocaleString('en-AE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span>· {r.status}</span>
                <span>· {r.proposal.established ? 'established' : r.proposal.feasibility === 'CONFLICTED' ? 'conflicted' : 'not established'}</span>
                {r.acceptanceReason ? <span>· “{r.acceptanceReason}”</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
