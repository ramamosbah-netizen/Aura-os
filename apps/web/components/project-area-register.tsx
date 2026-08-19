'use client';

import AuraDataTable, { type AuraColumn, type FacetFilter } from '@/components/ui/aura-data-table';
import type { AreaColumn } from '@/lib/project-areas';

export type ProjectAreaRegisterRow = Record<string, unknown> & { id?: string };

export function ProjectAreaRegister({
  areaLabel,
  entity,
  columns,
  rows,
  rowHref,
  statusKey,
}: {
  areaLabel: string;
  entity: string;
  columns: AreaColumn[];
  rows: ProjectAreaRegisterRow[];
  rowHref?: string;
  statusKey: string;
}) {
  const tableColumns: AuraColumn<ProjectAreaRegisterRow>[] = columns.map((column, index) => ({
    key: column.key,
    label: column.label,
    priority: index === 0 ? 'primary' : column.kind === 'date' ? 'muted' : 'secondary',
    sortable: true,
    render: (row) => renderCell(row[column.key], column),
  }));

  const statuses = Array.from(new Set(rows.map((row) => String(row[statusKey] ?? '')).filter(Boolean))).sort();
  const filters: FacetFilter[] = statuses.length > 1
    ? [{ key: statusKey, label: 'Status', options: statuses.map((status) => ({ value: status, label: humanise(status) })) }]
    : [];

  return (
    <AuraDataTable
      ariaLabel={`${areaLabel} project register`}
      title={`${areaLabel} register`}
      columns={tableColumns}
      data={rows}
      keyExtractor={(row, index) => row.id ?? `${areaLabel}-${index}`}
      rowHref={rowHref ? (row) => row.id ? `${rowHref}/${row.id}` : rowHref : undefined}
      searchable
      searchPlaceholder={`Search ${entity}s…`}
      filters={filters}
      columnToggle
      pageSize={25}
      urlKey={`project_${areaLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`}
      initialSort={columns[0] ? { key: columns[0].key, dir: 'asc' } : undefined}
      emptyTitle={`No ${entity}s on this project yet`}
      emptyDescription={`${areaLabel} records will appear here when they are created for this project.`}
      filteredEmptyTitle={`No matching ${entity}s`}
      filteredEmptyDescription="Change or clear the search and filters to see this project's records."
    />
  );
}

function renderCell(value: unknown, column: AreaColumn) {
  if (value === null || value === undefined || value === '') return <span style={{ color: 'var(--muted)' }}>—</span>;
  if (column.kind === 'date') return String(value).slice(0, 10);
  if (column.kind === 'status') {
    const label = humanise(String(value));
    const good = /approved|closed|issued|commissioned|accepted|passed/i.test(label);
    const bad = /rejected|failed|open|overdue|expired/i.test(label);
    return <span className={good ? 'badge badge-good' : bad ? 'badge badge-bad' : 'badge'}>{label}</span>;
  }
  if (column.kind === 'code') return <span style={{ fontFamily: 'ui-monospace, monospace' }}>{String(value)}</span>;
  return String(value);
}

function humanise(value: string) {
  return value.replace(/_/g, ' ');
}
