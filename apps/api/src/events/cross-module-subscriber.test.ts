import { describe, it, expect, beforeEach } from 'vitest';
import { makeEvent } from '@aura/shared';
import {
  EventBus,
  InMemoryEventStore,
  NullTxRunner,
  AccessService,
  IdempotencyService,
  LockService,
  CommandBus,
  NumberingService,
  AuditService,
  TenantContext,
} from '@aura/core';
import { OpportunityService, InMemoryOpportunityStore } from '@aura/crm';
import { TenderService, InMemoryTenderStore, InMemoryBOQStore } from '@aura/tendering';
import { ContractService, InMemoryContractStore } from '@aura/contracts';
import {
  ProjectService,
  InMemoryProjectStore,
  WbsService,
  InMemoryWbsStore,
  CbsService,
  InMemoryCbsStore,
} from '@aura/projects';
import { CustomerInvoiceService, InMemoryCustomerInvoiceStore } from '@aura/finance';
import { CrossModuleSubscriber } from './cross-module-subscriber';

/**
 * End-to-end proof that the deal chain is wired and automated through the
 * event reactor (CrossModuleSubscriber) — entirely in-memory, no DB, no Nest DI.
 *
 * Drives the real services and lets the InMemoryEventStore relay each emitted
 * event to the bus (the stand-in for the Postgres outbox relay), exactly as
 * production does. Asserts every downstream record is auto-created with the
 * source references carried down, that the chain is idempotent under event
 * re-delivery, and that an auto-created project is seeded with WBS + CBS.
 */
const tenantId = 'tenant-e2e';

function buildHarness() {
  const bus = new EventBus();
  const events = new InMemoryEventStore(bus);
  const tx = new NullTxRunner();
  const access = new AccessService();
  const idempotency = new IdempotencyService(null);
  const lock = new LockService();
  const commands = new CommandBus(access, idempotency, lock, tx);
  const numbering = new NumberingService(null);
  const tenant = new TenantContext();
  const audit = new AuditService(null, tenant);

  // CRM
  const opportunities = new OpportunityService(
    new InMemoryOpportunityStore(),
    events,
    tx,
    access,
    // AiService isn't constructed here; opportunity.update never calls the model.
    { complete: async () => ({ text: '' }) } as any,
  );

  // Deal-chain services (each registers its create command on the shared bus).
  const tenders = new TenderService(
    new InMemoryTenderStore(),
    new InMemoryBOQStore(),
    events,
    tx,
    commands,
    numbering,
    audit,
  );
  const contracts = new ContractService(new InMemoryContractStore(), events, tx, commands);
  const projects = new ProjectService(new InMemoryProjectStore(), events, tx, commands);
  const wbs = new WbsService(new InMemoryWbsStore(), events, access);
  const cbs = new CbsService(new InMemoryCbsStore(), events);
  const customerInvoices = new CustomerInvoiceService(new InMemoryCustomerInvoiceStore(), events, { getRate: async () => 1 } as any);

  // Register command handlers (Nest would call these via OnModuleInit).
  tenders.onModuleInit();
  contracts.onModuleInit();
  projects.onModuleInit();

  // Services the reactor depends on but these tests don't exercise.
  const noop = {} as any;

  const mockFinanceAccounts = {
    getByCode: async (tenantId: string, code: string) => {
      return { id: `acc-${code}`, code, name: `Account ${code}` };
    },
    create: async (input: any) => {
      return { id: `acc-${input.code}`, code: input.code, name: input.name };
    },
  } as any;

  const postedJournals: any[] = [];
  const mockJournals = {
    list: async (filter: any) => {
      return postedJournals.filter(j => j.reference === filter.reference);
    },
    post: async (input: any) => {
      postedJournals.push(input);
      return { id: 'journal-1', ...input };
    },
  } as any;

  const createdApInvoices: any[] = [];
  const usedIdempotencyKeys = new Set<string>();
  const mockSupplierInvoices = {
    create: async (input: any, idempotencyKey?: string) => {
      if (idempotencyKey && usedIdempotencyKeys.has(idempotencyKey)) {
        return createdApInvoices.find((i: any) => true); // return first as cached
      }
      if (idempotencyKey) usedIdempotencyKeys.add(idempotencyKey);
      const invoice = { id: `inv-${createdApInvoices.length + 1}`, ...input };
      createdApInvoices.push(invoice);
      return invoice;
    },
  } as any;

  const createdPrs: any[] = [];
  const mockPurchaseRequests = {
    create: async (input: any) => {
      const pr = { id: `pr-${createdPrs.length + 1}`, ...input };
      createdPrs.push(pr);
      return pr;
    },
  } as any;

  const createdVariations: any[] = [];
  const mockVariations = {
    list: async () => createdVariations,
    create: async (input: any) => {
      const vo = { id: `vo-${createdVariations.length + 1}`, ...input };
      createdVariations.push(vo);
      return vo;
    },
  } as any;

  const subscriber = new CrossModuleSubscriber(
    bus,
    contracts,
    projects,
    wbs,
    cbs,
    mockVariations, // VariationService
    tenant,
    noop, // PurchaseOrderService
    mockPurchaseRequests,
    tenders,
    noop, // AccountService (CRM)
    customerInvoices,
    mockSupplierInvoices, // InvoiceService (AP)
    mockFinanceAccounts, // AccountService (Finance) — GL account resolver
    mockJournals, // JournalService
  );
  subscriber.onModuleInit(); // subscribe the reactor to the bus

  return { bus, events, opportunities, tenders, contracts, projects, wbs, cbs, customerInvoices, postedJournals, createdApInvoices, createdPrs, createdVariations };
}

describe('CrossModuleSubscriber — deal chain automation (in-memory E2E)', () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    h = buildHarness();
  });

  it('auto-creates Tender → Contract → Project, carrying references down the chain', async () => {
    // 1. Opportunity (for a client account) won → Tender (draft), named after the
    //    opportunity and carrying the client snapshot down from the very first link.
    const opp = await h.opportunities.create({
      tenantId,
      title: 'Marina Tower ELV',
      value: 1_000_000,
      accountId: 'acct-1',
      accountName: 'Acme Developments LLC',
    });
    await h.opportunities.update(opp.id, { stage: 'won' });

    const tenders = await h.tenders.list();
    expect(tenders).toHaveLength(1);
    expect(tenders[0].title).toBe('Tender: Marina Tower ELV'); // proves the title-propagation fix
    expect(tenders[0].value).toBe(1_000_000);
    expect(tenders[0].accountName).toBe('Acme Developments LLC'); // proves opportunity→tender account carry-down
    const tender = tenders[0];

    // 2. Tender awarded → Contract (draft).
    await h.tenders.changeStatus(tender.id, 'won');
    const contracts = await h.contracts.list({ tenderId: tender.id });
    expect(contracts).toHaveLength(1);
    expect(contracts[0].tenderId).toBe(tender.id);
    expect(contracts[0].accountName).toBe('Acme Developments LLC');
    expect(contracts[0].value).toBe(1_000_000);
    const contract = contracts[0];

    // 3. Contract signed → Project (planned).
    await h.contracts.changeStatus(contract.id, 'active');
    const projects = await h.projects.list({ contractId: contract.id });
    expect(projects).toHaveLength(1);
    expect(projects[0].contractId).toBe(contract.id);
    expect(projects[0].accountName).toBe('Acme Developments LLC');
    expect(projects[0].value).toBe(1_000_000);
  });

  it('is idempotent: re-delivered award/sign events do not duplicate downstream records', async () => {
    const opp = await h.opportunities.create({ tenantId, title: 'Idem Job', value: 500 });
    await h.opportunities.update(opp.id, { stage: 'won' });
    const tender = (await h.tenders.list())[0];

    // Award the tender twice (simulates an at-least-once outbox re-delivery).
    await h.tenders.changeStatus(tender.id, 'won');
    await h.tenders.changeStatus(tender.id, 'won');
    expect(await h.contracts.list({ tenderId: tender.id })).toHaveLength(1);

    const contract = (await h.contracts.list({ tenderId: tender.id }))[0];
    // Sign the contract twice.
    await h.contracts.changeStatus(contract.id, 'active');
    await h.contracts.changeStatus(contract.id, 'active');
    expect(await h.projects.list({ contractId: contract.id })).toHaveLength(1);

    // And re-winning the same opportunity must not spawn a second tender.
    await h.opportunities.update(opp.id, { stage: 'won' });
    expect(await h.tenders.list()).toHaveLength(1);
  });

  it('auto-drafts a Variation from an approved cost-impacting design change (Engineering → Commercial)', async () => {
    const emit = (payload: Record<string, unknown>) =>
      h.events.append([
        makeEvent({
          type: 'engineering.design_change.approved',
          tenantId,
          companyId: null,
          actorId: 'u-eng',
          aggregateType: 'engineering.design_change',
          aggregateId: 'dc-1',
          payload,
        }),
      ]);

    // Approved + cost impact → one draft addition variation carrying the value.
    await emit({ triggersVariation: true, projectId: 'proj-9', projectName: 'Marina Tower',
      changeType: 'addition', estimatedValue: 12000, code: 'DC-1', title: 'Revised riser' });
    expect(h.createdVariations).toHaveLength(1);
    expect(h.createdVariations[0].type).toBe('addition');
    expect(h.createdVariations[0].amount).toBe(12000);
    expect(h.createdVariations[0].projectId).toBe('proj-9');

    // Re-delivery of the same event (aggregateId dc-1) must not duplicate.
    await emit({ triggersVariation: true, projectId: 'proj-9', projectName: 'Marina Tower',
      changeType: 'addition', estimatedValue: 12000, code: 'DC-1', title: 'Revised riser' });
    expect(h.createdVariations).toHaveLength(1);

    // A design change with no cost impact must not create anything.
    await h.events.append([
      makeEvent({ type: 'engineering.design_change.approved', tenantId, companyId: null, actorId: 'u-eng',
        aggregateType: 'engineering.design_change', aggregateId: 'dc-2',
        payload: { triggersVariation: false, projectId: 'proj-9', changeType: 'addition', estimatedValue: 0, code: 'DC-2' } }),
    ]);
    expect(h.createdVariations).toHaveLength(1);
  });

  it('seeds the auto-created project with a root WBS node + CBS from the tender BOQ', async () => {
    const opp = await h.opportunities.create({ tenantId, title: 'BOQ Job', value: 0 });
    await h.opportunities.update(opp.id, { stage: 'won' });
    const tender = (await h.tenders.list())[0];

    // Give the tender a BOQ; this also recalculates its value.
    const { boq } = await h.tenders.getOrCreateBOQ(tenantId, null, tender.id);
    await h.tenders.addBOQItem(tenantId, null, boq.id, {
      itemCode: '1',
      description: 'Earthworks',
      unit: 'm3',
      quantity: 100,
      rate: 50,
    });

    await h.tenders.changeStatus(tender.id, 'won');
    const contract = (await h.contracts.list({ tenderId: tender.id }))[0];
    await h.contracts.changeStatus(contract.id, 'active');
    const project = (await h.projects.list({ contractId: contract.id }))[0];

    const wbsNodes = await h.wbs.list({ projectId: project.id });
    expect(wbsNodes.length).toBeGreaterThanOrEqual(1);
    expect(wbsNodes.some((n) => n.code === '1')).toBe(true);

    const cbsNodes = await h.cbs.list({ projectId: project.id });
    expect(cbsNodes.length).toBeGreaterThanOrEqual(1);
    const earthworks = cbsNodes.find((n) => n.code === '1');
    expect(earthworks?.budgetAmount).toBe(5000); // 100 × 50

    // Re-signing must not double-seed the breakdown.
    await h.contracts.changeStatus(contract.id, 'active');
    expect((await h.wbs.list({ projectId: project.id })).filter((n) => n.code === '1')).toHaveLength(1);
  });

  it('does not double-bill an AR invoice when an IPC-certified event is re-delivered', async () => {
    const ipcEvent = makeEvent({
      type: 'contracts.ipc.certified',
      tenantId,
      companyId: null,
      actorId: null,
      aggregateType: 'contracts.ipc',
      aggregateId: 'ipc-1',
      payload: {
        account: { id: 'acct-1', name: 'Acme Developments LLC' },
        netThisCertificate: 250_000,
        reference: 'IPC-001',
        contractId: 'contract-abc-12345678',
      },
    });

    await h.bus.publish(ipcEvent);
    await h.bus.publish(ipcEvent); // re-delivery

    const invoices = await h.customerInvoices.list({ tenantId });
    expect(invoices).toHaveLength(1);
    expect(invoices[0].customerName).toBe('Acme Developments LLC');
  });

  it('posts a balanced GL journal entry when an asset is disposed', async () => {
    const disposalEvent = makeEvent({
      type: 'assets.asset.disposed',
      tenantId,
      companyId: 'company-1',
      actorId: 'actor-1',
      aggregateType: 'assets.asset',
      aggregateId: 'asset-123',
      payload: {
        assetName: 'Laser Leveler',
        method: 'sell',
        proceeds: 1200,
        bookValue: 1000,
        gainLoss: 200,
      },
    });

    await h.bus.publish(disposalEvent);

    expect(h.postedJournals).toHaveLength(1);
    const j = h.postedJournals[0];
    expect(j.companyId).toBe('company-1');
    expect(j.reference).toBe('DISP-asset-12');
    expect(j.description).toContain('Laser Leveler');

    const fixedAssetLine = j.lines.find((l: any) => l.accountCode === '1500');
    const bankLine = j.lines.find((l: any) => l.accountCode === '1010');
    const gainLine = j.lines.find((l: any) => l.accountCode === '4920');

    expect(fixedAssetLine.credit).toBe(1000);
    expect(bankLine.debit).toBe(1200);
    expect(gainLine.credit).toBe(200);
  });

  it('posts a balanced GL journal entry with loss when an asset is disposed for less than book value', async () => {
    const disposalEvent = makeEvent({
      type: 'assets.asset.disposed',
      tenantId,
      companyId: 'company-1',
      actorId: 'actor-1',
      aggregateType: 'assets.asset',
      aggregateId: 'asset-456',
      payload: {
        assetName: 'Excavator Model S',
        method: 'scrap',
        proceeds: 500,
        bookValue: 800,
        gainLoss: -300,
      },
    });

    await h.bus.publish(disposalEvent);

    const j = h.postedJournals.find((j: any) => j.reference === 'DISP-asset-45');
    expect(j).toBeDefined();

    const fixedAssetLine = j!.lines.find((l: any) => l.accountCode === '1500');
    const bankLine = j!.lines.find((l: any) => l.accountCode === '1010');
    const lossLine = j!.lines.find((l: any) => l.accountCode === '5920');

    expect(fixedAssetLine.credit).toBe(800);
    expect(bankLine.debit).toBe(500);
    expect(lossLine.debit).toBe(300);
  });

  it('auto-drafts an AP invoice when a subcontract claim is certified', async () => {
    const claimEvent = makeEvent({
      type: 'subcontracts.claim.statusChanged',
      tenantId,
      companyId: 'company-1',
      actorId: 'certifier-1',
      aggregateType: 'subcontracts.claim',
      aggregateId: 'claim-001',
      payload: {
        status: 'certified',
        claimNumber: 1,
        netCertifiedValue: 45000,
        retentionWithheld: 5000,
        isRetentionRelease: false,
        retentionReleased: 0,
        subcontractId: 'sc-abc',
        subcontractor: 'Al Falah Steel Works',
        subcontractTitle: 'Structural Steel Package',
        projectId: 'proj-xyz',
        projectName: 'Marina Tower',
      },
    });

    await h.bus.publish(claimEvent);

    expect(h.createdApInvoices).toHaveLength(1);
    const inv = h.createdApInvoices[0];
    expect(inv.supplierName).toBe('Al Falah Steel Works');
    expect(inv.value).toBe(45000);
    expect(inv.projectId).toBe('proj-xyz');
    expect(inv.projectName).toBe('Marina Tower');
    expect(inv.title).toContain('Al Falah Steel Works');
    expect(inv.title).toContain('#1');
  });

  it('auto-drafts a replenishment PR when an issue crosses the reorder level', async () => {
    const movement = (quantity: number, balanceAfter: number) =>
      makeEvent({
        type: 'inventory.stock.movement_recorded',
        tenantId,
        companyId: null,
        actorId: null,
        aggregateType: 'inventory.stock',
        aggregateId: 'item-cbl',
        payload: {
          direction: 'out',
          quantity,
          balanceAfter,
          reorderLevel: 50,
          reorderQty: 200,
          avgCost: 2.5,
          code: 'CBL-CAT6',
          name: 'Cat6 Cable',
          unit: 'box',
        },
      });

    // 60 → 40: crosses the level (50) → exactly one PR at reorderQty × WAC.
    await h.bus.publish(movement(20, 40));
    expect(h.createdPrs).toHaveLength(1);
    expect(h.createdPrs[0].reference).toBe('PR-RO-CBL-CAT6');
    expect(h.createdPrs[0].value).toBe(500); // 200 × 2.5
    expect(h.createdPrs[0].status).toBe('draft');

    // 40 → 30: already below the level → no second PR for the same dip.
    await h.bus.publish(movement(10, 30));
    expect(h.createdPrs).toHaveLength(1);
  });

  it('does not draft a PR for receipts or items without a reorder policy', async () => {
    await h.bus.publish(
      makeEvent({
        type: 'inventory.stock.movement_recorded',
        tenantId, companyId: null, actorId: null,
        aggregateType: 'inventory.stock', aggregateId: 'item-x',
        payload: { direction: 'in', quantity: 10, balanceAfter: 5, reorderLevel: 50, code: 'X' },
      }),
    );
    await h.bus.publish(
      makeEvent({
        type: 'inventory.stock.movement_recorded',
        tenantId, companyId: null, actorId: null,
        aggregateType: 'inventory.stock', aggregateId: 'item-y',
        payload: { direction: 'out', quantity: 10, balanceAfter: 2, reorderLevel: 0, code: 'Y' },
      }),
    );
    expect(h.createdPrs).toHaveLength(0);
  });

  it('is idempotent: re-delivered claim.certified does not duplicate AP invoice', async () => {
    const claimEvent = makeEvent({
      type: 'subcontracts.claim.statusChanged',
      tenantId,
      companyId: null,
      actorId: null,
      aggregateType: 'subcontracts.claim',
      aggregateId: 'claim-idem',
      payload: {
        status: 'certified',
        claimNumber: 2,
        netCertifiedValue: 30000,
        subcontractId: 'sc-def',
        subcontractor: 'Gulf MEP Ltd',
      },
    });

    await h.bus.publish(claimEvent);
    await h.bus.publish(claimEvent); // re-delivery

    const matching = h.createdApInvoices.filter((i: any) => i.supplierName === 'Gulf MEP Ltd');
    expect(matching).toHaveLength(1);
  });
});
