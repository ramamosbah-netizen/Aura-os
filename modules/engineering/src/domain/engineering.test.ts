import { describe, expect, it } from 'vitest';
import { makeDrawing } from './drawing';
import { makeRfi } from './rfi';
import { makeSubmittal } from './submittal';
import { InMemoryDrawingStore } from '../in-memory-drawing-store';
import { InMemoryRfiStore } from '../in-memory-rfi-store';
import { InMemorySubmittalStore } from '../in-memory-submittal-store';
import { InMemoryTechnicalQueryStore } from '../in-memory-technical-query-store';
import { InMemoryBimModelStore } from '../in-memory-bim-model-store';
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
