import { type Id, newId } from '@aura/shared';

/**
 * Client training and demonstration (TC-GATE-5).
 *
 * NOT the same authority as HSE training, and the distinction is load-bearing. HSE's records are
 * WORKER SAFETY training — our people, inductions, toolbox talks, competency to work on site.
 * This is the CLIENT's people being taught to operate the system they are about to own. Letting one
 * stand in for the other would mean a toolbox talk could satisfy a handover obligation.
 *
 * A session is only finished when the client says so. `completed` is our word for it; `acknowledged`
 * is theirs, and acknowledgement needs a named representative — an acknowledgement with nobody's
 * name on it is not one.
 *
 *   planned → completed → acknowledged
 *
 * `materialDocumentId` is a reference into DocControl, never a copy of the material.
 */
export type TrainingState = 'planned' | 'completed' | 'acknowledged';

export interface TrainingSession {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  /** The system trained on. Null for training that covers the project rather than one system. */
  commissioningId: Id | null;
  title: string;
  topics: string | null;
  trainer: string | null;
  sessionDate: string | null;
  durationMinutes: number | null;
  /** The client's own attendees, as recorded on the attendance sheet. */
  attendees: string | null;
  /** Recorded separately from the session itself, because a demonstration is not a talk. */
  demonstrationCompleted: boolean;
  state: TrainingState;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  materialDocumentId: string | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewTrainingSession {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  commissioningId?: Id | null;
  title: string;
  topics?: string | null;
  trainer?: string | null;
  sessionDate?: string | null;
  durationMinutes?: number | null;
  materialDocumentId?: string | null;
  createdBy?: Id | null;
}

export function makeTrainingSession(input: NewTrainingSession): TrainingSession {
  if (!input.title?.trim()) throw new Error('validation: title is required');
  if (input.durationMinutes != null && (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0)) {
    throw new Error('validation: durationMinutes must be a positive whole number of minutes');
  }
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    commissioningId: input.commissioningId ?? null,
    title: input.title.trim(),
    topics: input.topics?.trim() || null,
    trainer: input.trainer?.trim() || null,
    sessionDate: input.sessionDate?.trim() || null,
    durationMinutes: input.durationMinutes ?? null,
    attendees: null,
    demonstrationCompleted: false,
    state: 'planned',
    acknowledgedBy: null,
    acknowledgedAt: null,
    materialDocumentId: input.materialDocumentId?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Record that the session happened.
 *
 * Attendees are required: a training session nobody attended is a calendar entry, and the attendance
 * list is the evidence a client asks for months later when an operator says they were never shown.
 */
export function completeTraining(
  session: TrainingSession,
  input: { attendees: string; trainer?: string | null; demonstrationCompleted?: boolean; sessionDate?: string | null },
): TrainingSession {
  if (session.state !== 'planned') throw new Error(`only a planned session can be completed (this one is ${session.state})`);
  if (!input.attendees?.trim()) throw new Error('validation: the client attendees are required to complete a session');
  return {
    ...session,
    state: 'completed',
    attendees: input.attendees.trim(),
    trainer: input.trainer?.trim() || session.trainer,
    demonstrationCompleted: input.demonstrationCompleted ?? session.demonstrationCompleted,
    sessionDate: input.sessionDate?.trim() || session.sessionDate || new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
}

/** The client's own word that the training happened, with the name of whoever gave it. */
export function acknowledgeTraining(session: TrainingSession, input: { acknowledgedBy: string }): TrainingSession {
  if (session.state !== 'completed') throw new Error(`only a completed session can be acknowledged (this one is ${session.state})`);
  if (!input.acknowledgedBy?.trim()) throw new Error('validation: the acknowledging client representative is required');
  const now = new Date().toISOString();
  return {
    ...session,
    state: 'acknowledged',
    acknowledgedBy: input.acknowledgedBy.trim(),
    acknowledgedAt: now,
    updatedAt: now,
  };
}
