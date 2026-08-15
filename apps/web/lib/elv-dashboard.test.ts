import { describe, it, expect } from 'vitest';
import { summariseElv } from './elv-dashboard';
import type { ElvDevice, ElvDeviceStatus, ElvSystem } from './elv';

let n = 0;
function dev(system: ElvSystem, status: ElvDeviceStatus, extra: Partial<ElvDevice> = {}): ElvDevice {
  n += 1;
  return {
    id: `d${n}`, projectId: 'P', system, tag: `T-${n}`, model: null, manufacturer: null,
    location: null, drawingRef: null, serialNumber: null, macAddress: null, ipAddress: null,
    cableRef: null, homeRunTo: null, portRef: null, status, commissioningRecordId: null,
    warrantyExpiresAt: null, assetId: null, notes: null, createdAt: '2026-08-15', updatedAt: '2026-08-15',
    ...extra,
  };
}

describe('summariseElv', () => {
  it('handles an empty schedule', () => {
    const s = summariseElv([]);
    expect(s.total).toBe(0);
    expect(s.commissionedPct).toBe(0);
    expect(s.systems).toEqual([]);
    expect(s.attention).toEqual([]);
  });

  it('counts by status and excludes removed from the live/commissioned base', () => {
    const s = summariseElv([
      dev('cctv', 'commissioned', { serialNumber: 'x', ipAddress: 'y' }),
      dev('cctv', 'tested', { serialNumber: 'x', ipAddress: 'y' }),
      dev('cctv', 'removed'),
    ]);
    expect(s.total).toBe(3);
    expect(s.live).toBe(2);
    expect(s.commissioned).toBe(1);
    expect(s.commissionedPct).toBe(50); // 1 of 2 live, removed excluded
    expect(s.byStatus.removed).toBe(1);
  });

  it('builds per-system progress, busiest first, hiding empty systems', () => {
    const s = summariseElv([
      dev('cctv', 'commissioned', { serialNumber: 'x', ipAddress: 'y' }),
      dev('cctv', 'installed'),
      dev('access_control', 'commissioned', { serialNumber: 'x', ipAddress: 'y' }),
    ]);
    expect(s.systems.map((x) => x.system)).toEqual(['cctv', 'access_control']); // cctv (2) before ac (1)
    const cctv = s.systems.find((x) => x.system === 'cctv')!;
    expect(cctv.total).toBe(2);
    expect(cctv.commissioned).toBe(1);
    expect(cctv.pct).toBe(50);
    expect(s.systems.every((x) => x.total > 0)).toBe(true);
  });

  it('raises evidence-based attention with deep-links for faulty and planned', () => {
    const s = summariseElv([
      dev('cctv', 'faulty'),
      dev('cctv', 'planned'),
      dev('cctv', 'tested'), // missing serial+ip → identity flag
    ]);
    const faulty = s.attention.find((a) => a.severity === 'critical');
    expect(faulty?.count).toBe(1);
    expect(faulty?.href).toBe('/elv/devices?elv_f_status=faulty');
    const planned = s.attention.find((a) => a.href === '/elv/devices?elv_f_status=planned');
    expect(planned?.count).toBe(1);
    expect(s.attention.some((a) => /missing serial or IP/.test(a.label))).toBe(true);
  });

  it('flags installed-but-undocumented devices for handover', () => {
    const s = summariseElv([
      dev('cctv', 'commissioned', { serialNumber: 'x', ipAddress: 'y' }), // complete
      dev('cctv', 'tested', { serialNumber: null, ipAddress: '10.0.0.1' }), // missing serial
    ]);
    const missing = s.attention.find((a) => /missing serial or IP/.test(a.label));
    expect(missing?.count).toBe(1);
  });
});
