// ELV frontend domain — the vocabulary the ELV register + Device 360 render against.
//
// Systems come from @aura/shared (the SAME canonical list the device.system field uses — never
// free text). Statuses + the transition map mirror the backend (`modules/elv` domain); the backend
// is the enforcer, this only decides which action buttons to SHOW. Kept small and colocated so the
// ELV surfaces don't each re-declare it.

import { ELV_SYSTEMS, ELV_SYSTEM_LABELS, type ElvSystem } from '@aura/shared';

export { ELV_SYSTEMS, ELV_SYSTEM_LABELS };
export type { ElvSystem };

export const ELV_DEVICE_STATUSES = [
  'planned', 'installed', 'terminated', 'tested', 'commissioned', 'faulty', 'removed',
] as const;
export type ElvDeviceStatus = (typeof ELV_DEVICE_STATUSES)[number];

export type ElvTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'info';

export const ELV_STATUS_META: Record<ElvDeviceStatus, { label: string; tone: ElvTone }> = {
  planned: { label: 'Planned', tone: 'neutral' },
  installed: { label: 'Installed', tone: 'info' },
  terminated: { label: 'Terminated', tone: 'accent' },
  tested: { label: 'Tested', tone: 'warn' },
  commissioned: { label: 'Commissioned', tone: 'good' },
  faulty: { label: 'Faulty', tone: 'bad' },
  removed: { label: 'Removed', tone: 'neutral' },
};

/** Legal next-statuses — mirrors the backend `NEXT` map. Backend enforces; this renders buttons. */
export const ELV_NEXT: Record<ElvDeviceStatus, ElvDeviceStatus[]> = {
  planned: ['installed', 'removed'],
  installed: ['terminated', 'faulty', 'removed'],
  terminated: ['tested', 'faulty', 'removed'],
  tested: ['commissioned', 'faulty', 'removed'],
  commissioned: ['faulty', 'removed'],
  faulty: ['tested', 'terminated', 'removed'],
  removed: [],
};

/** The device as the API returns it (a subset the UI needs; see `modules/elv` ElvDevice). */
export interface ElvDevice {
  id: string;
  projectId: string;
  system: ElvSystem;
  tag: string;
  model: string | null;
  manufacturer: string | null;
  location: string | null;
  drawingRef: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  ipAddress: string | null;
  cableRef: string | null;
  homeRunTo: string | null;
  portRef: string | null;
  status: ElvDeviceStatus;
  commissioningRecordId: string | null;
  warrantyExpiresAt: string | null;
  assetId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const systemLabel = (s: string): string => (ELV_SYSTEM_LABELS as Record<string, string>)[s] ?? s;
export const statusMeta = (s: string) => ELV_STATUS_META[s as ElvDeviceStatus] ?? { label: s, tone: 'neutral' as ElvTone };
