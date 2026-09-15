'use client';

import { useMemo, useState } from 'react';
import { CalendarCheck2, Link2, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './resource-booking-client.module.css';

type Unit = 'hours' | 'persons' | 'crews' | 'units';
interface ResourceRef { resourceType: 'employee' | 'vehicle' | 'asset' | 'pool'; canonicalResourceId: string }
interface Requirement { id: string; resource: ResourceRef; quantity: number; unit: Unit }
interface Task { id: string; name: string; plannedStart: string; plannedEnd: string; requirements: Requirement[] }
interface CatalogItem { resourceType: ResourceRef['resourceType']; canonicalResourceId: string; label: string }
interface BookingView {
  booking: {
    id: string; taskId: string | null; requirementId: string | null; resource: ResourceRef; unit: Unit;
    quantity: number; from: string; to: string; status: 'held' | 'released'; capacityAtCommitment: number | null;
    demandAtCommitment: number; overCapacityReason: string | null; releasedReason: string | null;
  };
  assessment: { feasibility: 'AVAILABLE' | 'CONFLICTED' | 'UNKNOWN'; reason?: string; conflictDays: string[] };
  resourceConflict: { projectsInvolved: string[]; conflictDays: string[] };
}

export default function ResourceBookingClient({
  projectId, tasks, catalog, bookings,
}: { projectId: string; tasks: Task[]; catalog: CatalogItem[]; bookings: BookingView[] }) {
  const router = useRouter();
  const [requirementId, setRequirementId] = useState('');
  const [reason, setReason] = useState('');
  const [releaseReasons, setReleaseReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requirements = useMemo(() => tasks.flatMap((task) => task.requirements.map((requirement) => ({ task, requirement }))), [tasks]);
  const held = new Set(bookings.filter((item) => item.booking.status === 'held').map((item) => item.booking.requirementId));
  const available = requirements.filter((item) => !held.has(item.requirement.id));
  const label = (resource: ResourceRef) => catalog.find((item) => item.resourceType === resource.resourceType && item.canonicalResourceId === resource.canonicalResourceId)?.label ?? 'Unavailable resource';

  async function post(url: string, body: unknown): Promise<boolean> {
    setBusy(true); setError(null);
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || result?.error || 'Unable to update the resource commitment');
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update the resource commitment');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function commit(event: React.FormEvent) {
    event.preventDefault();
    if (await post(`/api/projects/${projectId}/resource-bookings`, { requirementId, overCapacityReason: reason || null })) {
      setRequirementId(''); setReason('');
    }
  }

  async function release(bookingId: string) {
    const releaseReason = releaseReasons[bookingId]?.trim();
    if (!releaseReason) { setError('Explain why this commitment is being released.'); return; }
    if (await post(`/api/projects/${projectId}/resource-bookings/${bookingId}/release`, { reason: releaseReason })) {
      setReleaseReasons((current) => ({ ...current, [bookingId]: '' }));
    }
  }

  return <div className={styles.stack}>
    {error && <div role="alert" className={styles.error}>{error}</div>}
    <div className={styles.summary}>
      <div><span>Activity demand</span><strong>{requirements.length}</strong></div>
      <div><span>Held commitments</span><strong>{bookings.filter((item) => item.booking.status === 'held').length}</strong></div>
      <div><span>Open conflicts</span><strong>{bookings.filter((item) => item.booking.status === 'held' && item.assessment.feasibility === 'CONFLICTED').length}</strong></div>
    </div>
    <form className={styles.commit} onSubmit={commit} data-testid="resource-booking-form">
      <div><CalendarCheck2 size={17} /><span><strong>Commit activity resources</strong><small>Select an authored demand line. AURA uses its saved resource, quantity and activity dates.</small></span></div>
      <label>Uncommitted demand<select required value={requirementId} onChange={(event) => setRequirementId(event.target.value)}><option value="">Select activity requirement…</option>{available.map(({ task, requirement }) => <option key={requirement.id} value={requirement.id}>{task.name} · {label(requirement.resource)} · {requirement.quantity} {requirement.unit} · {task.plannedStart} → {task.plannedEnd}</option>)}</select></label>
      <label>Capacity exception reason <span>(only needed if the commitment exceeds known capacity)</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Example: approved overtime or additional hire" /></label>
      <button type="submit" disabled={busy || available.length === 0}>Hold selected capacity</button>
    </form>
    <div className={styles.list}>
      {bookings.length === 0 && <div className={styles.empty}>No resource capacity is committed to this project yet.</div>}
      {bookings.map((view) => {
        const task = tasks.find((item) => item.id === view.booking.taskId);
        const tone = view.booking.status === 'released' ? 'released' : view.assessment.feasibility.toLowerCase();
        return <article key={view.booking.id} className={styles.booking} data-tone={tone}>
          <div className={styles.bookingHead}>
            <div><strong>{label(view.booking.resource)}</strong><small>{task?.name ?? 'Archived activity'} · {view.booking.quantity} {view.booking.unit}</small></div>
            <span>{view.booking.status === 'released' ? 'RELEASED' : view.assessment.feasibility}</span>
          </div>
          <div className={styles.lineage}><Link2 size={13} />{view.booking.from} → {view.booking.to} · demand {view.booking.demandAtCommitment} / capacity {view.booking.capacityAtCommitment ?? 'unknown'} at commitment</div>
          {view.assessment.reason && <p className={styles.reason}><TriangleAlert size={14} />{view.assessment.reason}</p>}
          {view.resourceConflict.projectsInvolved.length > 1 && <p className={styles.reason}><TriangleAlert size={14} />Shared-resource conflict involves {view.resourceConflict.projectsInvolved.length} projects on {view.resourceConflict.conflictDays.length} day(s).</p>}
          {view.booking.overCapacityReason && <small>Approved exception: {view.booking.overCapacityReason}</small>}
          {view.booking.releasedReason && <small>Release reason: {view.booking.releasedReason}</small>}
          {view.booking.status === 'held' && <div className={styles.release}><input aria-label={`Release reason ${view.booking.id}`} value={releaseReasons[view.booking.id] ?? ''} onChange={(event) => setReleaseReasons((current) => ({ ...current, [view.booking.id]: event.target.value }))} placeholder="Reason for releasing this capacity" /><button type="button" disabled={busy} onClick={() => release(view.booking.id)}>Release</button></div>}
        </article>;
      })}
    </div>
  </div>;
}
