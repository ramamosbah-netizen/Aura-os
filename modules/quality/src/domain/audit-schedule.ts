import { randomUUID } from 'node:crypto';

export interface ChecklistItem {
  question: string;
  standard: string;
  status: 'pending' | 'compliant' | 'non_compliant' | 'not_applicable';
  findings: string | null;
  ncrId: string | null;
}

export interface AuditSchedule {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  auditNumber: string;
  auditType: string;
  scheduledDate: string; // YYYY-MM-DD
  auditorName: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface NewAuditSchedule {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  auditNumber: string;
  auditType: string;
  scheduledDate: string;
  auditorName: string;
  checklist?: ChecklistItem[];
}

export function makeAuditSchedule(input: NewAuditSchedule): AuditSchedule {
  const now = new Date().toISOString();
  
  const defaultChecklist: ChecklistItem[] = [
    {
      question: 'Are all drawing registers and documents approved before production use?',
      standard: 'ISO 9001 Section 7.5.3',
      status: 'pending',
      findings: null,
      ncrId: null,
    },
    {
      question: 'Is material approval workflow verified for all critical construction supplies?',
      standard: 'ISO 9001 Section 8.4',
      status: 'pending',
      findings: null,
      ncrId: null,
    },
    {
      question: 'Are safety training matrices valid and workers certified for hazards?',
      standard: 'ISO 45001 Section 7.2',
      status: 'pending',
      findings: null,
      ncrId: null,
    },
    {
      question: 'Are equipment calibrations validated and within active due dates?',
      standard: 'ISO 9001 Section 7.1.5',
      status: 'pending',
      findings: null,
      ncrId: null,
    },
  ];

  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    auditNumber: input.auditNumber.trim(),
    auditType: input.auditType.trim(),
    scheduledDate: input.scheduledDate,
    auditorName: input.auditorName.trim(),
    status: 'scheduled',
    checklist: input.checklist && input.checklist.length > 0 ? input.checklist : defaultChecklist,
    createdAt: now,
    updatedAt: now,
  };
}

export const QUALITY_AUDIT_EVENT = {
  created: 'quality.audit.created',
  completed: 'quality.audit.completed',
} as const;
