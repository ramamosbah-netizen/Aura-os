import { type Id, newId, toElvSystem, type ElvSystem } from '@aura/shared';

/**
 * The ELV device — the record that makes this an *ELV* ERP rather than a good generic one.
 *
 * Until now CCTV, access control and fire alarm existed here only as free text on a BOQ line and
 * as a routing label on a lead. Nothing in the platform knew that a project contains a camera,
 * that the camera hangs off a switch port, that it carries a serial number the client will hold
 * you to at handover, or that its warranty is what the AMC is priced against.
 *
 * Deliberately ONE model rather than a Device Schedule page and a separate Cable Schedule page.
 * The schedules are views over this; building them as screens first is how you end up with two
 * lists that disagree about how many cameras are on level 3.
 *
 * The chain this sits in, and the reason each link is a field rather than a document:
 *
 *   Project → System → Device → Location → Cable → Port → IP/Serial
 *                                 ↓
 *                        Commissioning point → Handover → Warranty → AMC asset
 *
 * `commissioningRecordId`, `warrantyExpiresAt` and `assetId` are the seams to the modules that
 * already own those stages — this model does not re-implement commissioning, handover or assets.
 */
export interface ElvDevice {
  id: Id;
  tenantId: Id;
  companyId: Id | null;

  /** Where it lives commercially. */
  projectId: Id;
  /** Which system it belongs to — canonical, never free text (that is the whole point). */
  system: ElvSystem;

  /**
   * The device tag as it appears on the drawing and the label on the physical unit — `CAM-L3-014`.
   * This, not the uuid, is what a site engineer reads out over the phone.
   */
  tag: string;
  /** Manufacturer's model, e.g. `DS-2CD2143G2-I`. */
  model: string | null;
  manufacturer: string | null;

  /** Physical location, in the building's own words: `Level 3 — East Corridor`. */
  location: string | null;
  /** The drawing this device appears on, so the schedule can be checked against the design. */
  drawingRef: string | null;

  // ── Identity the client will hold you to at handover ──────────────────────────────────────
  serialNumber: string | null;
  macAddress: string | null;
  ipAddress: string | null;

  // ── Connectivity: the cable/port half of the schedule (G-23) ──────────────────────────────
  /** Cable ID as labelled at both ends, e.g. `C-CAM-L3-014`. */
  cableRef: string | null;
  /** The rack/panel this device homes to, e.g. `RK-L3-01`. */
  homeRunTo: string | null;
  /** Patch panel port, e.g. `PP1-14`. */
  portRef: string | null;

  status: ElvDeviceStatus;

  // ── Seams to the stages other modules already own ─────────────────────────────────────────
  /** Set when this device is covered by a commissioning record. */
  commissioningRecordId: Id | null;
  /** Warranty expiry — what the AMC is priced against. */
  warrantyExpiresAt: string | null;
  /** Set once handover turns this into a maintainable asset. */
  assetId: Id | null;

  notes: string | null;
  createdAt: string;
  createdBy: Id | null;
  updatedAt: string;
}

/**
 * planned → installed → terminated → tested → commissioned.
 *
 * `terminated` is the cable being landed at both ends, and it matters commercially: it is the
 * milestone a subcontractor claims against, and it is distinct from the device working.
 * `faulty` is terminal-until-retested, mirroring commissioning's `failed`.
 */
export const ELV_DEVICE_STATUSES = [
  'planned',
  'installed',
  'terminated',
  'tested',
  'commissioned',
  'faulty',
  'removed',
] as const;

export type ElvDeviceStatus = (typeof ELV_DEVICE_STATUSES)[number];

export interface NewElvDevice {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  system?: unknown;
  tag: string;
  model?: string | null;
  manufacturer?: string | null;
  location?: string | null;
  drawingRef?: string | null;
  serialNumber?: string | null;
  macAddress?: string | null;
  ipAddress?: string | null;
  cableRef?: string | null;
  homeRunTo?: string | null;
  portRef?: string | null;
  warrantyExpiresAt?: string | null;
  notes?: string | null;
  createdBy?: Id | null;
}

const trimOrNull = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

export function makeElvDevice(input: NewElvDevice): ElvDevice {
  if (!input.tenantId) throw new Error('tenantId is required');
  if (!input.projectId) throw new Error('projectId is required');
  const tag = (input.tag ?? '').trim();
  if (!tag) throw new Error('device tag is required');

  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    // Alias-aware, so an import spelling `pa_va` lands on the canonical system rather than `other`.
    system: toElvSystem(input.system),
    tag: tag.toUpperCase(),
    model: trimOrNull(input.model),
    manufacturer: trimOrNull(input.manufacturer),
    location: trimOrNull(input.location),
    drawingRef: trimOrNull(input.drawingRef),
    serialNumber: trimOrNull(input.serialNumber),
    macAddress: normaliseMac(input.macAddress),
    ipAddress: trimOrNull(input.ipAddress),
    cableRef: trimOrNull(input.cableRef),
    homeRunTo: trimOrNull(input.homeRunTo),
    portRef: trimOrNull(input.portRef),
    status: 'planned',
    commissioningRecordId: null,
    warrantyExpiresAt: trimOrNull(input.warrantyExpiresAt),
    assetId: null,
    notes: trimOrNull(input.notes),
    createdAt: now,
    createdBy: input.createdBy ?? null,
    updatedAt: now,
  };
}

/**
 * MACs arrive from six different tools in five different formats. Store one, so
 * `00:1A:2B:3C:4D:5E` and `001a.2b3c.4d5e` are recognisably the same device — the duplicate-device
 * problem is the CRM duplicate-account problem with a worse blast radius.
 */
export function normaliseMac(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const hex = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return raw.toUpperCase(); // keep what we were given rather than lose it
  return hex.match(/.{2}/g)!.join(':');
}

/** Legal transitions. Installation is linear; `faulty` can be re-tested; `removed` is terminal. */
const NEXT: Record<ElvDeviceStatus, ElvDeviceStatus[]> = {
  planned: ['installed', 'removed'],
  installed: ['terminated', 'faulty', 'removed'],
  terminated: ['tested', 'faulty', 'removed'],
  tested: ['commissioned', 'faulty', 'removed'],
  commissioned: ['faulty', 'removed'],
  faulty: ['tested', 'terminated', 'removed'],
  removed: [],
};

export function setDeviceStatus(device: ElvDevice, status: ElvDeviceStatus): ElvDevice {
  if (device.status === status) return device;
  if (!NEXT[device.status].includes(status)) {
    throw new Error(`only ${NEXT[device.status].join(', ') || 'nothing'} can follow ${device.status}`);
  }
  return { ...device, status, updatedAt: new Date().toISOString() };
}

/**
 * A device is only ready to hand over when it is commissioned AND carries the identity a client
 * signs for. "Installed and working" is not the same as "documented", and the second is what an
 * O&M manual and an AMC are built from.
 */
export function handoverReadiness(device: ElvDevice): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (device.status !== 'commissioned') missing.push('not commissioned');
  if (!device.serialNumber) missing.push('serial number');
  if (!device.location) missing.push('location');
  if (!device.warrantyExpiresAt) missing.push('warranty expiry');
  return { ready: missing.length === 0, missing };
}
