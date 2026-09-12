import { describe, expect, it } from 'vitest';
import { assessSystemReadiness, type ReadinessFacts } from './commissioning-readiness';

/**
 * TC-GATE-3 — the readiness chain.
 *
 * The property that matters most is asserted first and repeatedly: **UNKNOWN is never a pass**. A
 * gate whose owning domain cannot be read, or which has nothing to judge, must block — otherwise an
 * unwired port silently declares systems ready for handover.
 */
const base: ReadinessFacts = {
  system: 'cctv',
  pointsTotal: 2,
  pointsPassed: 2,
  pointsFailing: 0,
  pointsUntested: 0,
  pointsEverFailed: 0,
  openPunch: 0,
  commissioned: true,
  signedOffBy: 'Engineer',
  witnessedBy: 'Consultant',
  equipment: [{ tag: 'CAM-001', system: 'cctv', status: 'installed', linked: true }],
  drawings: [{ discipline: 'cctv', status: 'approved' }],
  ncrs: [],
  itpRequirements: [],
};

const gate = (facts: Partial<ReadinessFacts>, id: string) =>
  assessSystemReadiness({ ...base, ...facts }).gates.find((g) => g.id === id)!;

describe('TC-GATE-3 — readiness chain', () => {
  it('says COMMISSIONING READY only when every gate is satisfied', () => {
    const result = assessSystemReadiness(base);
    expect(result.commissioningReady).toBe(true);
    expect(result.blocking).toEqual([]);
    expect(result.gates.map((g) => g.id)).toEqual([
      'equipment', 'installation', 'engineering', 'quality', 'tests', 'defects', 'retests', 'signoff', 'certificates',
    ]);
  });

  it('every gate names the domain that owns its answer', () => {
    const sources = new Map(assessSystemReadiness(base).gates.map((g) => [g.id, g.source]));
    expect(sources.get('equipment')).toBe('ELV device register');
    expect(sources.get('installation')).toBe('ELV device register');
    expect(sources.get('engineering')).toBe('Engineering');
    expect(sources.get('quality')).toBe('Quality');
    expect(sources.get('tests')).toBe('Testing & commissioning');
  });

  describe('UNKNOWN is never a pass', () => {
    it('blocks when the ELV register cannot be read', () => {
      const r = assessSystemReadiness({ ...base, equipment: null });
      expect(gate({ equipment: null }, 'equipment').state).toBe('UNKNOWN');
      expect(r.commissioningReady, 'an unreadable domain must not pass').toBe(false);
      expect(r.blocking).toContain('equipment');
    });

    it('blocks when Engineering cannot be read', () => {
      expect(gate({ drawings: null }, 'engineering').state).toBe('UNKNOWN');
      expect(assessSystemReadiness({ ...base, drawings: null }).commissioningReady).toBe(false);
    });

    it('blocks when Quality cannot be read', () => {
      expect(gate({ ncrs: null }, 'quality').state).toBe('UNKNOWN');
      expect(assessSystemReadiness({ ...base, ncrs: null }).commissioningReady).toBe(false);
    });

    it('blocks when nothing is registered as belonging to the system', () => {
      const g = gate({ equipment: [] }, 'equipment');
      expect(g.state).toBe('UNKNOWN');
      expect(g.reason).toMatch(/no equipment is registered/i);
    });

    it('blocks when no drawing carries a discipline this system recognises', () => {
      const g = gate({ drawings: [{ discipline: 'plumbing', status: 'approved' }] }, 'engineering');
      expect(g.state).toBe('UNKNOWN');
      expect(g.reason, 'the reason must name what was looked for').toMatch(/cctv|elv|security/);
    });
  });

  describe('equipment and installation', () => {
    it('counts devices of the same system even when they are not tied to the record', () => {
      const g = gate({ equipment: [{ tag: 'CAM-002', system: 'cctv', status: 'installed', linked: false }] }, 'equipment');
      expect(g.state).toBe('READY');
    });

    it('ignores another system’s devices', () => {
      const g = gate({ equipment: [{ tag: 'DOOR-01', system: 'access_control', status: 'installed', linked: false }] }, 'equipment');
      expect(g.state).toBe('UNKNOWN');
    });

    it('blocks while a device is not installed, and names it', () => {
      const g = gate({
        equipment: [
          { tag: 'CAM-001', system: 'cctv', status: 'installed', linked: true },
          { tag: 'CAM-014', system: 'cctv', status: 'planned', linked: true },
        ],
      }, 'installation');
      expect(g.state).toBe('BLOCKED');
      expect(g.reason).toContain('CAM-014');
    });

    it('blocks on a faulty device', () => {
      const g = gate({ equipment: [{ tag: 'CAM-003', system: 'cctv', status: 'faulty', linked: true }] }, 'installation');
      expect(g.state).toBe('BLOCKED');
      expect(g.reason).toMatch(/faulty/);
    });

    it('ignores a removed device rather than counting it as outstanding', () => {
      const g = gate({
        equipment: [
          { tag: 'CAM-001', system: 'cctv', status: 'installed', linked: true },
          { tag: 'CAM-009', system: 'cctv', status: 'removed', linked: true },
        ],
      }, 'installation');
      expect(g.state).toBe('READY');
      expect(g.reason).toContain('All 1 device');
    });
  });

  describe('engineering', () => {
    it('accepts a drawing tagged with the coarse elv discipline', () => {
      expect(gate({ drawings: [{ discipline: 'elv', status: 'approved' }] }, 'engineering').state).toBe('READY');
    });

    it('blocks when drawings exist for the discipline but none are approved', () => {
      const g = gate({ drawings: [{ discipline: 'cctv', status: 'under_review' }] }, 'engineering');
      expect(g.state).toBe('BLOCKED');
      expect(g.reason).toMatch(/none approved/i);
    });

    it('reports the ones still in review alongside the approved ones', () => {
      const g = gate({ drawings: [{ discipline: 'cctv', status: 'approved' }, { discipline: 'cctv', status: 'submitted' }] }, 'engineering');
      expect(g.state).toBe('READY');
      expect(g.reason).toMatch(/1 still in review/);
    });
  });

  describe('quality', () => {
    it('blocks on an open non-conformance against this system', () => {
      const g = gate({ ncrs: [{ ncrNumber: 'NCR-014', system: 'cctv', status: 'raised' }] }, 'quality');
      expect(g.state).toBe('BLOCKED');
      expect(g.reason).toContain('NCR-014');
    });

    it('treats a non-conformance with no system as project-wide, so it blocks every system', () => {
      const g = gate({ ncrs: [{ ncrNumber: 'NCR-020', system: null, status: 'raised' }] }, 'quality');
      expect(g.state).toBe('BLOCKED');
    });

    it('matches the system however Quality spelled it', () => {
      const g = gate({ system: 'access_control', ncrs: [{ ncrNumber: 'NCR-021', system: 'Access-Control', status: 'raised' }] }, 'quality');
      expect(g.state).toBe('BLOCKED');
    });

    /**
     * TC-GATE-12 — the defect this gate closes.
     *
     * Matching used to be a private string-strip: lowercase, and hyphens/spaces to underscores. That
     * made 'Access-Control' match, and left the platform's OWN recognised aliases matching nothing.
     * 'pa_va' is not hypothetical — @aura/shared records it as a spelling that exists in
     * aura_commissioning_records. An open non-conformance filed under one of these silently failed
     * to block the system it was raised against.
     */
    it('matches an alias the platform recognises — which the old string-strip did not', () => {
      const acs = gate({ system: 'access_control', ncrs: [{ ncrNumber: 'NCR-022', system: 'acs', status: 'raised' }] }, 'quality');
      expect(acs.state, 'acs is access control').toBe('BLOCKED');

      const paVa = gate({ system: 'public_address', ncrs: [{ ncrNumber: 'NCR-023', system: 'pa_va', status: 'raised' }] }, 'quality');
      expect(paVa.state, 'pa_va is the voice-alarm spelling already in the database').toBe('BLOCKED');

      // And it still does not match a DIFFERENT system: resolving is not the same as matching everything.
      const other = gate({ system: 'cctv', ncrs: [{ ncrNumber: 'NCR-024', system: 'acs', status: 'raised' }] }, 'quality');
      expect(other.state, 'an access-control NCR is not a CCTV problem').toBe('READY');
    });

    /**
     * An attribution nobody can resolve BLOCKS, and says which value it could not read.
     *
     * The alternative is to ignore it, which hides an open non-conformance behind a typo. UNKNOWN
     * NEVER PASSES is the rule every gate in this chain follows: the cost of being wrong this way is
     * that somebody corrects the NCR's system field; the cost the other way is a system handed over
     * with an unresolved non-conformance against it.
     */
    it('counts an unrecognised attribution rather than ignoring it, and names the value', () => {
      const g = gate({ system: 'cctv', ncrs: [{ ncrNumber: 'NCR-025', system: 'chiller plant', status: 'raised' }] }, 'quality');
      expect(g.state).toBe('BLOCKED');
      expect(g.reason).toContain('"chiller plant"');
      expect(g.reason).toMatch(/not a system this platform recognises/i);
    });

    it('ignores a closed non-conformance', () => {
      expect(gate({ ncrs: [{ ncrNumber: 'NCR-001', system: 'cctv', status: 'closed' }] }, 'quality').state).toBe('READY');
    });

    it('blocks while a linked ITP point has not passed, and says so when none is linked', () => {
      const blocked = gate({ itpRequirements: [{ reference: 'ITP-01', activity: 'Cable test', pointType: 'hold', result: 'pending' }] }, 'quality');
      expect(blocked.state).toBe('BLOCKED');
      expect(blocked.reason).toMatch(/ITP point/i);

      expect(gate({}, 'quality').reason, 'an unlinked system must say so rather than imply coverage').toMatch(/No ITP is linked/i);
    });
  });

  describe('T&C’s own gates', () => {
    it('blocks when there is no test sheet at all', () => {
      const g = gate({ pointsTotal: 0, pointsPassed: 0 }, 'tests');
      expect(g.state).toBe('BLOCKED');
      expect(g.reason).toMatch(/no test points/i);
    });

    it('separates never-executed from failing', () => {
      const g = gate({ pointsPassed: 0, pointsUntested: 1, pointsFailing: 1 }, 'tests');
      expect(g.reason).toMatch(/1 never executed, 1 failing/);
    });

    it('reports retests as not applicable when nothing ever failed', () => {
      expect(gate({}, 'retests').state).toBe('NOT_APPLICABLE');
    });

    it('records that a failure happened even once the retest passed', () => {
      const g = gate({ pointsEverFailed: 1 }, 'retests');
      expect(g.state).toBe('READY');
      expect(g.reason).toMatch(/failures remain on record/i);
    });

    it('blocks sign-off recorded without a witness', () => {
      const g = gate({ witnessedBy: null }, 'signoff');
      expect(g.state).toBe('BLOCKED');
      expect(g.reason).toMatch(/witness/i);
    });

    it('calls the last gate an evidence pack, and says what it does not cover', () => {
      const g = gate({}, 'certificates');
      expect(g.label).toBe('Evidence pack complete');
      expect(g.reason).toMatch(/DocControl/);
    });

    it('a system that is not signed off has no evidence pack', () => {
      expect(gate({ commissioned: false }, 'certificates').state).toBe('BLOCKED');
    });
  });

  it('a commissioned system can still fail the wider chain', () => {
    // The distinction the whole gate rests on: T&C's own evidence says sign it off; the ELV register
    // says nothing is installed. Both are true, and only one of them is about handover.
    const result = assessSystemReadiness({ ...base, equipment: [{ tag: 'CAM-001', system: 'cctv', status: 'planned', linked: true }] });
    expect(result.commissioningReady).toBe(false);
    expect(result.blocking).toEqual(['installation']);
  });
});
