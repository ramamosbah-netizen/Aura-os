import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SiteControlClient from '../../../components/site-control-client';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface DailyReport {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  workDescription: string;
  manpowerCount: number;
  equipmentCount: number;
  status: 'draft' | 'submitted';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DelayLog {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  delayType: 'weather' | 'material' | 'access' | 'drawings' | 'other';
  description: string;
  impactHours: number;
  status: 'logged' | 'resolved';
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MaterialConsumption {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  itemId: string;
  itemName: string;
  quantityConsumed: number;
  unit: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export default async function SiteControlPage() {
  const [dailyReports, delayLogs, materialConsumption, projects] = await Promise.all([
    getJson<DailyReport[]>('/api/site/daily-reports'),
    getJson<DelayLog[]>('/api/site/delay-logs'),
    getJson<MaterialConsumption[]>('/api/site/material-consumption'),
    getJson<Project[]>('/api/projects/projects'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Site Control</h1>
      <p style={st.sub}>
        Operational site journals, diary entries, delay management, and material consumption tracking.
      </p>

      <SiteControlClient
        initialDailyReports={dailyReports ?? []}
        initialDelayLogs={delayLogs ?? []}
        initialMaterialConsumption={materialConsumption ?? []}
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
