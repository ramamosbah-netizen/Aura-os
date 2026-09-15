'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CircleAlert, CircleCheck, CircleHelp } from 'lucide-react';
import styles from './look-ahead-panel.module.css';

/**
 * The next few weeks of a programme — what must happen, what it needs, and what is not ready.
 *
 * DERIVED on every read and stored nowhere, which is the whole point: a look-ahead kept as its own
 * document disagrees with the programme the first time anybody extends an activity, and the site
 * meeting is then held against a plan that no longer exists. Nothing on this panel is authored.
 *
 * READY IS ESTABLISHED, NEVER ASSUMED — an activity whose capacity nobody declared reads UNKNOWN
 * rather than ready, and the reason is printed in words. A panel that rounded "we could not find a
 * problem" up to "no problem" would send a crew to a site that is not open.
 */

interface LookAheadRequirement {
  id: string;
  resourceType: string;
  canonicalResourceId: string;
  quantity: number;
  unit: string;
  committed: boolean;
  feasibility: 'AVAILABLE' | 'CONFLICTED' | 'UNKNOWN' | null;
}

interface LookAheadActivity {
  taskId: string;
  name: string;
  wbsNodeId: string | null;
  plannedStart: string;
  plannedEnd: string;
  workingDaysInWindow: number;
  startsInWindow: boolean;
  requirements: LookAheadRequirement[];
  waitsFor: Array<{ taskId: string; name: string; plannedEnd: string; clearsInTime: boolean }>;
  readiness: 'READY' | 'NOT_READY' | 'UNKNOWN';
  reasons: string[];
}

interface Forecast {
  baselineFinish: string | null;
  plannedFinish: string | null;
  forecastFinish: string | null;
  varianceWorkingDays: number | null;
  planOptimismWorkingDays: number | null;
  confidence: 'MEASURED' | 'PARTLY_MEASURED' | 'DECLARED' | 'UNKNOWN';
  measuredDrivers: number;
  driverCount: number;
  contributors: Array<{
    taskId: string; name: string; remainingWorkingDays: number | null;
    percentComplete: number; measured: boolean; forecastFinish: string | null;
  }>;
  unknownReason: string | null;
}

interface LookAhead {
  from: string;
  to: string;
  weeks: number;
  workingDays: number;
  calendarName: string | null;
  everyDayWorked: boolean;
  activities: LookAheadActivity[];
  packages: Array<{
    wbsNodeId: string;
    plannedQuantity: number | null;
    installedQuantity: number | null;
    unit: string | null;
    activityIds: string[];
  }>;
}

const READINESS: Record<LookAheadActivity['readiness'], { label: string; className: string }> = {
  READY: { label: 'Ready', className: 'ready' },
  NOT_READY: { label: 'Not ready', className: 'notReady' },
  UNKNOWN: { label: 'Not established', className: 'unknown' },
};

export default function LookAheadPanel({ projectId, wbsNodes = [] }: {
  projectId: string;
  wbsNodes?: Array<{ id: string; code: string; title: string }>;
}) {
  const [weeks, setWeeks] = useState(3);
  const [lookAhead, setLookAhead] = useState<LookAhead | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (forWeeks: number) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/projects/schedules/${projectId}/look-ahead?weeks=${forWeeks}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || result?.error || 'Could not read the look-ahead');
      setLookAhead(result as LookAhead);
    } catch (e: unknown) {
      // The panel says it could not answer rather than rendering an empty week, which would read
      // as "nothing is due" — the one thing a look-ahead must never say by accident.
      setError(e instanceof Error ? e.message : 'Could not read the look-ahead');
      setLookAhead(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(weeks); }, [load, weeks]);

  // Where the whole programme lands, beside the next few weeks of it: the same question over a
  // different horizon, and a planner reading one wants the other.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch(`/api/projects/schedules/${projectId}/forecast`, { cache: 'no-store' });
        if (live) setForecast(response.ok ? ((await response.json()) as Forecast) : null);
      } catch { if (live) setForecast(null); }
    })();
    return () => { live = false; };
  }, [projectId]);

  const packageLabel = (nodeId: string) => {
    const node = wbsNodes.find((candidate) => candidate.id === nodeId);
    return node ? `${node.code} · ${node.title}` : 'Work package record unavailable';
  };

  return (
    <section className={styles.panel} data-testid="look-ahead-panel">
      <header className={styles.head}>
        <span className={styles.icon}><CalendarClock size={16} /></span>
        <div className={styles.headMain}>
          <strong>Look-ahead</strong>
          <span className={styles.meta}>
            {lookAhead
              ? `${lookAhead.from} to ${lookAhead.to} · ${lookAhead.workingDays} working days · ${lookAhead.everyDayWorked ? 'no calendar named, every day counted' : lookAhead.calendarName}`
              : 'Reading the programme…'}
          </span>
        </div>
        <label className={styles.weeks}>
          <span>Weeks</span>
          <select aria-label="Look-ahead length in weeks" value={weeks} onChange={(event) => setWeeks(Number(event.target.value))}>
            {[2, 3, 4, 6].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </header>

      {forecast && (
        <div className={styles.forecast} data-testid="forecast-panel">
          {/* THREE DATES, never conflated: committed, planned, and where the work is heading. */}
          <div className={styles.forecastRow}>
            <span>Baseline <strong>{forecast.baselineFinish ?? 'not committed'}</strong></span>
            <span>Planned <strong>{forecast.plannedFinish ?? '—'}</strong></span>
            <span data-testid="forecast-finish">
              Forecast <strong>{forecast.forecastFinish ?? '—'}</strong>
            </span>
            <span
              data-testid="forecast-variance"
              className={(forecast.varianceWorkingDays ?? 0) > 0 ? styles.late : undefined}
            >
              {forecast.varianceWorkingDays === null ? 'Nothing committed to measure against'
                : forecast.varianceWorkingDays === 0 ? 'On the committed date'
                : forecast.varianceWorkingDays > 0 ? `${forecast.varianceWorkingDays} working days late`
                : `${Math.abs(forecast.varianceWorkingDays)} working days early`}
            </span>
          </div>
          {/* The confidence is part of the answer, not a footnote: a date resting on declared
              progress is a guess wearing a projection's clothes. */}
          <small className={styles.meta} data-testid="forecast-confidence">
            {forecast.confidence === 'UNKNOWN'
              ? `No forecast can be made · ${forecast.unknownReason ?? 'not enough is known'}`
              : `${forecast.measuredDrivers} of ${forecast.driverCount} activities driving this date carry measured progress`}
          </small>
          {forecast.contributors.length > 0 && (
            <div className={styles.contributors}>
              {forecast.contributors.map((contributor) => (
                <span key={contributor.taskId} data-testid={`forecast-driver-${contributor.taskId}`}>
                  {contributor.name} · {contributor.remainingWorkingDays ?? '—'} day
                  {contributor.remainingWorkingDays === 1 ? '' : 's'} left
                  {contributor.measured ? ' · measured' : ' · declared'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className={styles.error} role="alert">{error}</div>}
      {!error && !loading && lookAhead?.activities.length === 0 && (
        <p className={styles.empty}>No activity in the programme falls inside this window.</p>
      )}

      {lookAhead && lookAhead.activities.length > 0 && (
        <ol className={styles.activities}>
          {lookAhead.activities.map((activity) => {
            const verdict = READINESS[activity.readiness];
            return (
              <li key={activity.taskId} className={styles.activity} data-testid={`look-ahead-${activity.taskId}`}>
                <div className={styles.activityHead}>
                  <span className={`${styles.badge} ${styles[verdict.className]}`} data-testid={`readiness-${activity.taskId}`}>
                    {activity.readiness === 'READY' ? <CircleCheck size={13} /> : activity.readiness === 'UNKNOWN' ? <CircleHelp size={13} /> : <CircleAlert size={13} />}
                    {verdict.label}
                  </span>
                  <strong>{activity.name}</strong>
                  <span className={styles.meta}>
                    {activity.plannedStart} → {activity.plannedEnd} · {activity.workingDaysInWindow} working day
                    {activity.workingDaysInWindow === 1 ? '' : 's'} in this window
                    {activity.startsInWindow ? '' : ' · carried in'}
                  </span>
                </div>
                {activity.reasons.length > 0 && (
                  <ul className={styles.reasons} data-testid={`reasons-${activity.taskId}`}>
                    {activity.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                )}
                {activity.requirements.length > 0 && (
                  <div className={styles.requirements}>
                    {activity.requirements.map((requirement) => (
                      <span key={requirement.id} className={requirement.committed ? styles.committed : styles.uncommitted}>
                        {requirement.quantity} {requirement.unit} · {requirement.resourceType}
                        {requirement.committed ? ` · ${requirement.feasibility?.toLowerCase() ?? 'committed'}` : ' · not committed'}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {lookAhead && lookAhead.packages.length > 0 && (
        <div className={styles.packages}>
          <span className={styles.packagesTitle}>Scope in this window, by work package</span>
          {/* ONE row per package, however many activities deliver it: each activity reads that
              package's whole sold quantity, so a per-activity total would report the same scope
              twice. Until an apportionment authority exists, the activities are named instead. */}
          {lookAhead.packages.map((row) => (
            <div key={row.wbsNodeId} className={styles.packageRow} data-testid={`look-ahead-package-${row.wbsNodeId}`}>
              <span>{packageLabel(row.wbsNodeId)}</span>
              <small>
                {row.plannedQuantity === null
                  ? 'No award line behind this package'
                  : row.installedQuantity === null
                    ? `${row.plannedQuantity}${row.unit ? ` ${row.unit}` : ''} sold · nothing measured yet`
                    : `${row.installedQuantity} of ${row.plannedQuantity}${row.unit ? ` ${row.unit}` : ''} installed`}
                {row.activityIds.length > 1 ? ` · ${row.activityIds.length} activities in this window` : ''}
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
