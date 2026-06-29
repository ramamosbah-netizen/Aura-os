import { randomUUID } from 'node:crypto';

/**
 * Toolbox Talk — the short, daily pre-work safety briefing recorded on every UAE site (a core
 * HSE compliance artefact, separate from incidents/permits/CAPA). Captures the topic, who ran it,
 * the project, date, attendee headcount, and notes — the evidence trail an HSE audit asks for.
 */
export interface ToolboxTalk {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  topic: string;
  conductedBy: string;
  talkDate: string; // YYYY-MM-DD
  attendeeCount: number;
  notes: string;
  createdBy: string | null;
  createdAt: string;
}

export interface NewToolboxTalk {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  topic: string;
  conductedBy: string;
  talkDate: string;
  attendeeCount: number;
  notes?: string;
  createdBy?: string | null;
}

export function makeToolboxTalk(input: NewToolboxTalk): ToolboxTalk {
  if (!input.projectId) throw new Error('projectId is required');
  if (!input.topic?.trim()) throw new Error('topic is required');
  if (!input.conductedBy?.trim()) throw new Error('conductedBy is required');
  if (!input.talkDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.talkDate)) throw new Error('talkDate must be YYYY-MM-DD');
  const attendeeCount = Number(input.attendeeCount);
  if (!Number.isInteger(attendeeCount) || attendeeCount < 1) throw new Error('attendeeCount must be a positive integer');

  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    topic: input.topic.trim(),
    conductedBy: input.conductedBy.trim(),
    talkDate: input.talkDate,
    attendeeCount,
    notes: input.notes?.trim() || '',
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

export const TOOLBOX_TALK_EVENT = {
  recorded: 'hse.toolbox_talk.recorded',
} as const;
