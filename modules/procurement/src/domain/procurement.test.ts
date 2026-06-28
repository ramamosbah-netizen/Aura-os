import { describe, expect, it } from 'vitest';
import { makePurchaseRequest } from './purchase-request';
import { makePurchaseOrder } from './purchase-order';
import { InMemoryPurchaseRequestStore } from '../in-memory-purchase-request-store';
import { InMemoryPurchaseOrderStore } from '../in-memory-purchase-order-store';
import { PurchaseRequestService } from '../purchase-request.service';
import { PurchaseOrderService } from '../purchase-order.service';
import { AccessService, type EventStore, NumberingService, AuditService, type TxRunner, type CommandBus, type Command, type CommandDefinition } from '@aura/core';

/** Minimal in-process CommandBus stand-in: runs validate + handler directly (no DB/authz). */
function fakeBus(): CommandBus {
  const handlers = new Map<string, CommandDefinition>();
  return {
    register: (def: CommandDefinition) => { handlers.set(def.name, def); },
    execute: async (cmd: Command) => {
      const def = handlers.get(cmd.name);
      if (!def) throw new Error(`no handler for ${cmd.name}`);
      if (def.validate) await def.validate(cmd.payload);
      return def.handler(cmd, null);
    },
  } as unknown as CommandBus;
}

const mockAccess = {
  assert: () => {},
} as unknown as AccessService;

const mockEvents = {
  append: async () => [],
  appendWithClient: async () => [],
} as unknown as EventStore;

const mockTx = { run: (fn: (h: unknown) => unknown) => fn(null) } as unknown as TxRunner;

const mockNumbering = {
  generateNextNumber: async () => 'PO-2026-000001',
} as unknown as NumberingService;

const mockAudit = {
  log: async () => {},
} as unknown as AuditService;

describe('Procurement Full Cycle', () => {
  describe('Purchase Request (PR)', () => {
    it('creates a Purchase Request domain model with correct defaults', () => {
      const pr = makePurchaseRequest({
        tenantId: 't1',
        title: 'Office laptops',
        value: 5000,
      });
      expect(pr.title).toBe('Office laptops');
      expect(pr.value).toBe(5000);
      expect(pr.status).toBe('draft');
    });

    it('auto-generates a draft Purchase Order on PR approval', async () => {
      const prStore = new InMemoryPurchaseRequestStore();
      const poStore = new InMemoryPurchaseOrderStore();

      const poService = new PurchaseOrderService(poStore, mockEvents, mockTx, fakeBus(), mockNumbering, mockAudit);
      poService.onModuleInit();
      const prService = new PurchaseRequestService(prStore, mockEvents, mockAccess, poService);


      const pr = await prService.create({
        tenantId: 't1',
        title: 'Office Laptops Request',
        value: 6500,
      });

      // Approve PR
      const approvedPr = await prService.changeStatus(pr.id, 'approved', 'actor-1');
      expect(approvedPr.status).toBe('approved');

      // Verify PO was auto-created
      const pos = await poService.list({ tenantId: 't1' });
      expect(pos.length).toBe(1);
      expect(pos[0].title).toBe('PO for Office Laptops Request');
      expect(pos[0].value).toBe(6500);
      expect(pos[0].status).toBe('draft');
    });
  });
});
