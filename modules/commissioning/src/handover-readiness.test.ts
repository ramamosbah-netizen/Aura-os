import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@aura/shared';
import { CommissioningService } from './commissioning.service';
import { HandoverService } from './handover.service';
import { InMemoryCommissioningStore } from './in-memory-commissioning-store';
import { assessHandoverReadiness, type HandoverReadinessFacts } from './domain/handover-readiness';
import type { ControlledDocumentFact } from './domain/document-reference';
import type { DocControlPort, ElvEquipmentPort, EngineeringReleasePort, QualityEvidencePort } from './ports';

/**
 * TC-GATE-4 — handover readiness as a projection.
 *
 * The behaviour being removed is specific: a package could read "test certificates ✓" while its
 * systems had never been tested, because the tick and the evidence lived in different places. So the
 * tests that matter most are the ones that try to tick past the evidence and fail.
 *
 * TC-GATE-6 added a second kind: evidence that points at nothing. A deliverable accepted against a
 * document reference nobody checked is a tick wearing a citation, so the register is asked.
 */
const TENANT = 't-gate4';

// TC-GATE-5: O&M and training stopped being ticks and became two of Handover's own authorities, so
// the baseline carries a complete O&M pack and an acknowledged session rather than two booleans.
// TC-GATE-6: and the pack's references now have to exist in a register.
const SYSTEM = 'sys-1';

const AS_BUILT: ControlledDocumentFact = {
  id: 'doc-ab', documentNumber: 'ELV-AB-001', title: 'CCTV as-built layout',
  revision: 'C', status: 'as_built', discipline: 'elv', docType: 'drawing',
};
const OM_DOC: ControlledDocumentFact = {
  id: 'doc-om', documentNumber: 'DOC-OM-001', title: 'CCTV O&M manual',
  revision: 'B', status: 'for_construction', discipline: 'elv', docType: 'document',
};
const WARRANTY_DOC: ControlledDocumentFact = {
  id: 'doc-war', documentNumber: 'DOC-WAR-001', title: 'CCTV warranty certificate',
  revision: 'A', status: 'for_construction', discipline: 'elv', docType: 'document',
};
const REGISTER = [AS_BUILT, OM_DOC, WARRANTY_DOC];

const facts = (over: Partial<HandoverReadinessFacts> = {}): HandoverReadinessFacts => ({
  systemsTotal: 1,
  systemsCommissioningReady: 1,
  notReadyReasons: [],
  documents: REGISTER,
  omItems: [
    { commissioningId: SYSTEM, deliverable: 'om_manual', required: true, state: 'accepted', documentId: 'DOC-OM-001' },
    { commissioningId: SYSTEM, deliverable: 'warranty_certificate', required: true, state: 'accepted', documentId: 'DOC-WAR-001' },
  ],
  trainingSessions: [{ commissioningId: SYSTEM, state: 'acknowledged' }],
  // TC-GATE-8: as-builts are per system, so the baseline links one to the system it documents.
  asBuiltLinks: [{ commissioningId: SYSTEM, documentId: 'ELV-AB-001' }],
  systemIds: [SYSTEM],
  asserted: { spares: true },
  ...over,
});

const itemOf = (over: Partial<HandoverReadinessFacts>, id: string) =>
  assessHandoverReadiness(facts(over)).items.find((i) => i.id === id)!;

describe('TC-GATE-4 — the readiness projection', () => {
  it('is ready only when every item is', () => {
    const r = assessHandoverReadiness(facts());
    expect(r.readyToSubmit).toBe(true);
    expect(r.blocking).toEqual([]);
    // Order matters on screen: the five derived items first, then what is still somebody's word.
    expect(r.items.map((i) => i.id)).toEqual(['commissioning', 'asBuilts', 'omManuals', 'warrantyDocs', 'training', 'spares']);
  });

  it('marks which items are evidence and which are somebody’s word', () => {
    const byId = new Map(assessHandoverReadiness(facts()).items.map((i) => [i.id, i]));
    expect(byId.get('commissioning')!.evidence).toBe('projected');
    expect(byId.get('asBuilts')!.evidence).toBe('projected');
    // TC-GATE-5 moved these two from asserted to projected — the move the gate exists to make.
    expect(byId.get('omManuals')!.evidence).toBe('projected');
    expect(byId.get('training')!.evidence).toBe('projected');
    // TC-GATE-6 moved warranty documents too: the O&M pack already held the authority, unread.
    expect(byId.get('warrantyDocs')!.evidence).toBe('projected');
    // Spares is the only assertion left, and it says so in its own reason.
    expect(byId.get('spares')!.evidence).toBe('asserted');
    expect(byId.get('spares')!.reason).toMatch(/nothing verifies this/i);
  });

  describe('O&M pack', () => {
    it('is UNKNOWN while a system has no deliverables listed', () => {
      const item = itemOf({ omItems: [] }, 'omManuals');
      expect(item.state).toBe('UNKNOWN');
      expect(item.reason).toMatch(/nothing listed/i);
    });

    it('blocks while a required deliverable is not accepted, and counts only the required ones', () => {
      const blocked = itemOf({
        omItems: [
          { commissioningId: SYSTEM, deliverable: 'om_manual', required: true, state: 'reviewed', documentId: 'DOC-OM-001' },
          { commissioningId: SYSTEM, deliverable: 'licences', required: false, state: 'required', documentId: null },
        ],
      }, 'omManuals');
      expect(blocked.state).toBe('BLOCKED');
      expect(blocked.reason).toContain('1 of 1');
    });

    it('is READY once every required deliverable is accepted against a real document', () => {
      const ready = itemOf({
        omItems: [
          { commissioningId: SYSTEM, deliverable: 'om_manual', required: true, state: 'accepted', documentId: 'DOC-OM-001' },
          { commissioningId: SYSTEM, deliverable: 'licences', required: false, state: 'required', documentId: null },
        ],
      }, 'omManuals');
      expect(ready.state).toBe('READY');
    });

    it('a deliverable waived on every system is READY, not UNKNOWN — waiving is a decision', () => {
      const waived = itemOf({
        omItems: [{ commissioningId: SYSTEM, deliverable: 'om_manual', required: false, state: 'required', documentId: null }],
      }, 'omManuals');
      expect(waived.state).toBe('READY');
      expect(waived.reason).toMatch(/not required/i);
    });
  });

  // ── TC-GATE-6: the reference has to point at something ─────────────────────────────────────────

  describe('document references', () => {
    it('blocks an accepted deliverable whose reference is not in the register', () => {
      const item = itemOf({
        omItems: [{ commissioningId: SYSTEM, deliverable: 'om_manual', required: true, state: 'accepted', documentId: 'DOC-TYPO-999' }],
      }, 'omManuals');
      expect(item.state).toBe('BLOCKED');
      expect(item.reason).toMatch(/not in the project register/i);
    });

    it('blocks an accepted deliverable that points at a superseded revision', () => {
      const item = itemOf({
        documents: [{ ...OM_DOC, status: 'superseded' }],
        omItems: [{ commissioningId: SYSTEM, deliverable: 'om_manual', required: true, state: 'accepted', documentId: 'DOC-OM-001' }],
      }, 'omManuals');
      expect(item.state).toBe('BLOCKED');
      expect(item.reason).toMatch(/superseded/i);
    });

    it('resolves by document number as well as id, because that is what a person types', () => {
      const byId = itemOf({
        omItems: [{ commissioningId: SYSTEM, deliverable: 'om_manual', required: true, state: 'accepted', documentId: 'doc-om' }],
      }, 'omManuals');
      expect(byId.state).toBe('READY');
    });

    it('is UNKNOWN — not READY — when the register cannot be read at all', () => {
      const item = itemOf({ documents: null }, 'omManuals');
      expect(item.state).toBe('UNKNOWN');
      expect(item.reason).toMatch(/unverified/i);
      expect(assessHandoverReadiness(facts({ documents: null })).readyToSubmit).toBe(false);
    });
  });

  describe('warranty certificates', () => {
    it('are their own item, derived from the pack rather than ticked', () => {
      const item = itemOf({}, 'warrantyDocs');
      expect(item.state).toBe('READY');
      expect(item.source).toMatch(/O&M pack/i);
    });

    it('block on their own without also failing the rest of the pack — the two are disjoint', () => {
      const over = {
        omItems: [
          { commissioningId: SYSTEM, deliverable: 'om_manual', required: true, state: 'accepted', documentId: 'DOC-OM-001' },
          { commissioningId: SYSTEM, deliverable: 'warranty_certificate', required: true, state: 'submitted', documentId: 'DOC-WAR-001' },
        ],
      };
      expect(itemOf(over, 'warrantyDocs').state).toBe('BLOCKED');
      // One cause, one failure: the rest of the pack is unaffected.
      expect(itemOf(over, 'omManuals').state).toBe('READY');
    });

    it('are UNKNOWN when the pack never listed one', () => {
      const item = itemOf({
        omItems: [{ commissioningId: SYSTEM, deliverable: 'om_manual', required: true, state: 'accepted', documentId: 'DOC-OM-001' }],
      }, 'warrantyDocs');
      expect(item.state).toBe('UNKNOWN');
    });
  });

  it('blocks while any system is not commissioning ready, and carries T&C’s own reason', () => {
    const item = itemOf({ systemsTotal: 2, systemsCommissioningReady: 1, notReadyReasons: ['TC-ACS-02: 1 linked ITP point not passed.'] }, 'commissioning');
    expect(item.state).toBe('BLOCKED');
    expect(item.reason).toContain('1 of 2');
    expect(item.reason).toContain('TC-ACS-02');
  });

  it('a project with nothing registered is UNKNOWN, not ready', () => {
    const item = itemOf({ systemsTotal: 0, systemsCommissioningReady: 0 }, 'commissioning');
    expect(item.state).toBe('UNKNOWN');
    expect(assessHandoverReadiness(facts({ systemsTotal: 0, systemsCommissioningReady: 0 })).readyToSubmit).toBe(false);
  });

  describe('as-builts (document control since TC-GATE-6, per system since TC-GATE-8)', () => {
    it('is UNKNOWN when the register cannot be read', () => {
      expect(itemOf({ documents: null }, 'asBuilts').state).toBe('UNKNOWN');
    });

    /**
     * THE REGRESSION TC-GATE-6 EXISTS FOR.
     *
     * Before it, this item read Engineering, whose `DrawingStatus` has no as-built value, so it could
     * never reach READY on data a real project could produce — every handover package was permanently
     * unsubmittable. The old test passed by handing the port a fabricated status.
     */
    it('reaches READY — which it could not do while the question went to Engineering', () => {
      const ready = itemOf({}, 'asBuilts');
      expect(ready.state).toBe('READY');
      expect(ready.source).toBe('Document control');
    });

    /**
     * THE WEAKNESS TC-GATE-8 CLOSES.
     *
     * One as-built anywhere in the register used to satisfy every system. Now the question is asked
     * once per system, and a system nobody has spoken about is UNKNOWN rather than carried by another
     * system's drawing.
     */
    it('is UNKNOWN for a system with nothing linked, even when the register holds an as-built', () => {
      const item = itemOf({ systemIds: [SYSTEM, 'sys-2'] }, 'asBuilts');
      expect(item.state).toBe('UNKNOWN');
      expect(item.reason).toMatch(/1 of 2 systems have no as-built drawing linked/i);
    });

    it('blocks when a linked drawing is not in the register', () => {
      const item = itemOf({ asBuiltLinks: [{ commissioningId: SYSTEM, documentId: 'ELV-AB-999' }] }, 'asBuilts');
      expect(item.state).toBe('BLOCKED');
      expect(item.reason).toMatch(/not a current as-built/i);
    });

    it('blocks when the linked drawing is in the register but is not marked as-built', () => {
      const item = itemOf({ asBuiltLinks: [{ commissioningId: SYSTEM, documentId: 'DOC-OM-001' }] }, 'asBuilts');
      expect(item.state).toBe('BLOCKED');
    });

    it('blocks when the linked as-built has since been superseded', () => {
      const item = itemOf({ documents: [{ ...AS_BUILT, status: 'superseded' }, OM_DOC, WARRANTY_DOC] }, 'asBuilts');
      expect(item.state).toBe('BLOCKED');
    });

    it('is READY when every system has one, counted per system rather than per project', () => {
      const item = itemOf({
        systemIds: [SYSTEM, 'sys-2'],
        documents: [AS_BUILT, { ...AS_BUILT, id: 'doc-ab2', documentNumber: 'ELV-AB-002' }, OM_DOC, WARRANTY_DOC],
        asBuiltLinks: [
          { commissioningId: SYSTEM, documentId: 'ELV-AB-001' },
          { commissioningId: 'sys-2', documentId: 'ELV-AB-002' },
        ],
        omItems: [
          { commissioningId: SYSTEM, deliverable: 'om_manual', required: true, state: 'accepted', documentId: 'DOC-OM-001' },
          { commissioningId: 'sys-2', deliverable: 'om_manual', required: true, state: 'accepted', documentId: 'DOC-OM-001' },
        ],
      }, 'asBuilts');
      expect(item.state).toBe('READY');
      expect(item.reason).toMatch(/2 in total/i);
    });
  });

  it('an unticked assertion blocks and explains why it cannot be derived', () => {
    const item = itemOf({ asserted: { spares: false } }, 'spares');
    expect(item.state).toBe('BLOCKED');
    expect(item.reason).toMatch(/no spares handover record is linked/i);
  });
});

// ── through the service, where the projection meets the real T&C calculation ────────────────────

function services(ports: {
  elv?: ElvEquipmentPort;
  quality?: QualityEvidencePort;
  engineering?: EngineeringReleasePort;
  docControl?: DocControlPort;
} = {}) {
  const events: DomainEvent[] = [];
  const store = new InMemoryCommissioningStore();
  const eventStore = { append: async (b: DomainEvent[]) => { events.push(...b); }, list: async () => [], listByAggregate: async () => [] };
  const commissioning = new CommissioningService(store as never, eventStore as never, ports.elv as never, ports.quality as never, ports.engineering as never, ports.docControl as never);
  const handover = new HandoverService(store as never, eventStore as never, commissioning, ports.docControl as never);
  return { commissioning, handover, events };
}

const readyPorts = {
  elv: { readProjectEquipment: async () => [{ id: 'd1', tag: 'CAM-001', system: 'cctv', status: 'installed', commissioningRecordId: null }] } as ElvEquipmentPort,
  quality: { readProjectQualityEvidence: async () => ({ ncrs: [], itps: [] }) } as QualityEvidencePort,
  engineering: { readProjectDrawingRelease: async () => [{ discipline: 'cctv', status: 'approved' }] } as EngineeringReleasePort,
  docControl: { readProjectDocuments: async () => REGISTER } as DocControlPort,
};

/**
 * The Gate-5 and Gate-8 half of a ready package: a complete O&M pack, an acknowledged training
 * session, and the as-built drawing LINKED to the system it documents — since TC-GATE-8 an as-built
 * sitting in the register no longer covers a system nobody linked it to.
 */
async function completePackAndTraining(handover: HandoverService, commissioning: CommissioningService, commissioningId: string) {
  await commissioning.linkAsBuilt(commissioningId, TENANT, { documentId: 'ELV-AB-001' });
  for (const [deliverable, documentId] of [['om_manual', 'DOC-OM-001'], ['warranty_certificate', 'DOC-WAR-001']] as const) {
    const item = await handover.addOmItem(TENANT, { commissioningId, deliverable });
    await handover.advanceOmItem(item.id, TENANT, 'submitted', { documentId });
    await handover.advanceOmItem(item.id, TENANT, 'reviewed');
    await handover.advanceOmItem(item.id, TENANT, 'accepted');
  }

  const session = await handover.planTraining(TENANT, { projectId: 'p1', commissioningId, title: 'CCTV operator training' });
  await handover.completeTraining(session.id, TENANT, { attendees: 'Client FM team (3)' });
  await handover.acknowledgeTraining(session.id, TENANT, { acknowledgedBy: 'Client Rep' });
}

async function commissionedProject(commissioning: CommissioningService) {
  const rec = await commissioning.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-01', title: 'CCTV', system: 'cctv' });
  const point = await commissioning.addTestItem(rec.id, TENANT, { pointNo: 'IMG-01', description: 'Camera image' });
  await commissioning.recordTestResult(rec.id, point.id, TENANT, { result: 'pass', actual: 'Image on VMS' });
  await commissioning.commission(rec.id, TENANT, { commissionedBy: 'Engineer', witnessedBy: 'Consultant' });
  return rec;
}

describe('TC-GATE-4 — a tick can no longer buy a submission', () => {
  it('refuses to tick any of the five derived items', async () => {
    const { handover } = services(readyPorts);
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-01', title: 'Tower A handover' });

    for (const key of ['testCertificates', 'asBuilts', 'omManuals', 'training', 'warrantyDocs'] as const) {
      await expect(handover.updateChecklist(pkg.id, TENANT, { [key]: true }), key)
        .rejects.toThrow(/only an item without an owning authority can be ticked/i);
    }
  });

  it('refuses the submission while a system is not commissioning ready, whatever is ticked', async () => {
    const { commissioning, handover } = services(readyPorts);
    // Registered, never tested — T&C's chain blocks, so handover must too.
    await commissioning.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-02', title: 'CCTV', system: 'cctv' });
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-02', title: 'Tower A handover' });
    await handover.updateChecklist(pkg.id, TENANT, { spares: true });

    await expect(handover.submit(pkg.id, TENANT)).rejects.toThrow(/not commissioning ready/i);
  });

  it('submits once the evidence supports it', async () => {
    const { commissioning, handover } = services(readyPorts);
    const system = await commissionedProject(commissioning);
    await completePackAndTraining(handover, commissioning, system.id);
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-03', title: 'Tower A handover' });
    await handover.updateChecklist(pkg.id, TENANT, { spares: true });

    const view = await handover.get(pkg.id, TENANT);
    expect(view!.readiness.readyToSubmit).toBe(true);
    expect(view!.readiness.items.find((i) => i.id === 'commissioning')!.reason).toMatch(/pass the full commissioning readiness chain/i);
    // The as-built gate reaches READY through a real register — impossible before TC-GATE-6.
    expect(view!.readiness.items.find((i) => i.id === 'asBuilts')!.state).toBe('READY');

    const submitted = await handover.submit(pkg.id, TENANT);
    expect(submitted.status).toBe('submitted');
  });

  it('blocks when document control is unwired, even with everything else in place', async () => {
    const { commissioning, handover } = services({ elv: readyPorts.elv, quality: readyPorts.quality, docControl: readyPorts.docControl });
    const system = await commissionedProject(commissioning);
    await completePackAndTraining(handover, commissioning, system.id);

    // Now take document control away and re-read: the same package, nothing else changed.
    const { handover: blind } = services({ elv: readyPorts.elv, quality: readyPorts.quality });
    const pkg = await blind.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-04', title: 'Tower A handover' });
    await blind.updateChecklist(pkg.id, TENANT, { spares: true });

    const view = await blind.get(pkg.id, TENANT);
    expect(view!.readiness.items.find((i) => i.id === 'asBuilts')!.state).toBe('UNKNOWN');
    await expect(blind.submit(pkg.id, TENANT)).rejects.toThrow(/handover evidence is complete/i);
  });

  // ── TC-GATE-6: the typo is caught where it is made ─────────────────────────────────────────────

  it('refuses to submit a deliverable against a reference the register does not hold', async () => {
    const { commissioning, handover } = services(readyPorts);
    const system = await commissionedProject(commissioning);
    const item = await handover.addOmItem(TENANT, { commissioningId: system.id, deliverable: 'om_manual' });

    await expect(handover.advanceOmItem(item.id, TENANT, 'submitted', { documentId: 'DOC-OM-O01' }))
      .rejects.toThrow(/must match a controlled document/i);
    // And the deliverable did not move: a refused write leaves no half-state behind.
    const after = (await handover.listOmItems(TENANT, 'p1')).find((i) => i.id === item.id)!;
    expect(after.state).toBe('required');
  });

  it('still records the work when document control is unwired — an absent port blocks proof, not work', async () => {
    const { commissioning, handover } = services({ elv: readyPorts.elv, quality: readyPorts.quality });
    const system = await commissionedProject(commissioning);
    const item = await handover.addOmItem(TENANT, { commissioningId: system.id, deliverable: 'om_manual' });

    const moved = await handover.advanceOmItem(item.id, TENANT, 'submitted', { documentId: 'DOC-OM-001' });
    expect(moved.state).toBe('submitted');
  });

  it('hands the screen the resolved document, without storing any of it', async () => {
    const { commissioning, handover } = services(readyPorts);
    const system = await commissionedProject(commissioning);
    const item = await handover.addOmItem(TENANT, { commissioningId: system.id, deliverable: 'om_manual' });
    await handover.advanceOmItem(item.id, TENANT, 'submitted', { documentId: 'DOC-OM-001' });

    const listed = (await handover.listOmItems(TENANT, 'p1')).find((i) => i.id === item.id)!;
    expect(listed.resolved!.document!.title).toBe('CCTV O&M manual');
    expect(listed.resolved!.document!.revision).toBe('B');
    // Stored: the reference and nothing else. The title above came from the register just now.
    expect(listed.documentId).toBe('DOC-OM-001');
    expect(Object.keys(listed)).not.toContain('title');
  });

  it('leaves acceptance and the warranty clock exactly as they were', async () => {
    const { commissioning, handover, events } = services(readyPorts);
    const system = await commissionedProject(commissioning);
    await completePackAndTraining(handover, commissioning, system.id);
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-05', title: 'Tower A handover' });
    await handover.updateChecklist(pkg.id, TENANT, { spares: true });
    await handover.submit(pkg.id, TENANT);

    const accepted = await handover.accept(pkg.id, TENANT, { clientRepresentative: 'Client Rep', warrantyMonths: 24 });
    expect(accepted.status).toBe('accepted');
    expect(accepted.warrantyStartDate).toBeTruthy();
    expect(accepted.warrantyMonths).toBe(24);
    // The deliver → maintain event is untouched: AMC still keys off this.
    const emitted = events.filter((e) => e.type === 'commissioning.handover.accepted');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload).toMatchObject({ warrantyMonths: 24, clientRepresentative: 'Client Rep' });
  });
});
