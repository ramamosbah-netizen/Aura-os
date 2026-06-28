import { describe, expect, it } from 'vitest';
import { makeAccount } from './account';
import { makeJournal } from './journal';
import { makePayment } from './payment';
import { makeInvoice } from './invoice';
import { InMemoryAccountStore } from '../in-memory-account-store';
import { InMemoryJournalStore } from '../in-memory-journal-store';
import { InMemoryPaymentStore } from '../in-memory-payment-store';
import { InMemoryInvoiceStore } from '../in-memory-invoice-store';
import { AccountService } from '../account.service';
import { JournalService } from '../journal.service';
import { PaymentService } from '../payment.service';
import { InvoiceService } from '../invoice.service';
import { AccessService, type EventStore, NumberingService, AuditService, type TxRunner, type CommandBus, type Command, type CommandDefinition } from '@aura/core';
import { PurchaseOrderService, InMemoryPurchaseOrderStore } from '@aura/procurement';
import { GoodsReceiptService, InMemoryGoodsReceiptStore } from '@aura/inventory';

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

// Mock AccessService, EventStore, NumberingService, and AuditService
const mockAccess = {
  assert: () => {},
} as unknown as AccessService;

const mockEvents = {
  append: async () => [],
  appendWithClient: async () => [],
} as unknown as EventStore;

const mockTx = { run: (fn: (h: unknown) => unknown) => fn(null) } as unknown as TxRunner;

const mockNumbering = {
  generateNextNumber: async (tenantId: string, companyId: string | null, module: string, entity: string, prefix: string) => `${prefix}-2026-000001`,
} as unknown as NumberingService;

const mockAudit = {
  log: async () => {},
} as unknown as AuditService;


describe('Finance depth features', () => {
  describe('Chart of Accounts', () => {
    it('creates account domain model with correct properties', () => {
      const account = makeAccount({
        tenantId: 't1',
        code: '1010',
        name: 'Main Bank Account',
        type: 'asset',
      });
      expect(account.code).toBe('1010');
      expect(account.name).toBe('Main Bank Account');
      expect(account.type).toBe('asset');
      expect(account.parentId).toBeNull();
    });

    it('AccountService prevents duplicate codes', async () => {
      const store = new InMemoryAccountStore();
      const service = new AccountService(store, mockAccess);

      await service.create({
        tenantId: 't1',
        code: '1010',
        name: 'Main Bank Account',
        type: 'asset',
      });

      await expect(
        service.create({
          tenantId: 't1',
          code: '1010',
          name: 'Backup Bank Account',
          type: 'asset',
        })
      ).rejects.toThrow('Account code 1010 already exists for this tenant');
    });
  });

  describe('Double-Entry Journals', () => {
    it('succeeds when debits equal credits', () => {
      const j = makeJournal({
        tenantId: 't1',
        description: 'Manual adjustment',
        lines: [
          { accountId: 'a1', accountCode: '1010', accountName: 'Bank', debit: 100, credit: 0 },
          { accountId: 'a2', accountCode: '3000', accountName: 'Equity', debit: 0, credit: 100 },
        ],
      });
      expect(j.lines.length).toBe(2);
      expect(j.lines[0].debit).toBe(100);
      expect(j.lines[1].credit).toBe(100);
    });

    it('fails when debits do not equal credits', () => {
      expect(() =>
        makeJournal({
          tenantId: 't1',
          description: 'Unbalanced adjustment',
          lines: [
            { accountId: 'a1', accountCode: '1010', accountName: 'Bank', debit: 100, credit: 0 },
            { accountId: 'a2', accountCode: '3000', accountName: 'Equity', debit: 0, credit: 99 },
          ],
        })
      ).toThrow('Double-entry validation failed');
    });
  });

  describe('Payments & Invoice Reconciliation', () => {
    it('records payments, pays invoice, and posts double-entry journals', async () => {
      const invoiceStore = new InMemoryInvoiceStore();
      const accountStore = new InMemoryAccountStore();
      const journalStore = new InMemoryJournalStore();
      const paymentStore = new InMemoryPaymentStore();

      const mockPurchaseOrders = {
        get: async () => null,
      } as unknown as PurchaseOrderService;

      const mockGoodsReceipts = {
        list: async () => [],
      } as unknown as GoodsReceiptService;

      const invoiceService = new InvoiceService(
        invoiceStore,
        mockEvents,
        mockTx,
        fakeBus(),
        mockPurchaseOrders,
        mockGoodsReceipts,
        mockNumbering,
        mockAudit,
      );
      invoiceService.onModuleInit();
      const accountService = new AccountService(accountStore, mockAccess);
      const journalService = new JournalService(journalStore, mockEvents, mockAccess);
      const paymentService = new PaymentService(
        paymentStore,
        mockEvents,
        mockAccess,
        invoiceService,
        journalService,
        accountService,
      );

      // Create test invoice
      const invoice = await invoiceService.create({
        tenantId: 't1',
        title: 'Office Rent Invoice',
        value: 1200,
        status: 'approved',
      });

      // Create bank account
      const bank = await accountService.create({
        tenantId: 't1',
        code: '1010',
        name: 'Main Bank Account',
        type: 'asset',
      });

      // Record payment
      const payment = await paymentService.record({
        tenantId: 't1',
        invoiceId: invoice.id,
        bankAccountId: bank.id,
        amount: 1200,
        reference: 'TX-9988',
      });

      expect(payment.amount).toBe(1200);

      // Verify invoice status changed to paid
      const updatedInvoice = await invoiceService.get(invoice.id);
      expect(updatedInvoice?.status).toBe('paid');

      // Verify double-entry journals were posted
      const journals = await journalService.list({ tenantId: 't1' });
      expect(journals.length).toBe(1);
      expect(journals[0].reference).toBe(payment.id);

      const lines = journals[0].lines;
      expect(lines.length).toBe(2);

      // Debit Accounts Payable (liability account code 2010 was auto-seeded)
      const apLine = lines.find((l) => l.accountCode === '2010');
      expect(apLine?.debit).toBe(1200);
      expect(apLine?.credit).toBe(0);

      // Credit Main Bank Account (asset account code 1010)
      const bankLine = lines.find((l) => l.accountCode === '1010');
      expect(bankLine?.debit).toBe(0);
      expect(bankLine?.credit).toBe(1200);
    });
  });

  describe('3-Way Matching Logic', () => {
    it('reconciles correctly against PO, GRN, and Invoice values', async () => {
      const poStore = new InMemoryPurchaseOrderStore();
      const grnStore = new InMemoryGoodsReceiptStore();
      const invoiceStore = new InMemoryInvoiceStore();

      const poService = new PurchaseOrderService(poStore, mockEvents, mockTx, fakeBus(), mockNumbering, mockAudit);
      poService.onModuleInit();
      const grnService = new GoodsReceiptService(grnStore, mockEvents, fakeBus());
      grnService.onModuleInit();

      const mockPurchaseOrders = poService;
      const mockGoodsReceipts = grnService;

      const invoiceService = new InvoiceService(
        invoiceStore,
        mockEvents,
        mockTx,
        fakeBus(),
        mockPurchaseOrders,
        mockGoodsReceipts,
        mockNumbering,
        mockAudit,
      );
      invoiceService.onModuleInit();

      // 1. Create and issue PO
      const po = await poService.create({
        tenantId: 't1',
        title: 'Cables Supply PO',
        value: 1000,
      });
      await poService.changeStatus(po.id, 'issued');

      // 2. Create Invoice referencing PO
      const invoice = await invoiceService.create({
        tenantId: 't1',
        title: 'Cables Invoice',
        value: 1000,
        poId: po.id,
        poTitle: po.title,
      });

      // Match fails because no GRN is registered yet
      const match1 = await invoiceService.checkThreeWayMatch(invoice.id);
      expect(match1.matched).toBe(false);
      expect(match1.reason).toContain('exceeds total received GRN value (0)');

      // 3. Register Goods Receipt Note (GRN) matching the value
      await grnService.create({
        tenantId: 't1',
        title: 'Cables delivery',
        poId: po.id,
        poTitle: po.title,
        value: 1000,
        status: 'received',
      });

      // Match passes now
      const match2 = await invoiceService.checkThreeWayMatch(invoice.id);
      expect(match2.matched).toBe(true);

      // Approve should succeed now
      const approvedInvoice = await invoiceService.changeStatus(invoice.id, 'approved');
      expect(approvedInvoice.status).toBe('approved');
    });

    it('rejects invoice approval if invoice value exceeds PO value', async () => {
      const poStore = new InMemoryPurchaseOrderStore();
      const grnStore = new InMemoryGoodsReceiptStore();
      const invoiceStore = new InMemoryInvoiceStore();

      const poService = new PurchaseOrderService(poStore, mockEvents, mockTx, fakeBus(), mockNumbering, mockAudit);
      poService.onModuleInit();
      const grnService = new GoodsReceiptService(grnStore, mockEvents, fakeBus());
      grnService.onModuleInit();

      const invoiceService = new InvoiceService(
        invoiceStore,
        mockEvents,
        mockTx,
        fakeBus(),
        poService,
        grnService,
        mockNumbering,
        mockAudit,
      );
      invoiceService.onModuleInit();

      const po = await poService.create({
        tenantId: 't1',
        title: 'Cement Supply',
        value: 2000,
      });
      await poService.changeStatus(po.id, 'issued');

      // Register GRN of 2500 (excess delivery)
      await grnService.create({
        tenantId: 't1',
        title: 'Cement Delivery',
        poId: po.id,
        poTitle: po.title,
        value: 2500,
        status: 'received',
      });

      // Supplier bills 2500
      const invoice = await invoiceService.create({
        tenantId: 't1',
        title: 'Cement Invoice',
        value: 2500,
        poId: po.id,
        poTitle: po.title,
      });

      // Match fails because it exceeds the ordered PO value
      const match = await invoiceService.checkThreeWayMatch(invoice.id);
      expect(match.matched).toBe(false);
      expect(match.reason).toContain('exceeds PO value (2000)');

      // Approving directly throws validation exception
      await expect(
        invoiceService.changeStatus(invoice.id, 'approved')
      ).rejects.toThrow('3-Way Match validation failed');
    });
  });
});
