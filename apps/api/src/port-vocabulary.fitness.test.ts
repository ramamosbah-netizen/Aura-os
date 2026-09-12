import { describe, it, expect } from 'vitest';
import { ELV_SYSTEMS, ELV_SYSTEM_DISCIPLINES, DISCIPLINES, disciplinesForElvSystem } from '@aura/shared';
import { makeDrawingRegisterEntry, type RegisterStatus } from '@aura/doccontrol';
import { makeDrawing, type DrawingStatus } from '@aura/engineering';
import { ELV_DEVICE_STATUSES } from '@aura/elv';
import { NCR_TRANSITIONS, type NcrStatus } from '@aura/quality';
import {
  AS_BUILT_STATUS, APPROVED_DRAWING_STATUSES, INSTALLED_STATUSES, OPEN_NCR_STATUSES,
  assessHandoverReadiness, type HandoverReadinessFacts,
} from '@aura/commissioning';

/**
 * Port-vocabulary fitness test (TC-GATE-6).
 *
 * THE BUG THIS EXISTS TO PREVENT, which shipped in TC-GATE-4 and survived TC-GATE-5:
 *
 * Handover's as-built gate filtered a port's rows for `status === 'as_built'`. The port was bound to
 * ENGINEERING, whose `DrawingStatus` has no such value and never did — so the gate matched nothing a
 * real project could produce. It could reach BLOCKED or UNKNOWN and **never READY**, which made every
 * handover package permanently unsubmittable. Nothing caught it:
 *
 *   - the compiler could not, because a port widens `status` to `string` at the boundary, which is
 *     the whole point of a port — the consumer must not import the owner's enum;
 *   - the unit test could not, because it built its own fact with a fabricated `status: 'as_built'`,
 *     so it tested the filter against a value only the test could create;
 *   - the e2e could not, because it stopped at BLOCKED and never asserted the gate reaching READY.
 *
 * A port hides the type. Only a test that can see BOTH SIDES can check the words still match — and
 * this application layer is the one place that legitimately imports every module, so this is where
 * such a test belongs.
 *
 * THE RULE: if a consumer matches on a literal from another domain's vocabulary, that literal must be
 * a value the owning domain can actually produce. Add a case here whenever a new one appears.
 *
 * TC-GATE-11 generalised this from the one as-built case to EVERY set of foreign literals commissioning
 * matches on, and the generalisation immediately found a second instance of the same bug:
 * `APPROVED_DRAWING_STATUSES` read `['approved', 'issued_for_construction', 'as_built']`, and
 * Engineering's `DrawingStatus` has neither of the last two — `issued_for_construction` appeared
 * nowhere else in the repository at all. Two thirds of that set could never match anything. It did not
 * break the gate, because `approved` carried it, which is exactly why nothing noticed.
 */
describe('TC-GATE-6 — cross-module vocabulary agreement', () => {
  /**
   * Every literal commissioning matches on, against the vocabulary of the domain that owns it.
   *
   * Each set arrives here as bare strings, because a port widens the owner's type at the boundary —
   * that is what a port is FOR, and it is why the compiler cannot do this job. These assertions are
   * the substitute.
   */
  describe('foreign literals commissioning matches on', () => {
    it('drawing statuses are all values ENGINEERING can produce', () => {
      const engineeringStatuses: DrawingStatus[] = [
        'draft', 'submitted', 'under_review', 'approved', 'rejected', 'revision_required', 'transmitted', 'closed', 'superseded',
      ];
      for (const literal of APPROVED_DRAWING_STATUSES) {
        expect(engineeringStatuses, `"${literal}" is not a DrawingStatus Engineering can produce`)
          .toContain(literal as DrawingStatus);
      }
      // The one that used to be there and never could match. Pinned so it cannot come back.
      expect([...APPROVED_DRAWING_STATUSES]).not.toContain('issued_for_construction');
      expect([...APPROVED_DRAWING_STATUSES], 'as-built is document control’s word, not Engineering’s')
        .not.toContain('as_built');
    });

    it('device statuses are all values the ELV register can produce', () => {
      for (const literal of INSTALLED_STATUSES) {
        expect(ELV_DEVICE_STATUSES as readonly string[], `"${literal}" is not an ElvDeviceStatus`).toContain(literal);
      }
    });

    it('open-NCR statuses are all values QUALITY can produce, and exclude the closed one', () => {
      const qualityStatuses = Object.keys(NCR_TRANSITIONS) as NcrStatus[];
      for (const literal of OPEN_NCR_STATUSES) {
        expect(qualityStatuses, `"${literal}" is not an NcrStatus`).toContain(literal as NcrStatus);
      }
      expect([...OPEN_NCR_STATUSES], 'a closed NCR is not open').not.toContain('closed');
      // And the set is not quietly missing one: every non-closed status must be treated as open.
      expect([...OPEN_NCR_STATUSES].sort()).toEqual(qualityStatuses.filter((s) => s !== 'closed').sort());
    });
  });

  /**
   * The ELV system ↔ discipline map (TC-GATE-11).
   *
   * Two axes, not one vocabulary badly spelled: a discipline is a TRADE, an ELV system is a system
   * within one. The map lives in @aura/shared because both sides do and neither owns the relation.
   * Typing it `Record<ElvSystem, readonly Discipline[]>` is what makes an unmapped system a compile
   * error; these assertions cover what the type cannot — that the map stays exhaustive at runtime and
   * that the untrusted-input path never returns nothing.
   */
  describe('ELV system ↔ discipline map', () => {
    it('covers every ELV system, with disciplines that exist', () => {
      for (const system of ELV_SYSTEMS) {
        const disciplines = ELV_SYSTEM_DISCIPLINES[system];
        expect(disciplines, `${system} has no discipline mapping`).toBeTruthy();
        expect(disciplines.length, `${system} maps to nothing`).toBeGreaterThan(0);
        for (const d of disciplines) {
          expect(DISCIPLINES, `"${d}" is not a Discipline`).toContain(d);
        }
      }
    });

    it('falls back rather than returning nothing for a system it has not heard of', () => {
      // An empty list would make the readiness gate say "no drawings recognised", which is a
      // statement about this map rather than about the project.
      expect(disciplinesForElvSystem('a_system_from_the_future')).toEqual(ELV_SYSTEM_DISCIPLINES.other);
      expect(disciplinesForElvSystem(null)).toEqual(ELV_SYSTEM_DISCIPLINES.other);
      expect(disciplinesForElvSystem('CCTV'), 'case is not a different system').toEqual(ELV_SYSTEM_DISCIPLINES.cctv);
    });

    it('includes elv for every system, because a coarse ELV package is the common case', () => {
      for (const system of ELV_SYSTEMS) {
        expect(ELV_SYSTEM_DISCIPLINES[system], `${system} must recognise the coarse elv package`).toContain('elv');
      }
    });
  });

  describe('as-built status', () => {
    it('is a status DOCUMENT CONTROL can actually produce', () => {
      // Not a string comparison against a literal: the register is asked to MAKE one. If
      // `RegisterStatus` ever loses `as_built`, this stops compiling — which is the alarm.
      const status: RegisterStatus = 'as_built';
      const entry = makeDrawingRegisterEntry({
        tenantId: 't1', projectId: 'p1', documentNumber: 'ELV-AB-001', title: 'CCTV as-built', status,
      });
      expect(entry.status).toBe(AS_BUILT_STATUS);
    });

    it('is NOT a status Engineering can produce — which is why the gate was moved', () => {
      // The original defect, pinned. Engineering's drawing lifecycle ends at `closed`; there is no
      // as-built state in it, so asking Engineering this question can only ever answer "no".
      const engineeringStatuses: DrawingStatus[] = [
        'draft', 'submitted', 'under_review', 'approved', 'rejected', 'revision_required', 'transmitted', 'closed', 'superseded',
      ];
      expect(engineeringStatuses).not.toContain(AS_BUILT_STATUS);

      // And the whole point: a drawing at its most-released state still is not an as-built.
      const released = makeDrawing({ tenantId: 't1', projectId: 'p1', code: 'ELV-001', title: 'CCTV layout' });
      expect(released.status).not.toBe(AS_BUILT_STATUS);
    });

    it('reaches READY through document control, on a register entry the register itself made', () => {
      const entry = makeDrawingRegisterEntry({
        tenantId: 't1', projectId: 'p1', documentNumber: 'ELV-AB-001', title: 'CCTV as-built', status: 'as_built',
      });
      // The fact is built from the REAL row, not hand-written — the step the old unit test skipped.
      // Since TC-GATE-8 the gate is per system, so the drawing is LINKED to the system it documents;
      // a register entry sitting on the project no longer answers for a system nobody linked it to.
      const facts: HandoverReadinessFacts = {
        systemsTotal: 1,
        systemsCommissioningReady: 1,
        notReadyReasons: [],
        documents: [{
          id: entry.id,
          documentNumber: entry.documentNumber,
          title: entry.title,
          revision: entry.currentRevision,
          status: entry.status,
          discipline: entry.discipline,
          docType: entry.docType,
        }],
        omItems: [],
        trainingSessions: [],
        asBuiltLinks: [{ commissioningId: 'sys-1', documentId: entry.documentNumber }],
        snags: [],
        systemIds: ['sys-1'],
        // TC-GATE-16 replaced the last assertion with a record, so the facts carry spares rather
        // than a boolean. Empty here: this test is about the as-built vocabulary, and spares reading
        // UNKNOWN does not affect the item under assertion.
        spares: [],
      };
      const asBuilts = assessHandoverReadiness(facts).items.find((i) => i.id === 'asBuilts')!;
      expect(asBuilts.state).toBe('READY');
      expect(asBuilts.source).toBe('Document control');
    });
  });
});
