import { describe, expect, it } from 'vitest';
import {
  handoverReadiness,
  makeElvDevice,
  normaliseMac,
  setDeviceStatus,
  type ElvDevice,
} from './device';

const base = { tenantId: 't1', projectId: 'p1', tag: 'cam-l3-014', system: 'cctv' };
const make = (over: Record<string, unknown> = {}): ElvDevice => makeElvDevice({ ...base, ...over } as never);

describe('makeElvDevice', () => {
  it('refuses a device with no tag — the uuid is not what anyone reads out on site', () => {
    expect(() => make({ tag: '   ' })).toThrow(/tag is required/);
  });

  it('requires a project, because a device that belongs to nothing cannot be scheduled', () => {
    expect(() => makeElvDevice({ ...base, projectId: '' } as never)).toThrow(/projectId is required/);
  });

  it('upper-cases the tag so CAM-L3-014 and cam-l3-014 are one device', () => {
    expect(make().tag).toBe('CAM-L3-014');
  });

  it('resolves the system through the shared taxonomy, aliases included', () => {
    expect(make({ system: 'pa_va' }).system).toBe('public_address');
    expect(make({ system: 'lan' }).system).toBe('network');
  });

  it('falls back to other rather than refusing an unrecognised system', () => {
    // A device must never be un-recordable because the taxonomy is incomplete.
    expect(make({ system: 'quantum_teleporter' }).system).toBe('other');
  });

  it('starts planned, uncommissioned and unassetised', () => {
    const d = make();
    expect(d.status).toBe('planned');
    expect(d.commissioningRecordId).toBeNull();
    expect(d.assetId).toBeNull();
  });

  it('blanks empty strings rather than storing them, so "missing" is one value not two', () => {
    const d = make({ serialNumber: '  ', location: '' });
    expect(d.serialNumber).toBeNull();
    expect(d.location).toBeNull();
  });
});

describe('normaliseMac', () => {
  it('stores one format, so the same NIC is not two devices', () => {
    const canonical = '00:1A:2B:3C:4D:5E';
    expect(normaliseMac('00:1a:2b:3c:4d:5e')).toBe(canonical);
    expect(normaliseMac('001a.2b3c.4d5e')).toBe(canonical);
    expect(normaliseMac('00-1A-2B-3C-4D-5E')).toBe(canonical);
  });

  it('keeps an unparseable value rather than discarding it', () => {
    // Losing what the engineer typed is worse than storing something odd.
    expect(normaliseMac('not-a-mac')).toBe('NOT-A-MAC');
  });

  it('treats blank as absent', () => {
    expect(normaliseMac('   ')).toBeNull();
    expect(normaliseMac(undefined)).toBeNull();
  });
});

describe('setDeviceStatus', () => {
  it('walks the installation sequence', () => {
    let d = make();
    for (const s of ['installed', 'terminated', 'tested', 'commissioned'] as const) {
      d = setDeviceStatus(d, s);
      expect(d.status).toBe(s);
    }
  });

  it('refuses to skip termination — the milestone a subcontractor claims against', () => {
    const d = make();
    expect(() => setDeviceStatus(setDeviceStatus(d, 'installed'), 'commissioned')).toThrow(/can follow installed/);
  });

  it('lets a faulty device be re-tested, mirroring commissioning', () => {
    let d = make();
    d = setDeviceStatus(d, 'installed');
    d = setDeviceStatus(d, 'terminated');
    d = setDeviceStatus(d, 'faulty');
    expect(setDeviceStatus(d, 'tested').status).toBe('tested');
  });

  it('treats removed as terminal', () => {
    const d = setDeviceStatus(make(), 'removed');
    expect(() => setDeviceStatus(d, 'installed')).toThrow(/nothing can follow removed/);
  });

  it('is a no-op when the status has not changed', () => {
    const d = make();
    expect(setDeviceStatus(d, 'planned')).toBe(d);
  });
});

describe('handoverReadiness', () => {
  const commissioned = (over: Record<string, unknown> = {}): ElvDevice => {
    let d = make({ serialNumber: 'SN-001', location: 'Level 3 — East', warrantyExpiresAt: '2028-01-01', ...over });
    for (const s of ['installed', 'terminated', 'tested', 'commissioned'] as const) d = setDeviceStatus(d, s);
    return d;
  };

  it('is ready when it is commissioned AND documented', () => {
    expect(handoverReadiness(commissioned())).toEqual({ ready: true, missing: [] });
  });

  it('is not ready while it merely works — "installed" is not "documented"', () => {
    // This is the distinction an O&M manual and an AMC are built on.
    const d = commissioned({ serialNumber: null });
    expect(handoverReadiness(d)).toEqual({ ready: false, missing: ['serial number'] });
  });

  it('names everything outstanding at once, so the punch list is actionable', () => {
    const planned = make();
    expect(handoverReadiness(planned).missing).toEqual([
      'not commissioned',
      'serial number',
      'location',
      'warranty expiry',
    ]);
  });
});
