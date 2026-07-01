import { type Id, newId } from '@aura/shared';

// Engineering domain — framework-free. A Technical Query (TQ) is raised by the contractor to
// the consultant/designer seeking a design clarification or decision. Distinct from an RFI
// (information request): a TQ carries a discipline, priority, drawing reference and flags a
// potential cost/time impact, and closes on a formal response.

export type TqStatus = 'open' | 'responded' | 'closed';
export type TqPriority = 'low' | 'medium' | 'high';
export type TqDiscipline = 'architectural' | 'structural' | 'mep' | 'elv' | 'civil' | 'other';

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
  assignedTo: string | null;
  respondedAt: string | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
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
  assignedTo?: string | null;
  createdBy?: Id | null;
}

export function makeTechnicalQuery(input: NewTechnicalQuery): TechnicalQuery {
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
    discipline: input.discipline ?? 'other',
    drawingReference: input.drawingReference?.trim() || null,
    costImpact: input.costImpact ?? false,
    timeImpact: input.timeImpact ?? false,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    assignedTo: input.assignedTo ?? null,
    respondedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Record the consultant's response (moves open → responded). */
export function respondToQuery(tq: TechnicalQuery, response: string): TechnicalQuery {
  return { ...tq, response: response.trim(), status: 'responded', respondedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
