import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import QualityControlClient from '../../../components/quality-control-client';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface Ncr {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  ncrNumber: string;
  description: string;
  rootCause: string | null;
  proposedCorrection: string | null;
  severity: 'minor' | 'major';
  status: 'raised' | 'corrected' | 'closed';
  raisedBy: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InspectionRequest {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  irNumber: string;
  discipline: 'civil' | 'mechanical' | 'electrical' | 'plumbing';
  locationDetail: string;
  inspectionDate: string;
  status: 'requested' | 'approved' | 'rejected';
  inspectedBy: string | null;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Snag {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  description: string;
  locationDetail: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved' | 'closed';
  assignedTo: string | null;
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChecklistItem {
  question: string;
  standard: string;
  status: 'pending' | 'compliant' | 'non_compliant' | 'not_applicable';
  findings: string | null;
  ncrId: string | null;
}

interface AuditSchedule {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  auditNumber: string;
  auditType: string;
  scheduledDate: string;
  auditorName: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

export default async function QualityControlPage() {
  const [ncrs, inspections, snags, projects, audits] = await Promise.all([
    getJson<Ncr[]>('/api/quality/ncrs'),
    getJson<InspectionRequest[]>('/api/quality/irs'),
    getJson<Snag[]>('/api/quality/snags'),
    getJson<Project[]>('/api/projects/projects'),
    getJson<AuditSchedule[]>('/api/quality/audits'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Quality Control (QA/QC)</h1>
      <p style={st.sub}>
        Quality Assurance & Quality Control panel. Log and correct Non-Conformance Reports (NCR), request formal field inspections (IR), and manage snags.
      </p>

      <QualityControlClient
        initialNcrs={ncrs ?? []}
        initialInspections={inspections ?? []}
        initialSnags={snags ?? []}
        projects={projects ?? []}
        initialAudits={audits ?? []}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};
