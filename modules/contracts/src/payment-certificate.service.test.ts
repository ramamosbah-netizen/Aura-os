import { describe, it, expect, vi } from 'vitest';
import type { EventStore, TxRunner, AccessService } from '@aura/core';
import { PaymentCertificateService } from './payment-certificate.service';
import { InMemoryPaymentCertificateStore } from './in-memory-payment-certificate-store';
import { InMemoryIpcLineStore } from './in-memory-ipc-line-store';
import { InMemoryContractStore } from './in-memory-contract-store';
import { ContractService } from './contract.service';
import { makeContract } from './domain/contract';
import type { ClaimableItem, IpcValuationSource } from './ipc-valuation.port';

// PaymentCertificateService sits directly on the money cycle — it computes retention, advance
// recovery and the net payable, and its `certified` transition is what triggers the automatic AR
// invoice to the client. It had no test of its own.

const tx = { run: async (fn: (h: unknown) => Promise<void>) => fn(null) } as unknown as TxRunner;
const events = () =>
  ({ append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) }) as unknown as EventStore;
const access = { assert: () => {}, assertApprovalAuthority: () => {} } as unknown as AccessService;
const commands = { register: () => {} } as unknown as never;

async function harness(contractValue = 1_000_000, audit?: { log: ReturnType<typeof vi.fn> }, valuation?: IpcValuationSource) {
  const contractStore = new InMemoryContractStore();
  const contracts = new ContractService(contractStore, events(), tx, commands, access);
  // Seeded straight into the store: ContractService.create dispatches through the CommandBus,
  // which is not what these tests are about.
  const contract = makeContract({ tenantId: 't1', title: 'Mall ELV', value: contractValue, status: 'active' });
  await contractStore.create(contract);
  const eventStore = events();
  const svc = new PaymentCertificateService(
    new InMemoryPaymentCertificateStore(),
    new InMemoryIpcLineStore(),
    eventStore,
    tx,
    contracts,
    access,
    undefined,
    audit as any,
    valuation ?? null,
  );
  return { svc, contract, eventStore, audit };
}

const raise = (svc: PaymentCertificateService, contractId: string, cumulativeWorkDone: number) =>
  svc.create({
    tenantId: 't1',
    contractId,
    cumulativeWorkDone,
    retentionPercent: 10,
    retentionCapPercent: 5,
  });

describe('PaymentCertificateService — the certification maths', () => {
  it('applies retention on work done and leaves the net payable', async () => {
    const { svc, contract } = await harness();
    const ipc = await raise(svc, contract.id, 500_000);
    expect(ipc.grossToDate).toBe(500_000);
    expect(ipc.retentionToDate).toBe(50_000); // 10% of work, under the 5% contract cap (50,000)
    expect(ipc.netThisCertificate).toBe(450_000);
    expect(ipc.sequence).toBe(1);
  });

  it('caps retention at the contract percentage once work outgrows it', async () => {
    const { svc, contract } = await harness();
    const ipc = await raise(svc, contract.id, 900_000);
    // 10% of 900,000 = 90,000, but the cap is 5% of the 1,000,000 contract = 50,000.
    expect(ipc.retentionToDate).toBe(50_000);
    expect(ipc.netThisCertificate).toBe(850_000);
  });

  it('deducts what previous certificates already certified', async () => {
    const { svc, contract } = await harness();
    const first = await raise(svc, contract.id, 500_000);
    await svc.changeStatus(first.id, 'submitted');
    await svc.changeStatus(first.id, 'certified');

    const second = await raise(svc, contract.id, 800_000);
    expect(second.sequence).toBe(2);
    expect(second.grossToDate).toBe(800_000);
    // Cumulative net 750,000 (800,000 − 50,000 capped retention) less the 450,000 already certified.
    expect(second.netThisCertificate).toBe(300_000);
  });
});

// ── The double-billing guard ─────────────────────────────────────────────────
describe('PaymentCertificateService — only one certificate open at a time', () => {
  it('refuses a second certificate while the first is still a draft', async () => {
    const { svc, contract } = await harness();
    await raise(svc, contract.id, 500_000);
    await expect(raise(svc, contract.id, 800_000)).rejects.toThrow(/already open on this contract/);
  });

  it('refuses a second certificate while the first is submitted', async () => {
    // This is the case that used to double-bill. An IPC certifies CUMULATIVE work and deducts
    // what previous certificates already paid — but the deduction only counts CERTIFIED ones. A
    // second IPC raised while the first was still with the engineer therefore started from zero
    // and re-certified the same work: two certificates, 450,000 each, 900,000 billed for 500,000
    // of work, with an AR invoice auto-raised off each certification.
    const { svc, contract } = await harness();
    const first = await raise(svc, contract.id, 500_000);
    await svc.changeStatus(first.id, 'submitted');
    await expect(raise(svc, contract.id, 500_000)).rejects.toThrow(/already open on this contract/);
  });

  it('names the blocking certificate so the message is actionable', async () => {
    const { svc, contract } = await harness();
    await raise(svc, contract.id, 500_000);
    await expect(raise(svc, contract.id, 800_000)).rejects.toThrow(/IPC-001, draft/);
  });

  it('allows the next certificate once the previous one is certified', async () => {
    const { svc, contract } = await harness();
    const first = await raise(svc, contract.id, 500_000);
    await svc.changeStatus(first.id, 'submitted');
    await svc.changeStatus(first.id, 'certified');
    await expect(raise(svc, contract.id, 800_000)).resolves.toBeDefined();
  });

  it('does not let a rejected certificate block the contract', async () => {
    // A rejected IPC never enters the certified baseline, so it must not hold up the next one.
    const { svc, contract } = await harness();
    const first = await raise(svc, contract.id, 500_000);
    await svc.changeStatus(first.id, 'submitted');
    await svc.changeStatus(first.id, 'rejected');
    const retry = await raise(svc, contract.id, 500_000);
    expect(retry.netThisCertificate).toBe(450_000); // full amount — nothing was certified before it
  });

  it('rejects a certificate raised with a tenant different from the contract owner', async () => {
    const { svc, contract } = await harness();
    await expect(svc.create({
      tenantId: 'tenant-b',
      contractId: contract.id,
      cumulativeWorkDone: 100,
    })).rejects.toThrow(/belongs to another tenant/);
  });
});

// ── J5-02: an awarded contract is valued by its measured lines (owner, 2026-09-28) ───────────────
const item = (over: Partial<ClaimableItem> = {}): ClaimableItem => ({
  frozenItemKey: 'TENDER|boq-rev|CAM-1', boqItemId: 'CAM-1', description: 'IP camera, 4MP dome', unit: 'no', rate: 1_000,
  soldQuantity: 100, installed: 40, certified: 0, eligible: 40, blockedReason: null, ...over,
});
const awardOf = (items: ClaimableItem[]): IpcValuationSource => ({
  basis: async () => ({ known: true, basis: { projectId: 'project-1', projectName: 'Marina Tower ELV', items } }),
});
const CABLE = item({ frozenItemKey: 'TENDER|boq-rev|CBL-1', boqItemId: 'CBL-1', description: 'Cat6 cable', unit: 'm', rate: 12, installed: 500, eligible: 500 });
const measured = (valuation: IpcValuationSource = awardOf([item(), CABLE])) => harness(1_000_000, undefined, valuation);
const open = (svc: PaymentCertificateService, contractId: string) => svc.create({ tenantId: 't1', contractId, retentionPercent: 10, retentionCapPercent: 5 });

describe('PaymentCertificateService — measured valuation (J5-02)', () => {
  it('values the certificate by its lines at the frozen awarded rate — the QS types quantities only', async () => {
    const { svc, contract } = await measured();
    const ipc = await open(svc, contract.id);
    expect(ipc).toMatchObject({ valuation: 'measured', previousWorkDone: 0, cumulativeWorkDone: 0 });
    const cams = await svc.addLine({ certificateId: ipc.id, frozenItemKey: 'TENDER|boq-rev|CAM-1', quantity: 30 });
    expect(cams).toMatchObject({ projectId: 'project-1', boqItemId: 'CAM-1', description: 'IP camera, 4MP dome', unit: 'no', rate: 1_000, amount: 30_000 });
    await svc.addLine({ certificateId: ipc.id, frozenItemKey: 'TENDER|boq-rev|CBL-1', quantity: 250 });
    const revalued = (await svc.get(ipc.id))!;
    // 30 × 1,000 + 250 × 12 = 33,000; 10% retention (under the 5% cap of 50,000) leaves 29,700.
    expect(revalued).toMatchObject({ cumulativeWorkDone: 33_000, grossToDate: 33_000, retentionToDate: 3_300, netThisCertificate: 29_700 });
  });

  it('refuses a typed work-done figure on a contract valued by its lines', async () => {
    const { svc, contract } = await measured();
    await expect(svc.create({ tenantId: 't1', contractId: contract.id, cumulativeWorkDone: 500_000 }))
      .rejects.toThrow(/cannot be typed for a contract valued by its measured lines/);
  });

  it('bounds a claim by what is installed less what is certified, across lines on the same certificate', async () => {
    const { svc, contract } = await measured(awardOf([item({ installed: 40, certified: 15, eligible: 25 })]));
    const ipc = await open(svc, contract.id);
    await expect(svc.addLine({ certificateId: ipc.id, frozenItemKey: 'TENDER|boq-rev|CAM-1', quantity: 26 }))
      .rejects.toThrow(/exceeds what is eligible .*40 no installed less 15 certified leaves 25/);
    await svc.addLine({ certificateId: ipc.id, frozenItemKey: 'TENDER|boq-rev|CAM-1', quantity: 20 });
    await expect(svc.addLine({ certificateId: ipc.id, frozenItemKey: 'TENDER|boq-rev|CAM-1', quantity: 6 }))
      .rejects.toThrow(/20 is already on IPC-001/);
  });

  it('refuses an item the award cannot value or the ledger cannot certify, and one the award does not hold', async () => {
    const { svc, contract } = await measured(awardOf([item(), item({ frozenItemKey: 'K-UNMAPPED', description: 'PoE switch', blockedReason: 'it is mapped to a work package on the project' })]));
    const ipc = await open(svc, contract.id);
    await expect(svc.addLine({ certificateId: ipc.id, frozenItemKey: 'K-UNMAPPED', quantity: 1 }))
      .rejects.toThrow(/PoE switch can only be claimed once it is mapped to a work package/);
    await expect(svc.addLine({ certificateId: ipc.id, frozenItemKey: 'K-NOWHERE', quantity: 1 })).rejects.toThrow(/not found/);
  });

  it('takes lines only while the certificate is a draft', async () => {
    const { svc, contract } = await measured();
    const ipc = await open(svc, contract.id);
    await svc.addLine({ certificateId: ipc.id, frozenItemKey: 'TENDER|boq-rev|CAM-1', quantity: 1 });
    await svc.changeStatus(ipc.id, 'submitted');
    await expect(svc.addLine({ certificateId: ipc.id, frozenItemKey: 'TENDER|boq-rev|CAM-1', quantity: 1 }))
      .rejects.toThrow(/only a draft certificate can take measured lines/);
  });

  it('builds the next certificate on the work the previous one certified', async () => {
    const { svc, contract } = await measured();
    const first = await open(svc, contract.id);
    await svc.addLine({ certificateId: first.id, frozenItemKey: 'TENDER|boq-rev|CAM-1', quantity: 10 });
    await svc.changeStatus(first.id, 'submitted');
    await svc.changeStatus(first.id, 'certified');
    const second = await open(svc, contract.id);
    expect(second).toMatchObject({ previousWorkDone: 10_000, cumulativeWorkDone: 10_000, netThisCertificate: 0 });
    await svc.addLine({ certificateId: second.id, frozenItemKey: 'TENDER|boq-rev|CAM-1', quantity: 5 });
    // 15,000 to date, 1,500 retention → 13,500 net to date, less 9,000 certified before.
    expect(await svc.get(second.id)).toMatchObject({ cumulativeWorkDone: 15_000, netThisCertificate: 4_500 });
  });

  it('keeps a typed figure for a contract whose award froze no priced items, and refuses lines there', async () => {
    const { svc, contract } = await harness(1_000_000, undefined, { basis: async () => ({ known: true, basis: null }) });
    await expect(svc.create({ tenantId: 't1', contractId: contract.id })).rejects.toThrow(/cumulativeWorkDone is required/);
    const ipc = await svc.create({ tenantId: 't1', contractId: contract.id, cumulativeWorkDone: 100 });
    expect(ipc.valuation).toBe('typed');
    await expect(svc.addLine({ certificateId: ipc.id, frozenItemKey: 'TENDER|boq-rev|CAM-1', quantity: 1 }))
      .rejects.toThrow(/can only be added to a certificate valued by them/);
  });

  it('refuses rather than guesses when the award or the ledger cannot be read', async () => {
    const { svc, contract } = await harness(1_000_000, undefined, { basis: async () => ({ known: false, reason: 'the quantity ledger could not be reached' }) });
    await expect(open(svc, contract.id)).rejects.toThrow(/could not be read: the quantity ledger could not be reached/);
  });
});

describe('PaymentCertificateService — certified event line identity', () => {
  it('carries each IPC line into contracts.ipc.certified with its frozen item, rate and amount', async () => {
    const { svc, contract, eventStore } = await measured();
    const ipc = await open(svc, contract.id);
    const first = await svc.addLine({ certificateId: ipc.id, frozenItemKey: 'TENDER|boq-rev|CAM-1', quantity: 4 });
    const second = await svc.addLine({ certificateId: ipc.id, frozenItemKey: 'TENDER|boq-rev|CBL-1', quantity: 2 });
    await svc.changeStatus(ipc.id, 'submitted');
    await svc.changeStatus(ipc.id, 'certified');
    const calls = (eventStore.appendWithClient as any).mock.calls;
    const emitted = calls.flatMap((call: any[]) => call[1] ?? []).find((event: any) => event.type === 'contracts.ipc.certified');
    expect(emitted.payload.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ ipcLineId: first.id, projectId: 'project-1', boqItemId: 'CAM-1', frozenItemKey: 'TENDER|boq-rev|CAM-1', quantity: 4, rate: 1_000, amount: 4_000 }),
      expect.objectContaining({ ipcLineId: second.id, projectId: 'project-1', boqItemId: 'CBL-1', frozenItemKey: 'TENDER|boq-rev|CBL-1', quantity: 2, rate: 12, amount: 24 }),
    ]));
  });

  it('does not allow a certified certificate to move backwards or be silently re-certified', async () => {
    const { svc, contract } = await harness();
    const ipc = await raise(svc, contract.id, 100);
    await svc.changeStatus(ipc.id, 'submitted');
    const certified = await svc.changeStatus(ipc.id, 'certified');
    await expect(svc.changeStatus(ipc.id, 'rejected')).rejects.toThrow(/immutable/);
    await expect(svc.changeStatus(ipc.id, 'draft')).rejects.toThrow(/immutable/);
    expect(await svc.changeStatus(ipc.id, 'certified')).toEqual(certified);
  });

  it('records one tenant/actor/source audit for certification and none on replay', async () => {
    const audit = { log: vi.fn().mockResolvedValue(undefined) };
    const { svc, contract } = await harness(1_000_000, audit, awardOf([item(), CABLE]));
    const ipc = await open(svc, contract.id);
    const line = await svc.addLine({ certificateId: ipc.id, frozenItemKey: 'TENDER|boq-rev|CBL-1', quantity: 2 });
    await svc.changeStatus(ipc.id, 'submitted');
    const certified = await svc.changeStatus(ipc.id, 'certified', 'certifier-1');
    await svc.changeStatus(ipc.id, 'certified', 'certifier-1');
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      't1', null, 'certifier-1', 'contracts', 'payment_certificate', certified.id, 'certified',
      expect.objectContaining({ certificateId: certified.id, contractId: contract.id, lines: [expect.objectContaining({ ipcLineId: line.id, unit: 'm', quantity: 2 })] }),
      expect.objectContaining({ source: 'contracts.ipc.certified', contractId: contract.id }),
      null,
    );
  });
});

