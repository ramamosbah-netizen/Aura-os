'use client';

import type { CSSProperties } from 'react';
import AuraDataTable, { type AuraColumn } from '@/components/ui/aura-data-table';
import CreateDrawer, { type FieldSpec } from '@/components/ui/create-drawer';
import {
  ELV_SYSTEMS, ELV_SYSTEM_LABELS, ELV_DEVICE_STATUSES, ELV_STATUS_META,
  systemLabel, statusMeta, type ElvDevice, type ElvTone,
} from '@/lib/elv';

interface Project { id: string; title: string }

const toneColor = (t: ElvTone): string =>
  t === 'good' ? 'var(--good)' : t === 'bad' ? 'var(--bad)' : t === 'warn' ? 'var(--warn)'
    : t === 'info' ? 'var(--info)' : t === 'accent' ? 'var(--accent)' : 'var(--muted)';

export function StatusPill({ status }: { status: string }) {
  const m = statusMeta(status);
  return (
    <span style={{ ...pill, color: toneColor(m.tone), borderColor: toneColor(m.tone) }}>{m.label}</span>
  );
}

export default function ElvDevicesClient({ initialDevices, projects }: { initialDevices: ElvDevice[]; projects: Project[] }) {
  const projName = (id: string) => projects.find((p) => p.id === id)?.title ?? id;

  const columns: AuraColumn<ElvDevice>[] = [
    { key: 'tag', label: 'Tag', priority: 'primary', sortable: true },
    { key: 'system', label: 'System', sortable: true, render: (r) => systemLabel(r.system) },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <StatusPill status={r.status} /> },
    { key: 'location', label: 'Location', render: (r) => r.location ?? '—' },
    { key: 'ipAddress', label: 'IP', render: (r) => r.ipAddress ?? '—' },
    { key: 'serialNumber', label: 'Serial', priority: 'muted', render: (r) => r.serialNumber ?? '—', defaultHidden: true },
    { key: 'projectId', label: 'Project', priority: 'muted', render: (r) => projName(r.projectId) },
  ];

  const fields: FieldSpec[] = [
    { name: 'projectId', label: 'Project', kind: 'select', required: true, options: projects.map((p) => ({ value: p.id, label: p.title })) },
    { name: 'tag', label: 'Device tag', kind: 'text', required: true, placeholder: 'CAM-L3-014' },
    { name: 'system', label: 'System', kind: 'select', required: true, options: ELV_SYSTEMS.map((s) => ({ value: s, label: ELV_SYSTEM_LABELS[s] })) },
    { name: 'model', label: 'Model', kind: 'text', placeholder: 'DS-2CD2143G2-I' },
    { name: 'manufacturer', label: 'Manufacturer', kind: 'text' },
    { name: 'location', label: 'Location', kind: 'text', placeholder: 'Level 3 — East Corridor' },
    { name: 'drawingRef', label: 'Drawing ref', kind: 'text' },
    { name: 'serialNumber', label: 'Serial number', kind: 'text' },
    { name: 'ipAddress', label: 'IP address', kind: 'text' },
    { name: 'macAddress', label: 'MAC address', kind: 'text' },
    { name: 'cableRef', label: 'Cable ref', kind: 'text', placeholder: 'C-CAM-L3-014' },
    { name: 'homeRunTo', label: 'Home run to (rack)', kind: 'text', placeholder: 'RK-L3-01' },
    { name: 'portRef', label: 'Port ref', kind: 'text', placeholder: 'PP1-14' },
    { name: 'warrantyExpiresAt', label: 'Warranty expires', kind: 'date', transform: 'isoDate' },
    { name: 'notes', label: 'Notes', kind: 'textarea', span: 2 },
  ];

  return (
    <div style={st.page}>
      <div style={st.head}>
        <div>
          <h1 style={st.h1}>ELV Devices</h1>
          <p style={st.sub}>
            The device schedule — every camera, reader and barrier as a tracked record: system, location,
            cable/port, serial &amp; IP, warranty and its install→commission status. This is the register the
            rest of the ELV workspace (testing, commissioning, punch list, handover) is built over.
          </p>
        </div>
        <CreateDrawer
          entity="ELV Device"
          subtitle="Add a device to the schedule"
          endpoint="/api/elv/devices"
          fields={fields}
          buttonLabel="+ New device"
        />
      </div>

      <AuraDataTable
        columns={columns}
        data={initialDevices}
        keyExtractor={(r) => r.id}
        urlKey="elv"
        pageSize={25}
        searchPlaceholder="Search by tag, model, serial, IP, location…"
        searchFields={['tag', 'model', 'serialNumber', 'ipAddress', 'location']}
        filters={[
          { key: 'system', label: 'System', options: ELV_SYSTEMS.map((s) => ({ value: s, label: ELV_SYSTEM_LABELS[s] })) },
          { key: 'status', label: 'Status', options: ELV_DEVICE_STATUSES.map((s) => ({ value: s, label: ELV_STATUS_META[s].label })) },
        ]}
        columnToggle
        rowHref={(r) => `/elv/devices/${r.id}`}
        emptyTitle="No ELV devices yet"
        emptyDescription="Add the first device, or import the schedule, to begin tracking installation and commissioning."
      />
    </div>
  );
}

const pill: CSSProperties = { borderWidth: 1, borderStyle: 'solid', borderRadius: 999, padding: '1px 9px', fontSize: 11, fontWeight: 600 };
const st: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 16 },
  head: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  h1: { fontSize: 26, margin: '0 0 6px', letterSpacing: -0.5 },
  sub: { fontSize: 13, color: 'var(--muted)', margin: 0, maxWidth: 720, lineHeight: 1.5 },
};
