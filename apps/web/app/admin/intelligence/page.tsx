import type { Metadata } from 'next';
import { getJson } from '@/lib/api';
import IntelligencePanel from '../../../components/intelligence-panel';

export const metadata: Metadata = {
  title: 'Platform · Intelligence Console',
  description: 'IEC Pricing Engine and Autonomy Engine — AI-driven calibration and proposal management.',
};

interface Calibration {
  id: string;
  itemCode: string;
  description: string | null;
  calibratedPrice: number;
  realityGap: number;
  sourceCount: number;
  avgTrustScore: number;
  currency: string;
  calibratedAt: string;
}

interface Proposal {
  id: string;
  title: string;
  description: string | null;
  category: string;
  severity: string;
  mode: string;
  targetModule: string | null;
  targetAction: string | null;
  valueAmount: number | null;
  status: string;
  decidedBy: string | null;
  createdAt: string;
}

export default async function IntelligencePage() {
  const [calibrations, proposals] = await Promise.all([
    getJson<Calibration[]>('/api/intelligence/calibrations'),
    getJson<Proposal[]>('/api/intelligence/proposals'),
  ]);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: 'var(--text)' }}>
        ⚡ Intelligence Console
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 24px' }}>
        IEC closed-loop pricing calibrator and autonomous proposal management
      </p>

      <IntelligencePanel
        initialCalibrations={calibrations ?? []}
        initialProposals={proposals ?? []}
      />
    </div>
  );
}
