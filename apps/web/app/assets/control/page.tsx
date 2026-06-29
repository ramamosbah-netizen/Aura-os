import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import AssetsControlClient from '../../../components/assets-control-client';

export const dynamic = 'force-dynamic';

interface Asset {
  id: string;
  tenantId: string;
  companyId: string | null;
  name: string;
  serialNumber: string;
  category: string;
  purchaseDate: string;
  purchaseCost: number;
  status: 'active' | 'maintenance' | 'inactive' | 'disposed';
  warrantyExpiry: string | null;
  nextCalibrationDate: string | null;
  nextInspectionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AssetMaintenance {
  id: string;
  tenantId: string;
  companyId: string | null;
  assetId: string;
  date: string;
  description: string;
  cost: number;
  status: 'scheduled' | 'completed';
  createdAt: string;
  updatedAt: string;
}

interface AssetInspection {
  id: string;
  tenantId: string;
  companyId: string | null;
  assetId: string;
  date: string;
  inspector: string;
  result: 'pass' | 'fail';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export default async function AssetsControlPage() {
  const [assets, maintenance, inspections] = await Promise.all([
    getJson<Asset[]>('/api/assets'),
    getJson<AssetMaintenance[]>('/api/assets/maintenance'),
    getJson<AssetInspection[]>('/api/assets/inspections'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Assets & Equipment</h1>
      <p style={st.sub}>
        Register corporate capital assets, track equipment depreciation, monitor warranties, schedule preventative maintenance, and record safety or calibration inspections.
      </p>

      <AssetsControlClient
        initialAssets={assets ?? []}
        initialMaintenance={maintenance ?? []}
        initialInspections={inspections ?? []}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};
