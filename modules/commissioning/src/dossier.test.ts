import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@aura/shared';
import { CommissioningService } from './commissioning.service';
import { HandoverService } from './handover.service';
import { InMemoryCommissioningStore } from './in-memory-commissioning-store';
import { assembleDossier, captureDossier, groupIssues, type DossierFacts } from './domain/dossier';
import type { ControlledDocumentFact } from './domain/document-reference';
import type { DocControlPort, ElvEquipmentPort, EngineeringReleasePort, QualityEvidencePort } from './ports';

/**
 * TC-GATE-7 — the handover dossier.
 *
 * Two properties carry this gate, and the tests are shaped around them:
 *
 *   DERIVED — the view owns nothing. It is assembled from four domains on every read, so a change in
 *             any of them shows up here without anything being written.
 *   ISSUED  — the manifest does not move. Once a package is submitted, what it cited stays cited,
 *             whatever happens afterwards to the things it cites. That is the one thing stored, and
 *             the reason it is stored.
 *
 * The test that matters most is the last one: submit, then change the world, then read the issue
 * again and find it unchanged.
 */

const TENANT = 't-gate7';
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

const facts = (over: Partial<DossierFacts> = {}): DossierFacts => ({
  systems: [{
    id: SYSTEM, code: 'TC-CCTV-01', title: 'CCTV — Tower A', commissioned: true, witnessedBy: 'Consultant',
    pointsPassed: 4, pointsTotal: 4,
    // TC-GATE-10: the evidence pack registered as a controlled document.
    certificate: { documentNumber: 'CX-CERT-001', revision: 'A', current: true, note: null },
  }],
  omItems: [{ id: 'om-1', commissioningId: SYSTEM, deliverable: 'om_manual', required: true, state: 'accepted', documentId: 'DOC-OM-001' }],
  trainingSessions: [{ id: 'tr-1', title: 'CCTV operator training', state: 'acknowledged', acknowledgedBy: 'Client Rep' }],
  // TC-GATE-8: the as-built is linked to the system it documents, not merely present on the project.
  asBuiltLinks: [{ id: 'ab-1', commissioningId: SYSTEM, documentId: 'ELV-AB-001' }],
  documents: REGISTER,
  ...over,
});

const sectionOf = (view: ReturnType<typeof assembleDossier>, kind: string) => view.sections.find((s) => s.kind === kind)!;

describe('TC-GATE-7 — the dossier is assembled, never owned', () => {
  it('gathers all four authorities, and names the domain behind each', () => {
    const view = assembleDossier(facts());
    expect(view.sections.map((s) => s.kind)).toEqual([
      'commissioning_certificate', 'as_built_document', 'om_deliverable', 'training_session',
    ]);
    expect(sectionOf(view, 'commissioning_certificate').source).toBe('Testing & commissioning');
    expect(sectionOf(view, 'as_built_document').source).toBe('Document control');
    expect(view.includedTotal).toBe(4);
    expect(view.outstanding).toEqual([]);
  });

  it('shows what is NOT in the pack, with the reason — a short dossier must say why it is short', () => {
    const view = assembleDossier(facts({
      systems: [{
        id: SYSTEM, code: 'TC-CCTV-01', title: 'CCTV — Tower A', commissioned: false, witnessedBy: null,
        pointsPassed: 2, pointsTotal: 4, certificate: null,
      }],
    }));
    const cert = sectionOf(view, 'commissioning_certificate').entries[0];
    expect(cert.included).toBe(false);
    expect(cert.note).toMatch(/2 of 4 test points passed/i);
    expect(view.outstanding).toHaveLength(1);
  });

  // ── TC-GATE-10: the certificate line cites a controlled document when one is registered ───────

  describe('commissioning certificates', () => {
    const system = (certificate: DossierFacts['systems'][number]['certificate']) => ([{
      id: SYSTEM, code: 'TC-CCTV-01', title: 'CCTV — Tower A', commissioned: true, witnessedBy: 'Consultant',
      pointsPassed: 4, pointsTotal: 4, certificate,
    }]);

    it('cites the document number and revision when one is registered', () => {
      const entry = sectionOf(assembleDossier(facts()), 'commissioning_certificate').entries[0];
      expect(entry.included).toBe(true);
      expect(entry.reference).toBe('CX-CERT-001');
      expect(entry.state).toBe('commissioned · CX-CERT-001 rev A');
    });

    it('still issues the pack when none is registered, and says so on the line', () => {
      const entry = sectionOf(assembleDossier(facts({ systems: system(null) })), 'commissioning_certificate').entries[0];
      // The evidence exists either way — a missing certificate is not a missing evidence pack.
      expect(entry.included).toBe(true);
      expect(entry.state).toBe('commissioned · evidence pack only');
      expect(entry.note).toMatch(/no controlled certificate is registered/i);
      expect(entry.reference).toBe('TC-CCTV-01');
    });

    it('falls back to the system code and carries the reason when the certificate is not current', () => {
      const entry = sectionOf(assembleDossier(facts({
        systems: system({ documentNumber: 'CX-CERT-001', revision: 'B', current: false, note: 'The register has superseded the revision this points at.' }),
      })), 'commissioning_certificate').entries[0];
      expect(entry.reference).toBe('TC-CCTV-01');
      expect(entry.note).toMatch(/superseded/i);
    });
  });

  it('excludes an O&M deliverable accepted against a reference the register does not hold', () => {
    const view = assembleDossier(facts({
      omItems: [{ id: 'om-1', commissioningId: SYSTEM, deliverable: 'om_manual', required: true, state: 'accepted', documentId: 'DOC-TYPO' }],
    }));
    const entry = sectionOf(view, 'om_deliverable').entries[0];
    expect(entry.included).toBe(false);
    expect(entry.note).toMatch(/no document .* is in the project register/i);
  });

  it('excludes one pointing at a superseded revision, and says which way it is wrong', () => {
    const view = assembleDossier(facts({ documents: [{ ...OM_DOC, status: 'superseded' }] }));
    const entry = sectionOf(view, 'om_deliverable').entries[0];
    expect(entry.included).toBe(false);
    expect(entry.note).toMatch(/superseded/i);
  });

  it('carries the register’s own revision on the line, read now rather than remembered', () => {
    const entry = assembleDossier(facts()).sections.find((s) => s.kind === 'om_deliverable')!.entries[0];
    expect(entry.state).toBe('accepted · rev B');
    expect(entry.reference).toBe('DOC-OM-001');
  });

  it('excludes both the as-built and the O&M line when document control could not be read', () => {
    const view = assembleDossier(facts({ documents: null }));
    // Unverified is not verified — for either.
    expect(sectionOf(view, 'as_built_document').entries[0].included).toBe(false);
    expect(sectionOf(view, 'as_built_document').entries[0].note).toMatch(/could not be read/i);
    expect(sectionOf(view, 'om_deliverable').entries[0].included).toBe(false);
    expect(sectionOf(view, 'om_deliverable').entries[0].note).toMatch(/could not be read/i);
  });

  it('gives a system with no linked as-built a line of its own saying so (TC-GATE-8)', () => {
    const view = assembleDossier(facts({ asBuiltLinks: [] }));
    const entry = sectionOf(view, 'as_built_document').entries[0];
    expect(entry.included).toBe(false);
    expect(entry.label).toMatch(/TC-CCTV-01 — as-built drawing/i);
    expect(entry.note).toMatch(/no controlled drawing has been linked/i);
  });

  it('excludes a linked drawing that is in the register but not marked as-built', () => {
    const view = assembleDossier(facts({ asBuiltLinks: [{ id: 'ab-1', commissioningId: SYSTEM, documentId: 'DOC-OM-001' }] }));
    const entry = sectionOf(view, 'as_built_document').entries[0];
    expect(entry.included).toBe(false);
    expect(entry.note).toMatch(/not an as-built/i);
  });

  it('ignores deliverables marked not required — waiving one is a decision, not a gap', () => {
    const view = assembleDossier(facts({
      omItems: [{ id: 'om-1', commissioningId: SYSTEM, deliverable: 'licences', required: false, state: 'required', documentId: null }],
    }));
    expect(sectionOf(view, 'om_deliverable').entries).toEqual([]);
  });

  it('leaves training out until the CLIENT has acknowledged it', () => {
    const view = assembleDossier(facts({
      trainingSessions: [{ id: 'tr-1', title: 'CCTV operator training', state: 'completed', acknowledgedBy: null }],
    }));
    const entry = sectionOf(view, 'training_session').entries[0];
    expect(entry.included).toBe(false);
    expect(entry.note).toMatch(/has not acknowledged/i);
  });
});

describe('TC-GATE-7 — capture', () => {
  const pkg = { id: 'ho-1', tenantId: TENANT, companyId: null, projectId: 'p1' };

  it('captures only what would actually be sent', () => {
    const view = assembleDossier(facts({
      trainingSessions: [{ id: 'tr-1', title: 'Not acknowledged', state: 'completed', acknowledgedBy: null }],
    }));
    const manifest = captureDossier(view, pkg, 1);
    expect(manifest.map((i) => i.kind).sort()).toEqual(['as_built_document', 'commissioning_certificate', 'om_deliverable']);
    expect(manifest.every((i) => i.issueNo === 1)).toBe(true);
  });

  it('refuses an issue number below one', () => {
    expect(() => captureDossier(assembleDossier(facts()), pkg, 0)).toThrow(/issue number must be 1 or greater/i);
  });

  it('groups issues newest first', () => {
    const one = captureDossier(assembleDossier(facts()), pkg, 1);
    const two = captureDossier(assembleDossier(facts()), pkg, 2);
    expect(groupIssues([...one, ...two]).map((g) => g.issueNo)).toEqual([2, 1]);
  });
});

// ── through the service, against the real readiness gate ────────────────────────────────────────

function services(ports: {
  elv?: ElvEquipmentPort; quality?: QualityEvidencePort; engineering?: EngineeringReleasePort; docControl?: DocControlPort;
} = {}) {
  const events: DomainEvent[] = [];
  const store = new InMemoryCommissioningStore();
  const eventStore = { append: async (b: DomainEvent[]) => { events.push(...b); }, list: async () => [], listByAggregate: async () => [] };
  const commissioning = new CommissioningService(store as never, eventStore as never, ports.elv as never, ports.quality as never, ports.engineering as never, ports.docControl as never);
  const handover = new HandoverService(store as never, eventStore as never, commissioning, ports.docControl as never);
  return { commissioning, handover, store };
}

/** A register the DocControl port hands back, which a test can move under the package's feet. */
function movableRegister() {
  let register: ControlledDocumentFact[] = [...REGISTER];
  return {
    port: { readProjectDocuments: async () => register } as DocControlPort,
    supersede(documentNumber: string) {
      register = register.map((d) => (d.documentNumber === documentNumber ? { ...d, status: 'superseded', revision: 'C' } : d));
    },
  };
}

const readyPorts = () => {
  const registry = movableRegister();
  return {
    registry,
    ports: {
      elv: { readProjectEquipment: async () => [{ id: 'd1', tag: 'CAM-001', system: 'cctv', status: 'installed', commissioningRecordId: null }] } as ElvEquipmentPort,
      quality: { readProjectQualityEvidence: async () => ({ ncrs: [], itps: [], snags: [] }) } as QualityEvidencePort,
      // T&C's own pre-commissioning chain still reads Engineering for drawing RELEASE — a different
      // question to the as-built one, and one Engineering can answer (TC-GATE-6).
      engineering: { readProjectDrawingRelease: async () => [{ discipline: 'cctv', status: 'approved' }] } as EngineeringReleasePort,
      docControl: registry.port,
    },
  };
};

async function readyProject(commissioning: CommissioningService, handover: HandoverService) {
  const rec = await commissioning.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-01', title: 'CCTV', system: 'cctv' });
  const point = await commissioning.addTestItem(rec.id, TENANT, { pointNo: 'IMG-01', description: 'Camera image' });
  await commissioning.recordTestResult(rec.id, point.id, TENANT, { result: 'pass', actual: 'Image on VMS' });
  await commissioning.commission(rec.id, TENANT, { commissionedBy: 'Engineer', witnessedBy: 'Consultant' });

  // TC-GATE-8: the as-built must be linked to THIS system, not merely present on the project.
  await commissioning.linkAsBuilt(rec.id, TENANT, { documentId: 'ELV-AB-001' });

  for (const [deliverable, documentId] of [['om_manual', 'DOC-OM-001'], ['warranty_certificate', 'DOC-WAR-001']] as const) {
    const item = await handover.addOmItem(TENANT, { commissioningId: rec.id, deliverable });
    await handover.advanceOmItem(item.id, TENANT, 'submitted', { documentId });
    await handover.advanceOmItem(item.id, TENANT, 'reviewed');
    await handover.advanceOmItem(item.id, TENANT, 'accepted');
  }
  const session = await handover.planTraining(TENANT, { projectId: 'p1', commissioningId: rec.id, title: 'CCTV operator training' });
  await handover.completeTraining(session.id, TENANT, { attendees: 'Client FM team (3)' });
  await handover.acknowledgeTraining(session.id, TENANT, { acknowledgedBy: 'Client Rep' });
  return rec;
}

describe('TC-GATE-7 — an issued manifest does not move', () => {
  it('captures nothing until the package is submitted', async () => {
    const { ports } = readyPorts();
    const { commissioning, handover } = services(ports);
    await readyProject(commissioning, handover);
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-01', title: 'Tower A handover' });

    const before = await handover.readDossier(pkg.id, TENANT);
    expect(before!.issues).toEqual([]);
    // The derived view is already full — the pack exists, it just has not been sent.
    expect(before!.view.includedTotal).toBeGreaterThan(0);
  });

  it('captures what was sent on submit, and the numbers agree with the view', async () => {
    const { ports } = readyPorts();
    const { commissioning, handover } = services(ports);
    await readyProject(commissioning, handover);
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-02', title: 'Tower A handover' });
    await handover.updateChecklist(pkg.id, TENANT, { spares: true });

    const view = (await handover.readDossier(pkg.id, TENANT))!.view;
    await handover.submit(pkg.id, TENANT, 'u-admin');

    const after = await handover.readDossier(pkg.id, TENANT);
    expect(after!.issues).toHaveLength(1);
    expect(after!.issues[0].issueNo).toBe(1);
    expect(after!.issues[0].issuedBy).toBe('u-admin');
    expect(after!.issues[0].items).toHaveLength(view.includedTotal);
  });

  /**
   * THE PROPERTY THIS GATE EXISTS FOR.
   *
   * Submit, then move the world: the register supersedes the manual the pack cited. The DERIVED view
   * must notice — that is what it is for. The ISSUED manifest must not — that is what it is for.
   */
  it('still says what was sent after the register moves on', async () => {
    const { registry, ports } = readyPorts();
    const { commissioning, handover } = services(ports);
    await readyProject(commissioning, handover);
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-03', title: 'Tower A handover' });
    await handover.updateChecklist(pkg.id, TENANT, { spares: true });
    await handover.submit(pkg.id, TENANT, 'u-admin');

    const issued = (await handover.readDossier(pkg.id, TENANT))!.issues[0];
    const citedManual = issued.items.find((i) => i.reference === 'DOC-OM-001')!;
    expect(citedManual.state).toBe('accepted · rev B');

    registry.supersede('DOC-OM-001');

    const after = await handover.readDossier(pkg.id, TENANT);
    // The derived view notices immediately.
    const line = after!.view.sections.find((s) => s.kind === 'om_deliverable')!.entries.find((e) => e.reference === 'DOC-OM-001')!;
    expect(line.included, 'today’s pack must not include a superseded document').toBe(false);
    expect(line.note).toMatch(/superseded/i);
    // The issued manifest does not.
    expect(after!.issues[0].items.find((i) => i.reference === 'DOC-OM-001')!.state).toBe('accepted · rev B');
  });

  it('a rework after rejection is issue 2, and issue 1 is left exactly as it went out', async () => {
    const { ports } = readyPorts();
    const { commissioning, handover } = services(ports);
    const system = await readyProject(commissioning, handover);
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-04', title: 'Tower A handover' });
    await handover.updateChecklist(pkg.id, TENANT, { spares: true });
    await handover.submit(pkg.id, TENANT, 'u-admin');

    const first = (await handover.readDossier(pkg.id, TENANT))!.issues[0];
    const firstCount = first.items.length;

    await handover.reject(pkg.id, TENANT, 'Client wants the licences pack included');
    // The rework: one more deliverable, accepted against a real document.
    const licences = await handover.addOmItem(TENANT, { commissioningId: system.id, deliverable: 'licences' });
    await handover.advanceOmItem(licences.id, TENANT, 'submitted', { documentId: 'DOC-OM-001' });
    await handover.advanceOmItem(licences.id, TENANT, 'reviewed');
    await handover.advanceOmItem(licences.id, TENANT, 'accepted');
    await handover.submit(pkg.id, TENANT, 'u-admin');

    const issues = (await handover.readDossier(pkg.id, TENANT))!.issues;
    expect(issues.map((i) => i.issueNo)).toEqual([2, 1]);
    expect(issues[0].items.length, 'the second issue carries the added deliverable').toBe(firstCount + 1);
    expect(issues[1].items.length, 'the first issue is what it always was').toBe(firstCount);
  });

  it('cannot be rewritten through the store either — the adapter refuses a duplicate citation', async () => {
    const { ports } = readyPorts();
    const { commissioning, handover, store } = services(ports);
    await readyProject(commissioning, handover);
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-05', title: 'Tower A handover' });
    await handover.updateChecklist(pkg.id, TENANT, { spares: true });
    await handover.submit(pkg.id, TENANT, 'u-admin');

    const captured = await store.listDossierItems(pkg.id, TENANT);
    await expect(store.appendDossierItems([captured[0]])).rejects.toThrow(/already cited/i);
  });

  it('refuses a submission the evidence does not support, and captures nothing', async () => {
    const { ports } = readyPorts();
    const { commissioning, handover, store } = services(ports);
    await commissioning.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-02', title: 'CCTV', system: 'cctv' });
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-06', title: 'Tower A handover' });

    await expect(handover.submit(pkg.id, TENANT)).rejects.toThrow(/not commissioning ready/i);
    expect(await store.listDossierItems(pkg.id, TENANT), 'a refused submission leaves no phantom issue').toEqual([]);
  });
});
