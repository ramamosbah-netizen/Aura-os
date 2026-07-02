import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTransmittalStore } from '../in-memory-transmittal-store';
import { InMemoryCorrespondenceStore } from '../in-memory-correspondence-store';
import { InMemorySubmittalStore } from '../in-memory-submittal-store';
import { InMemoryDrawingRegisterStore } from '../in-memory-drawing-register-store';
import { InMemoryTransmittalItemStore } from '../in-memory-transmittal-item-store';
import { DocControlService } from '../doccontrol.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';

// Service-workflow coverage for the drawing register (distribution matrix +
// revision lifecycle) and the submittal review-code round-trip.

const mockEvents = { appendWithClient: async () => [] } as unknown as EventStore;
const mockTx: TxRunner = { run: (fn) => fn(null) };

describe('Drawing register (service workflow)', () => {
  let svc: DocControlService;
  beforeEach(() => {
    svc = new DocControlService(
      new InMemoryTransmittalStore(),
      new InMemoryTransmittalItemStore(),
      new InMemoryCorrespondenceStore(),
      new InMemorySubmittalStore(),
      new InMemoryDrawingRegisterStore(),
      mockEvents,
      mockTx,
      new AccessService(),
    );
  });

  it('registers a document with a distribution matrix and revises it', async () => {
    const entry = await svc.createRegisterEntry({
      tenantId: 't1',
      projectId: 'p1',
      documentNumber: 'ELV-DWG-001',
      title: 'CCTV layout — basement',
      discipline: 'elv',
      distribution: ['Consultant', 'Main Contractor', 'Client'],
    });
    expect(entry.currentRevision).toBe('A');
    expect(entry.status).toBe('draft');
    expect(entry.distribution).toHaveLength(3);

    const revised = await svc.reviseRegisterEntry('t1', entry.id, 'B', 'for_construction', '2026-07-01');
    expect(revised.currentRevision).toBe('B');
    expect(revised.status).toBe('for_construction');
    expect(revised.revisionDate).toBe('2026-07-01');

    const byProject = await svc.listRegisterByProject('t1', 'p1');
    expect(byProject.map((e) => e.documentNumber)).toEqual(['ELV-DWG-001']);
  });

  it('rejects revising a register entry from another tenant', async () => {
    const entry = await svc.createRegisterEntry({ tenantId: 't1', projectId: 'p1', documentNumber: 'D-1', title: 'X' });
    await expect(svc.reviseRegisterEntry('t2', entry.id, 'B', 'for_review')).rejects.toThrow(/not found/);
  });

  it('walks a submittal through submit → return with review code', async () => {
    const submittal = await svc.createSubmittal({
      tenantId: 't1',
      projectId: 'p1',
      reference: 'SUB-001',
      title: 'Cable tray material submittal',
    });
    expect(submittal.status).toBe('draft');

    const submitted = await svc.submitSubmittal('t1', submittal.id);
    expect(submitted.status).toBe('submitted');

    const returned = await svc.returnSubmittal('t1', submittal.id, 'B', 'Approved with comments — resubmit shop dwgs');
    expect(returned.reviewCode).toBe('B');
    expect(returned.reviewComments).toContain('resubmit');
  });
});
