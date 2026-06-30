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
  const projects = new ProjectService(new InMemoryProjectStore(), events, commands);
  const wbs = new WbsService(new InMemoryWbsStore(), events, access);
  const cbs = new CbsService(new InMemoryCbsStore(), events);
  const customerInvoices = new CustomerInvoiceService(new InMemoryCustomerInvoiceStore(), events);

  // Register command handlers (Nest would call these via OnModuleInit).
  tenders.onModuleInit();
  contracts.onModuleInit();
  projects.onModuleInit();

  // Services the reactor depends on but these tests don't exercise.
  const noop = {} as any;

  const subscriber = new CrossModuleSubscriber(
    bus,
    contracts,
    projects,
    wbs,
    cbs,
    tenant,
    noop, // PurchaseOrderService
    noop, // PurchaseRequestService
    tenders,
    noop, // AccountService (CRM)
    customerInvoices,
    noop, // InvoiceService (AP)
    noop, // AccountService (Finance) — GL account resolver
    noop, // JournalService
  );
  subscriber.onModuleInit(); // subscribe the reactor to the bus

  return { bus, opportunities, tenders, contracts, projects, wbs, cbs, customerInvoices };
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
});
