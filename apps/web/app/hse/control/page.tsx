import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import HseControlClient from '../../../components/hse-control-client';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface HseIncident {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  severity: 'near_miss' | 'minor' | 'major' | 'fatal';
  description: string;
  locationDetail: string;
  status: 'reported' | 'investigating' | 'closed';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PermitToWork {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  permitType: 'hot_work' | 'confined_space' | 'height_work' | 'electrical' | 'excavation';
  validFrom: string;
  validTo: string;
  description: string;
  status: 'draft' | 'requested' | 'approved' | 'expired' | 'closed';
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CapaAction {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  sourceType: 'incident' | 'audit' | 'inspection';
  sourceId: string | null;
  actionRequired: string;
  assignedTo: string | null;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SafetyTrainingRecord {
  id: string;
  tenantId: string;
  companyId: string | null;
  workerName: string;
  workerId: string;
  inductionDate: string;
  cardNumber: string | null;
  cardExpiry: string | null;
  certifications: string[];
  status: 'valid' | 'expired';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export default async function HseControlPage() {
  const [incidents, permits, capas, trainingRecords, projects] = await Promise.all([
    getJson<HseIncident[]>('/api/hse/incidents'),
    getJson<PermitToWork[]>('/api/hse/ptws'),
    getJson<CapaAction[]>('/api/hse/capas'),
    getJson<SafetyTrainingRecord[]>('/api/hse/training'),
    getJson<Project[]>('/api/projects/projects'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>HSE Control</h1>
      <p style={st.sub}>
        Health, Safety, and Environment monitoring. Track incidents, Permits to Work (PTW), Corrective and Preventive Actions (CAPA), and Safety Training Matrix.
      </p>

      <HseControlClient
        initialIncidents={incidents ?? []}
        initialPermits={permits ?? []}
        initialCapas={capas ?? []}
        initialTrainingRecords={trainingRecords ?? []}
        projects={projects ?? []}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};
