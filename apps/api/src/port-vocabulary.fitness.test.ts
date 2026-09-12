import { describe, it, expect } from 'vitest';
import { makeDrawingRegisterEntry, type RegisterStatus } from '@aura/doccontrol';
import { makeDrawing, type DrawingStatus } from '@aura/engineering';
import { AS_BUILT_STATUS, assessHandoverReadiness, type HandoverReadinessFacts } from '@aura/commissioning';

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
 */
describe('TC-GATE-6 — cross-module vocabulary agreement', () => {
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
        systemIds: ['sys-1'],
        asserted: { spares: true },
      };
      const asBuilts = assessHandoverReadiness(facts).items.find((i) => i.id === 'asBuilts')!;
      expect(asBuilts.state).toBe('READY');
      expect(asBuilts.source).toBe('Document control');
    });
  });
});
