import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { fetchJson } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import { ProjectAreaRegister } from '@/components/project-area-register';
import { filterAreaRows, findArea } from '@/lib/project-areas';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown> & { id?: string; projectId?: string };

export default async function ProjectAreaPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; area: string }>;
  searchParams: Promise<{ discipline?: string }>;
}) {
  const [{ projectId, area: slug }, query] = await Promise.all([params, searchParams]);
  const area = findArea(slug);
  if (!area) notFound();

  const result = await fetchJson<Row[]>(area.endpoint);
  if (!result.ok) return <DataStateNotice error={result.error} subject={`${area.label.toLowerCase()} records`} />;
  const projectRows = (Array.isArray(result.data) ? result.data : []).filter((r) => r.projectId === projectId);
  const rows = filterAreaRows(projectRows, query.discipline);

  return (
    <div>
      <h1 style={st.h1}>
        <span style={{ marginRight: 8 }}>{area.icon}</span>
        {area.label}
        <span style={st.count}>{rows.length}</span>
      </h1>

      {query.discipline ? (
        <p style={st.scopeNote}>System lens is active. Project-wide records remain visible alongside matching system records.</p>
      ) : null}

      <ProjectAreaRegister
        areaLabel={area.label}
        entity={area.entity}
        columns={area.columns}
        rows={rows}
        rowHref={area.rowHref}
        statusKey={area.statusKey}
      />
    </div>
  );
}

const st = {
  h1: { fontSize: 22, margin: '0 0 16px', color: 'var(--accent)', display: 'flex', alignItems: 'center' } as CSSProperties,
  count: { marginLeft: 12, fontSize: 14, fontWeight: 700, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 10px' } as CSSProperties,
  scopeNote: { margin: '-8px 0 16px', color: 'var(--muted)', fontSize: 12 } as CSSProperties,
};
