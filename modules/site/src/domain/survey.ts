import { type Id, newId } from '@aura/shared';

export type SurveyStatus = 'draft' | 'completed' | 'cancelled';

export interface SiteSurvey {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** Offline field engine identifiers */
  clientEntityId: string | null;
  operationId: string | null;
  reference: string;
  accountId: Id | null;
  accountName: string | null;
  siteAddress: string;
  contactName: string | null;
  scopeNotes: string;
  estimatedValue: number;
  surveyDate: string;
  photos: string[];
  status: SurveyStatus;
  createdBy: Id | null;
  createdAt: string;
}

export interface NewSiteSurvey {
  tenantId: Id;
  companyId?: Id | null;
  clientEntityId?: string | null;
  operationId?: string | null;
  reference?: string | null;
  accountId?: Id | null;
  accountName?: string | null;
  siteAddress: string;
  contactName?: string | null;
  scopeNotes: string;
  estimatedValue?: number;
  surveyDate?: string;
  photos?: string[];
  status?: SurveyStatus;
  createdBy?: Id | null;
}

export function makeSiteSurvey(input: NewSiteSurvey): SiteSurvey {
  const id = newId();
  return {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    clientEntityId: input.clientEntityId ?? null,
    operationId: input.operationId ?? null,
    reference: input.reference?.trim() || `SURV-${id.slice(0, 8)}`,
    accountId: input.accountId ?? null,
    accountName: input.accountName?.trim() || null,
    siteAddress: input.siteAddress.trim(),
    contactName: input.contactName?.trim() || null,
    scopeNotes: input.scopeNotes.trim(),
    estimatedValue: Number.isFinite(input.estimatedValue) ? Number(input.estimatedValue) : 0,
    surveyDate: input.surveyDate || new Date().toISOString().slice(0, 10),
    photos: input.photos || [],
    status: input.status || 'completed',
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

export const SITE_SURVEY_EVENT = {
  created: 'site.survey.created',
  completed: 'site.survey.completed',
} as const;
