import { describe, expect, it } from 'vitest';
import { makeTransmittalItem } from './transmittal-item';
import { DocControlService } from '../doccontrol.service';
import { InMemoryTransmittalStore } from '../in-memory-transmittal-store';
import { InMemoryTransmittalItemStore } from '../in-memory-transmittal-item-store';
import { InMemoryCorrespondenceStore } from '../in-memory-correspondence-store';
import { InMemorySubmittalStore } from '../in-memory-submittal-store';
import { InMemoryDrawingRegisterStore } from '../in-memory-drawing-register-store';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';

const mockAccess = { assert: () => {} } as unknown as AccessService;
const mockEvents = { appendWithClient: async () => [] } as unknown as EventStore;
const mockTx: TxRunner = { run: (fn) => fn(null) };

function makeService(): DocControlService {
  return new DocControlService(
    new InMemoryTransmittalStore(),
    new InMemoryTransmittalItemStore(),
    new InMemoryCorrespondenceStore(),
    new InMemorySubmittalStore(),
    new InMemoryDrawingRegisterStore(),
    mockEvents,
    mockTx,
    mockAccess,
  );
}

const base = {
  tenantId: 't-1',
  transmittalId: 'trx-1',
  registerEntryId: 'reg-1',
  documentNumber: 'ARC-DWG-001',
  title: 'Ground floor plan',
  revision: 'B',
};

describe('transmittal item', () => {
  it('creates an item with snapshots and a default purpose', () => {
    const item = makeTransmittalItem(base);
    expect(item.id).toBeTruthy();
    expect(item.documentNumber).toBe('ARC-DWG-001');
    expect(item.revision).toBe('B');
    expect(item.purpose).toBe('for_information');
  });

  it('accepts an explicit purpose and rejects unknown ones', () => {
    expect(makeTransmittalItem({ ...base, purpose: 'for_construction' }).purpose).toBe('for_construction');
    expect(() => makeTransmittalItem({ ...base, purpose: 'for_fun' as never })).toThrow(/purpose/);
  });

  it('requires transmittal, register entry and revision', () => {
    expect(() => makeTransmittalItem({ ...base, transmittalId: '' })).toThrow(/transmittalId/);
    expect(() => makeTransmittalItem({ ...base, registerEntryId: '' })).toThrow(/registerEntryId/);
    expect(() => makeTransmittalItem({ ...base, revision: '  ' })).toThrow(/revision/);
  });
});

describe('transmittal ↔ register revision history (service)', () => {
  it('attaches register docs to transmittals and rebuilds the revision trail', async () => {
    const service = makeService();
    const entry = await service.createRegisterEntry({
      tenantId: 't1',
      projectId: 'p1',
      documentNumber: 'STR-DWG-100',
      title: 'Raft foundation',
      currentRevision: 'A',
    });

    const trxA = await service.createTransmittal({ tenantId: 't1', projectId: 'p1', code: 'TRA-001', title: 'Issue rev A', recipient: 'Consultant' });
    const itemsA = await service.addTransmittalItems('t1', trxA.id, [{ registerEntryId: entry.id, purpose: 'for_review' }]);
    expect(itemsA[0].revision).toBe('A'); // defaults to current revision

    await service.reviseRegisterEntry('t1', entry.id, 'B', 'for_construction');
    const trxB = await service.createTransmittal({ tenantId: 't1', projectId: 'p1', code: 'TRA-002', title: 'Issue rev B', recipient: 'Contractor' });
    await service.addTransmittalItems('t1', trxB.id, [{ registerEntryId: entry.id, purpose: 'for_construction' }]);

    const { entry: current, history } = await service.registerEntryHistory('t1', entry.id);
    expect(current.currentRevision).toBe('B');
    expect(history).toHaveLength(2);
    // both items can land in the same millisecond — assert by revision, not order
    const revA = history.find((h) => h.revision === 'A');
    const revB = history.find((h) => h.revision === 'B');
    expect(revB).toMatchObject({ transmittalCode: 'TRA-002', recipient: 'Contractor', purpose: 'for_construction' });
    expect(revA).toMatchObject({ transmittalCode: 'TRA-001', recipient: 'Consultant', purpose: 'for_review' });
  });

  it('rejects items for register entries of another project', async () => {
    const service = makeService();
    const entry = await service.createRegisterEntry({ tenantId: 't1', projectId: 'p-OTHER', documentNumber: 'X-1', title: 'Other' });
    const trx = await service.createTransmittal({ tenantId: 't1', projectId: 'p1', code: 'TRA-003', title: 'Wrong project' });
    await expect(service.addTransmittalItems('t1', trx.id, [{ registerEntryId: entry.id }])).rejects.toThrow(/another project/);
  });
});
