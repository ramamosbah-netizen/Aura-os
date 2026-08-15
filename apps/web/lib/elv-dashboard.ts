// elv-dashboard — the pure reasoning layer behind the ELV cockpit.
//
// Turns the live device list into per-system commissioning progress, status counts, and an
// evidence-based "needs attention" list (each item deep-links into the filtered register). Pure +
// unit-tested in elv-dashboard.test.ts, so the numbers on the cockpit are verifiable without a DOM.
// This is the honest form of "AI on the dashboard": conclusions computed from real records, each
// with the evidence and a link to act — not a black box.

import { ELV_DEVICE_STATUSES, ELV_SYSTEMS, systemLabel, type ElvDevice, type ElvDeviceStatus, type ElvSystem } from './elv';

export interface SystemProgress {
  system: ElvSystem;
  label: string;
  total: number;
  commissioned: number;
  faulty: number;
  /** commissioned / (total − removed), 0–100, rounded. */
  pct: number;
}

export interface ElvAttentionItem {
  severity: 'critical' | 'warn' | 'info';
  label: string;
  count: number;
  /** Deep-link into the filtered register, when the flag maps to a facet. */
  href?: string;
}

export interface ElvSummary {
  total: number;
  live: number; // excludes removed
  byStatus: Record<ElvDeviceStatus, number>;
  commissioned: number;
  commissionedPct: number;
  systems: SystemProgress[];
  attention: ElvAttentionItem[];
}

const REGISTER = '/elv/devices';

export function summariseElv(devices: ElvDevice[]): ElvSummary {
  const byStatus = Object.fromEntries(ELV_DEVICE_STATUSES.map((s) => [s, 0])) as Record<ElvDeviceStatus, number>;
  for (const d of devices) if (d.status in byStatus) byStatus[d.status] += 1;

  const total = devices.length;
  const removed = byStatus.removed;
  const live = total - removed;
  const commissioned = byStatus.commissioned;
  const commissionedPct = live > 0 ? Math.round((commissioned / live) * 100) : 0;

  // Per-system progress — only systems that actually have devices, busiest first.
  const systems: SystemProgress[] = ELV_SYSTEMS.map((system) => {
    const inSystem = devices.filter((d) => d.system === system);
    const liveInSystem = inSystem.filter((d) => d.status !== 'removed').length;
    const comm = inSystem.filter((d) => d.status === 'commissioned').length;
    return {
      system,
      label: systemLabel(system),
      total: inSystem.length,
      commissioned: comm,
      faulty: inSystem.filter((d) => d.status === 'faulty').length,
      pct: liveInSystem > 0 ? Math.round((comm / liveInSystem) * 100) : 0,
    };
  })
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);

  // Evidence-based attention — real counts, deep-linked where a facet exists.
  const attention: ElvAttentionItem[] = [];
  if (byStatus.faulty > 0) {
    attention.push({ severity: 'critical', count: byStatus.faulty, label: `${byStatus.faulty} device(s) faulty — need re-test`, href: `${REGISTER}?elv_f_status=faulty` });
  }
  const missingIdentity = devices.filter(
    (d) => ['terminated', 'tested', 'commissioned'].includes(d.status) && (!d.serialNumber || !d.ipAddress),
  ).length;
  if (missingIdentity > 0) {
    attention.push({ severity: 'warn', count: missingIdentity, label: `${missingIdentity} installed device(s) missing serial or IP for handover` });
  }
  const notCommissioned = live - commissioned;
  if (notCommissioned > 0) {
    attention.push({ severity: 'info', count: notCommissioned, label: `${notCommissioned} device(s) not yet commissioned` });
  }
  if (byStatus.planned > 0) {
    attention.push({ severity: 'warn', count: byStatus.planned, label: `${byStatus.planned} device(s) not started (planned)`, href: `${REGISTER}?elv_f_status=planned` });
  }

  return { total, live, byStatus, commissioned, commissionedPct, systems, attention };
}
