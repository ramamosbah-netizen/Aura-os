import { describe, expect, it } from 'vitest';
import { makeDrawing } from './drawing';
import { makeRfi } from './rfi';
import { makeSubmittal } from './submittal';
import { makeTechnicalQuery } from './technical-query';
import { toDiscipline } from './discipline';
import { makeDesignChange, decideDesignChange, triggersVariation } from './design-change';
import { makeEngineeringDocument, transitionDocument, ownerModuleOf, isDocType, getDocumentDefinition } from './engineering-document';
import { InMemoryDrawingStore } from '../in-memory-drawing-store';
import { InMemoryRfiStore } from '../in-memory-rfi-store';
import { InMemorySubmittalStore } from '../in-memory-submittal-store';
import { InMemoryTechnicalQueryStore } from '../in-memory-technical-query-store';
import { InMemoryBimModelStore } from '../in-memory-bim-model-store';
import { InMemoryDesignChangeStore } from '../in-memory-design-change-store';
import { InMemoryEngineeringDocumentStore } from '../in-memory-engineering-document-store';
import { EngineeringService } from '../engineering.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';

const mockAccess = {
  assert: () => {},
} as unknown as AccessService;

const mockEvents = {
  appendWithClient: async () => [],
} as unknown as EventStore;

const mockTx: TxRunner = {
  run: (fn) => fn(null),
};

describe('Discipline dimension (ADR-0012 shared dimension)', () => {
  it('defaults every engineering aggregate to "other" when unset', () => {
    const base = { tenantId: 't1', projectId: 'p1', code: 'X', title: 'T' };
    expect(makeDrawing(base).discipline).toBe('other');
    expect(makeRfi({ ...base, question: 'q' }).discipline).toBe('other');
    expect(makeSubmittal({ ...base, submittalType: 'material' }).discipline).toBe('other');
    expect(makeTechnicalQuery({ ...base, query: 'q' }).discipline).toBe('other');
  });

  it('carries a fine-grained discipline through creation', () => {
    const d = makeDrawing({ tenantId: 't1', projectId: 'p1', code: 'E-101', title: 'Power', discipline: 'electrical' });
    expect(d.discipline).toBe('electrical');
  });

  it('normalises casing/whitespace and falls back to "other" for unknown values', () => {
    expect(toDiscipline('  ELV ')).toBe('elv');
    expect(toDiscipline('Fire_Alarm')).toBe('fire_alarm');
    expect(toDiscipline('plumbing')).toBe('plumbing');
    expect(toDiscipline('nonsense')).toBe('other');
    expect(toDiscipline(null)).toBe('other');
  });

  it('keeps legacy coarse values (mep/coordination) valid for existing TQ/BIM data', () => {
    expect(toDiscipline('mep')).toBe('mep');
    expect(toDiscipline('coordination')).toBe('coordination');
  });
});

describe('Design Change → Variation trigger (ADR-0011 event composition)', () => {
  const base = { tenantId: 't1', projectId: 'p1', code: 'DC-1', title: 'Revised riser', discipline: 'electrical' as const };

  it('defaults to draft/addition, no cost impact, zero value', () => {
    const dc = makeDesignChange(base);
    expect(dc.status).toBe('draft');
    expect(dc.changeType).toBe('addition');
    expect(dc.costImpact).toBe(false);
    expect(dc.estimatedValue).toBe(0);
    expect(triggersVariation(dc)).toBe(false);
  });

  it('triggers a variation only when approved AND cost-impacting AND value > 0', () => {
    const withImpact = makeDesignChange({ ...base, costImpact: true, estimatedValue: 12000 });
    expect(triggersVariation(withImpact)).toBe(false); // still draft
    const approved = decideDesignChange(withImpact, 'approved', 'u-qs');
    expect(approved.status).toBe('approved');
    expect(approved.decidedBy).toBe('u-qs');
    expect(triggersVariation(approved)).toBe(true);
  });

  it('does NOT trigger when approved but no cost impact', () => {
    const noImpact = makeDesignChange({ ...base, costImpact: false, estimatedValue: 5000 });
    expect(triggersVariation(decideDesignChange(noImpact, 'approved', 'u-qs'))).toBe(false);
  });

  it('does NOT trigger when rejected', () => {
    const dc = makeDesignChange({ ...base, costImpact: true, estimatedValue: 9000 });
    expect(triggersVariation(decideDesignChange(dc, 'rejected', 'u-qs'))).toBe(false);
  });

  it('clamps a negative estimated value to zero', () => {
    expect(makeDesignChange({ ...base, estimatedValue: -500 }).estimatedValue).toBe(0);
  });
});

describe('Engineering Document — one aggregate, many docTypes (ADR-0011 point-6)', () => {
  const base = { tenantId: 't1', projectId: 'p1', code: 'MS-1', title: 'Concrete pour', discipline: 'structural' as const };

  it('is a single aggregate discriminated by docType, sharing one lifecycle + revision + discipline', () => {
    const ms = makeEngineeringDocument({ ...base, docType: 'method_statement' });
    expect(ms.docType).toBe('method_statement');
    expect(ms.status).toBe('draft');
    expect(ms.revision).toBe('A');
    expect(ms.discipline).toBe('structural');
    expect(ms.fields).toEqual({});
    const approved = transitionDocument(ms, 'approved', 'u-eng');
    expect(approved.status).toBe('approved');
    expect(approved.decidedBy).toBe('u-eng');
  });

  it('owns a Risk Assessment under HSE, everything else under Engineering (per decision)', () => {
    expect(ownerModuleOf('risk_assessment')).toBe('hse');
    expect(makeEngineeringDocument({ ...base, docType: 'risk_assessment' }).ownerModule).toBe('hse');
    expect(ownerModuleOf('method_statement')).toBe('engineering');
    expect(ownerModuleOf('calc_sheet')).toBe('engineering');
  });

  it('carries type-specific data in the form-engine fields payload', () => {
    const ra = makeEngineeringDocument({ ...base, docType: 'risk_assessment', fields: { hazard: 'fall', likelihood: 3, severity: 4 } });
    expect(ra.fields).toEqual({ hazard: 'fall', likelihood: 3, severity: 4 });
  });

  it('validates docType', () => {
    expect(isDocType('method_statement')).toBe(true);
    expect(isDocType('nonsense')).toBe(false);
    expect(() => makeEngineeringDocument({ ...base, docType: 'nonsense' as never })).toThrow();
  });

  it('exposes each type as a Definition — behaviour read from metadata, not a switch (ADR-0017)', () => {
    const ra = getDocumentDefinition('risk_assessment');
    expect(ra).toMatchObject({ ownerModule: 'hse', workflow: 'hse-review', formSchemaId: 'engineering.risk_assessment' });
    const ms = getDocumentDefinition('method_statement');
    expect(ms).toMatchObject({ ownerModule: 'engineering', workflow: 'engineering-review' });
    // ownerModuleOf delegates to the definition (no parallel source of truth)
    expect(ownerModuleOf('risk_assessment')).toBe(ra.ownerModule);
  });
});

describe('Engineering Module Bounded Context', () => {
  describe('Drawings', () => {
    it('creates a new shop drawing in draft status', () => {
      const d = makeDrawing({
        tenantId: 't1',
        projectId: 'p1',
        code: 'A-101',
        title: 'Architectural Layout Plan',
      });
      expect(d.code).toBe('A-101');
      expect(d.title).toBe('Architectural Layout Plan');
      expect(d.revision).toBe('0');
      expect(d.status).toBe('draft');
    });

    it('manages drawings through the service layer', async () => {
      const drawingStore = new InMemoryDrawingStore();
      const rfiStore = new InMemoryRfiStore();
      const submittalStore = new InMemorySubmittalStore();
      
      const service = new EngineeringService(
        drawingStore,
        rfiStore,
        submittalStore,
        new InMemoryTechnicalQueryStore(),
        new InMemoryBimModelStore(),
        new InMemoryDesignChangeStore(),
        new InMemoryEngineeringDocumentStore(),
        mockEvents,
        mockTx,
        mockAccess
      );

      const d = await service.createDrawing({
        tenantId: 't1',
        projectId: 'p1',
        code: 'S-201',
        title: 'Structural Foundation Details',
      });

      expect(d.status).toBe('draft');
      
      const revised = await service.reviseDrawing('t1', null, d.id, {
        revision: '1',
        title: 'Structural Foundation Details (Issued for Construction)',
      });

      expect(revised.revision).toBe('1');
      expect(revised.title).toContain('Issued for Construction');

      const approved = await service.approveDrawing('t1', null, d.id);
      expect(approved.status).toBe('approved');
    });
  });

  describe('RFIs', () => {
    it('raises and answers RFIs', async () => {
      const drawingStore = new InMemoryDrawingStore();
      const rfiStore = new InMemoryRfiStore();
      const submittalStore = new InMemorySubmittalStore();

      const service = new EngineeringService(
        drawingStore,
        rfiStore,
        submittalStore,
        new InMemoryTechnicalQueryStore(),
        new InMemoryBimModelStore(),
        new InMemoryDesignChangeStore(),
        new InMemoryEngineeringDocumentStore(),
        mockEvents,
        mockTx,
        mockAccess
      );

      const rfi = await service.createRfi({
        tenantId: 't1',
        projectId: 'p1',
        code: 'RFI-001',
        title: 'Rebar spacing mismatch',
        question: 'Drawing S-201 says 150mm, but schedule says 200mm. Please clarify.',
      });

      expect(rfi.status).toBe('open');
      expect(rfi.answer).toBeNull();

      const answered = await service.answerRfi('t1', null, rfi.id, 'Confirming 150mm spacing is correct.');
      expect(answered.status).toBe('answered');
      expect(answered.answer).toBe('Confirming 150mm spacing is correct.');
    });
  });

  describe('Technical Submittals', () => {
    it('submits and processes submittal states', async () => {
      const drawingStore = new InMemoryDrawingStore();
      const rfiStore = new InMemoryRfiStore();
      const submittalStore = new InMemorySubmittalStore();

      const service = new EngineeringService(
        drawingStore,
        rfiStore,
        submittalStore,
        new InMemoryTechnicalQueryStore(),
        new InMemoryBimModelStore(),
        new InMemoryDesignChangeStore(),
        new InMemoryEngineeringDocumentStore(),
        mockEvents,
        mockTx,
        mockAccess
      );

      const sub = await service.createSubmittal({
        tenantId: 't1',
        projectId: 'p1',
        code: 'SUB-MEP-001',
        title: 'HVAC Ductwork Material Submittal',
        submittalType: 'material',
      });

      expect(sub.status).toBe('draft');
      expect(sub.submittalType).toBe('material');

      const submitted = await service.updateSubmittalStatus('t1', null, sub.id, 'submitted');
      expect(submitted.status).toBe('submitted');

      const approved = await service.updateSubmittalStatus('t1', null, sub.id, 'approved');
      expect(approved.status).toBe('approved');
    });

    it('automatically registers and revises shop drawings when a drawing submittal is approved', async () => {
      const drawingStore = new InMemoryDrawingStore();
      const service = new EngineeringService(
        drawingStore,
        new InMemoryRfiStore(),
        new InMemorySubmittalStore(),
        new InMemoryTechnicalQueryStore(),
        new InMemoryBimModelStore(),
        new InMemoryDesignChangeStore(),
        new InMemoryEngineeringDocumentStore(),
        mockEvents,
        mockTx,
        mockAccess
      );

      const sub = await service.createSubmittal({
        tenantId: 't1',
        projectId: 'proj-123',
        code: 'DRW-ARC-501',
        title: 'Main Lobby Finishing Layout',
        submittalType: 'drawing',
      });

      const initialDrawing = await drawingStore.getLatestByCode('t1', 'proj-123', 'DRW-ARC-501');
      expect(initialDrawing).toBeNull();

      await service.updateSubmittalStatus('t1', null, sub.id, 'approved');

      const createdDrawing = await drawingStore.getLatestByCode('t1', 'proj-123', 'DRW-ARC-501');
      expect(createdDrawing).not.toBeNull();
      expect(createdDrawing?.code).toBe('DRW-ARC-501');
      expect(createdDrawing?.revision).toBe('1');
      expect(createdDrawing?.status).toBe('approved');

      const sub2 = await service.createSubmittal({
        tenantId: 't1',
        projectId: 'proj-123',
        code: 'DRW-ARC-501',
        title: 'Main Lobby Finishing Layout - Revision B',
        submittalType: 'drawing',
      });

      await service.updateSubmittalStatus('t1', null, sub2.id, 'approved');

      const revisedDrawing = await drawingStore.getLatestByCode('t1', 'proj-123', 'DRW-ARC-501');
      expect(revisedDrawing?.revision).toBe('2');
      expect(revisedDrawing?.status).toBe('approved');
    });
  });

  describe('Technical Queries', () => {
    it('creates and responds to technical queries', async () => {
      const drawingStore = new InMemoryDrawingStore();
      const rfiStore = new InMemoryRfiStore();
      const submittalStore = new InMemorySubmittalStore();
      const tqStore = new InMemoryTechnicalQueryStore();

      const service = new EngineeringService(
        drawingStore,
        rfiStore,
        submittalStore,
        tqStore,
        new InMemoryBimModelStore(),
        new InMemoryDesignChangeStore(),
        new InMemoryEngineeringDocumentStore(),
        mockEvents,
        mockTx,
        mockAccess
      );

      const tq = await service.createTechnicalQuery({
        tenantId: 't1',
        projectId: 'p1',
        code: 'TQ-001',
        title: 'Clashing at column C3',
        query: 'Structural beams clash with MEP ducts. Please review.',
        priority: 'high',
        discipline: 'structural',
      });

      expect(tq.status).toBe('open');
      expect(tq.priority).toBe('high');
      expect(tq.discipline).toBe('structural');
      expect(tq.response).toBeNull();

      const responded = await service.respondTechnicalQuery('t1', null, tq.id, 'Redirect MEP ducts 200mm to the east.');
      expect(responded.status).toBe('responded');
      expect(responded.response).toBe('Redirect MEP ducts 200mm to the east.');
      expect(responded.respondedAt).toBeDefined();
    });
  });
});
