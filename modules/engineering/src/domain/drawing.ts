import { type Id, newId } from '@aura/shared';
import { type Discipline, toDiscipline } from './discipline';

export type DrawingStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

export interface Drawing {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  title: string;
  revision: string;
  status: DrawingStatus;
  discipline: Discipline;
  projectId: Id;
  projectName: string | null;
  ownerId: Id | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewDrawing {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  title: string;
  revision?: string;
  status?: DrawingStatus;
  discipline?: Discipline;
  projectId: Id;
  projectName?: string | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeDrawing(input: NewDrawing): Drawing {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    revision: input.revision?.trim() || '0',
    status: input.status ?? 'draft',
    discipline: toDiscipline(input.discipline),
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    ownerId: input.ownerId ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export const ENGINEERING_EVENT = {
  drawingCreated: 'engineering.drawing.created',
  drawingRevised: 'engineering.drawing.revised',
  rfiRaised: 'engineering.rfi.raised',
  rfiAnswered: 'engineering.rfi.answered',
  submittalCreated: 'engineering.submittal.created',
  submittalStatusChanged: 'engineering.submittal.status_changed',
  tqRaised: 'engineering.tq.raised',
  tqResponded: 'engineering.tq.responded',
} as const;
