import { type Id, newId } from '@aura/shared';
import { type Discipline, toDiscipline } from './discipline';

// Engineering domain — framework-free. A Technical Query (TQ) is raised by the contractor to
// the consultant/designer seeking a design clarification or decision. Distinct from an RFI
// (information request): a TQ carries a discipline, priority, drawing reference and flags a
// potential cost/time impact, and closes on a formal response.
//
// §22 — THE RESPONSE IS THE CAPABILITY (ENG-03), and it is an ACT, not a field.
//
// A TQ response is a formal design decision that site then builds to. Three things follow, and none
// of them held before:
//
//   IT IS ATTRIBUTABLE.  `respondedBy` is part of the record, not only of the event log. Reading a
//                        TQ you are about to build to and not being able to see who decided it is
//                        the same defect as a baseline with no author (PLN-05).
//
//   SUPERSEDING ONE COSTS A REASON, AND KEEPS THE OLD ONE.  The first answer is free; replacing one
//                        is not. A design answer that changes after the contractor has built to it
//                        is the single most consequential thing on a TQ to overwrite silently — the
//                        superseded text is kept as a revision so "what were we told in March" stays
//                        answerable.
//
//   THE LOOP CLOSES.     `closed` was in the status union and nothing could ever reach it, so every
//                        TQ ever raised sat at `responded` for ever and nothing recorded whether the
//                        answer was actually adequate. Closing is the RAISER's act, not the
//                        responder's: the person who gave the answer must not also be the one who
//                        declares it good enough.

export type TqStatus = 'open' | 'responded' | 'closed';
export type TqPriority = 'low' | 'medium' | 'high';
/** @deprecated use the canonical {@link Discipline} (ADR-0012); kept as an alias for callers. */
export type TqDiscipline = Discipline;

export interface TechnicalQuery {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  title: string;
  query: string;
  response: string | null;
  status: TqStatus;
  priority: TqPriority;
  discipline: TqDiscipline;
  drawingReference: string | null;
  costImpact: boolean;
  timeImpact: boolean;
  projectId: Id;
  projectName: string | null;
  /** The canonical drawing this query is about, when it is about one. */
  drawingId: Id | null;
  assignedTo: string | null;
  respondedAt: string | null;
  /** WHO gave the design decision. Part of the record, not only of the event log. */
  respondedBy: Id | null;
  /** How many times the answer has been replaced. 0 is the original. */
  responseRevision: number;
  /** Closed by the raising side once the answer is adequate to build to. */
  closedAt: string | null;
  closedBy: Id | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One answer, by value, as it stood when it was given.
 *
 * Kept so replacing an answer ADDS a revision rather than destroying one: a TQ answered in March
 * and re-answered in June must still be able to say what site was told in March, because that is
 * what they built.
 */
export interface TqResponseRevision {
  revision: number;
  response: string;
  respondedAt: string;
  respondedBy: Id | null;
  /** Required from revision 1 onwards: giving the first answer needs no justification, replacing one does. */
  supersededReason: string | null;
}

export interface NewTechnicalQuery {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  title: string;
  query: string;
  status?: TqStatus;
  priority?: TqPriority;
  discipline?: TqDiscipline;
  drawingReference?: string | null;
  costImpact?: boolean;
  timeImpact?: boolean;
  projectId: Id;
  projectName?: string | null;
  drawingId?: Id | null;
  assignedTo?: string | null;
  createdBy?: Id | null;
}

export function makeTechnicalQuery(input: NewTechnicalQuery): TechnicalQuery {
  if (!input.code?.trim()) throw new Error('a technical query must carry a code');
  if (!input.query?.trim()) throw new Error('a technical query must state what is being asked');
  // A TQ cannot be BORN answered. `status` is accepted so a caller can round-trip a record, but a
  // query created as `responded` or `closed` would carry a status its own empty response field
  // contradicts — a record that lies about itself from the moment it exists.
  if (input.status && input.status !== 'open') {
    throw new Error('a technical query is raised open; it can only become responded by being answered');
  }
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    query: input.query.trim(),
    response: null,
    status: input.status ?? 'open',
    priority: input.priority ?? 'medium',
    discipline: toDiscipline(input.discipline),
    drawingReference: input.drawingReference?.trim() || null,
    costImpact: input.costImpact ?? false,
    timeImpact: input.timeImpact ?? false,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    drawingId: input.drawingId ?? null,
    assignedTo: input.assignedTo ?? null,
    respondedAt: null,
    respondedBy: null,
    responseRevision: 0,
    closedAt: null,
    closedBy: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Record the design decision (open → responded), or replace one that already stands.
 *
 * GIVING THE FIRST ANSWER IS FREE; REPLACING ONE COSTS A SENTENCE. Site builds to a TQ response, so
 * an answer that changes silently means work was done to an instruction that no longer exists
 * anywhere — and nobody can tell, because the field simply holds different text. Superseding
 * therefore requires a reason and returns the revision it displaced, so the caller can keep it.
 *
 * REFUSES A CLOSED QUERY. Once the raiser has accepted an answer as adequate and closed the loop,
 * changing it underneath them would rewrite a decision they have already acted on. Reopening is a
 * separate act somebody has to choose.
 */
export function respondToQuery(
  tq: TechnicalQuery,
  input: { response: string; by?: Id | null; supersededReason?: string | null },
): { query: TechnicalQuery; superseded: TqResponseRevision | null } {
  const response = input.response?.trim();
  if (!response) throw new Error('a technical query response cannot be empty');
  if (tq.status === 'closed') {
    // Worded for what this system actually offers. It said "reopen it first", and no reopen exists
    // anywhere — a sentence promising a capability that is not there, which is the same defect as a
    // screen offering a button that does nothing. Raising a new query against the superseding
    // decision is what a contract administrator does here, and it keeps the accepted one intact.
    throw new Error(
      `technical query ${tq.code} is closed and its answer can only be superseded by raising a new query, because it has been accepted and built to`,
    );
  }
  const replacing = tq.response !== null;
  const reason = input.supersededReason?.trim() || null;
  if (replacing && !reason) {
    throw new Error(
      `technical query ${tq.code} has already been answered; replacing a design response requires a reason, because site builds to it`,
    );
  }
  const now = new Date().toISOString();
  // What is being displaced, captured BY VALUE before it is overwritten.
  const superseded: TqResponseRevision | null = replacing
    ? {
      revision: tq.responseRevision,
      response: tq.response!,
      respondedAt: tq.respondedAt!,
      respondedBy: tq.respondedBy,
      supersededReason: reason,
    }
    : null;
  return {
    query: {
      ...tq,
      response,
      status: 'responded',
      respondedAt: now,
      respondedBy: input.by ?? null,
      responseRevision: replacing ? tq.responseRevision + 1 : 0,
      updatedAt: now,
    },
    superseded,
  };
}

/**
 * Close the loop: the raising side accepts the answer as adequate to build to.
 *
 * THE RESPONDER MUST NOT CLOSE THEIR OWN ANSWER. Declaring a design decision adequate is the
 * judgement of whoever has to build to it, and collapsing both into one person turns the whole
 * exchange into a note somebody wrote to themselves. The permission separates the two as well; this
 * refuses it even where both permissions happen to be held.
 *
 * REFUSES AN UNANSWERED QUERY: there is nothing to accept, and a TQ closed without a response is a
 * question that was abandoned rather than resolved — a different fact, and one worth not disguising.
 */
export function closeQuery(tq: TechnicalQuery, input: { by: Id; at?: string }): TechnicalQuery {
  if (tq.status === 'closed') throw new Error(`technical query ${tq.code} is closed`);
  if (!tq.response) {
    throw new Error(
      `technical query ${tq.code} has no response, so there is nothing to accept — it can only be closed once it has been answered`,
    );
  }
  if (tq.respondedBy && tq.respondedBy === input.by) {
    // Worded with "only ... can" so the global filter classifies it as the 409 state conflict it
    // is: the request is well formed, and it is who this actor IS relative to the record that
    // forbids it.
    throw new Error('only somebody other than the person who answered a technical query can declare that answer adequate');
  }
  const now = input.at ?? new Date().toISOString();
  return { ...tq, status: 'closed', closedAt: now, closedBy: input.by, updatedAt: now };
}
