import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import ItpClient from '../../../components/itp-client';

export const dynamic = 'force-dynamic';

interface ItpPoint { activity: string; pointType: string; acceptanceCriteria: string; result: string }
interface Itp {
  id: string;
  projectId: string;
  reference: string;
  title: string;
  discipline: string;
  status: string;
  points: ItpPoint[];
  kind?: string;
}

export default async function ItpPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  // Carried to the API, not applied here: an unscoped read is REFUSED for a project member, so
  // filtering afterwards never gets the chance to run.
  const { projectId } = await searchParams;
  const scope = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const all = await getJson<Itp[]>(`/api/quality/itps${scope}`);
  // Installation inspection plans only. A system commissioning checklist shares the register but is
  // governed differently — revisions, independent approval — and lives on its own page, so neither
  // is ever read as the other.
  const itps = all === null ? null : all.filter((i) => (i.kind ?? 'installation_inspection') === 'installation_inspection');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Quality · Inspection &amp; Test Plans</h1>
      <p style={st.sub}>
        ITPs define the inspection points per work activity — Hold / Witness / Review / Surveillance —
        with acceptance criteria. Build the plan, activate it, sign off each point pass/fail, then close
        once every point is resolved. The checklists a system is commissioned against are on{' '}
        <a href="/quality/system-checklists" style={{ color: 'var(--accent)' }}>System commissioning checklists</a>.
      </p>
      <section style={{ marginTop: 10 }}>
        {itps === null ? <p style={st.muted}>API offline.</p> : <ItpClient initialItps={itps ?? []} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
