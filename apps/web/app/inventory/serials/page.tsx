import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SerialsClient from '../../../components/serials-client';

export const dynamic = 'force-dynamic';

interface Project { id: string; title: string }
interface SerialUnit {
  id: string; serialNumber: string; itemCode: string; itemName: string; warehouse: string | null;
  status: 'in_stock' | 'issued' | 'installed' | 'returned' | 'faulty';
  projectId: string | null; projectName: string | null; location: string | null;
  installedAt: string | null; warrantyStartDate: string | null; warrantyMonths: number | null; notes: string | null;
}

export default async function SerialsPage() {
  const [serials, projects] = await Promise.all([
    getJson<SerialUnit[]>('/api/inventory/serials'),
    getJson<Project[]>('/api/projects/projects'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Inventory · Serial Tracking</h1>
      <p style={st.sub}>
        The per-unit device ledger. Register each serialised ELV item on receipt, then track it
        from stock → issued to a project → installed (with its warranty clock) → returned or faulty.
        This is what warranty claims, asset registers, replacements and recalls key off.
      </p>
      <SerialsClient initialSerials={serials ?? []} projects={projects ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
};
