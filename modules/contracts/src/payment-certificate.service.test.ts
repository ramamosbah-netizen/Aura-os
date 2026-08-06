import { describe, it, expect, vi } from 'vitest';
import type { EventStore, TxRunner, AccessService } from '@aura/core';
import { PaymentCertificateService } from './payment-certificate.service';
import { InMemoryPaymentCertificateStore } from './in-memory-payment-certificate-store';
import { InMemoryIpcLineStore } from './in-memory-ipc-line-store';
import { InMemoryContractStore } from './in-memory-contract-store';
import { ContractService } from './contract.service';
import { makeContract } from './domain/contract';

// PaymentCertificateService sits directly on the money cycle — it computes retention, advance
// recovery and the net payable, and its `certified` transition is what triggers the automatic AR
// invoice to the client. It had no test of its own.

const tx = { run: async (fn: (h: unknown) => Promise<void>) => fn(null) } as unknown as TxRunner;
const events = () =>
  ({ append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) }) as unknown as EventStore;
const access = { assert: () => {}, assertApprovalAuthority: () => {} } as unknown as AccessService;
const commands = { register: () => {} } as unknown as never;

async function harness(contractValue = 1_000_000) {
  const contractStore = new InMemoryContractStore();
  const contracts = new ContractService(contractStore, events(), tx, commands, access);
  // Seeded straight into the store: ContractService.create dispatches through the CommandBus,
  // which is not what these tests are about.
  const contract = makeContract({ tenantId: 't1', title: 'Mall ELV', value: contractValue, status: 'active' });
  await contractStore.create(contract);
  const svc = new PaymentCertificateService(
    new InMemoryPaymentCertificateStore(),
    new InMemoryIpcLineStore(),
    events(),
    tx,
    contracts,
    access,
  );
  return { svc, contract };
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
});

// ── The status state machine ─────────────────────────────────────────────────
describe('PaymentCertificateService — certificate state machine', () => {
  it('refuses to re-certify an already-certified IPC (the second AR bill)', async () => {
    // 'certified' is the AR trigger. Re-sending it re-fired the event and raised a SECOND client
    // invoice for the same work — the double-bill the create guard closes, reachable via status.
    const { svc, contract } = await harness();
    const ipc = await raise(svc, contract.id, 500_000);
    await svc.changeStatus(ipc.id, 'submitted');
    await svc.changeStatus(ipc.id, 'certified');
    await expect(svc.changeStatus(ipc.id, 'certified')).rejects.toThrow(/can only move to/i);
  });

  it('will not revive a rejected certificate into certified', async () => {
    const { svc, contract } = await harness();
    const ipc = await raise(svc, contract.id, 500_000);
    await svc.changeStatus(ipc.id, 'submitted');
    await svc.changeStatus(ipc.id, 'rejected');
    await expect(svc.changeStatus(ipc.id, 'certified')).rejects.toThrow(/can only move to/i);
  });

  it('refuses to regress a certified certificate back to draft, and paid is terminal', async () => {
    const { svc, contract } = await harness();
    const ipc = await raise(svc, contract.id, 500_000);
    await svc.changeStatus(ipc.id, 'certified'); // direct draft→certified is allowed
    await expect(svc.changeStatus(ipc.id, 'draft')).rejects.toThrow(/can only move to/i);
    await svc.changeStatus(ipc.id, 'paid');
    await expect(svc.changeStatus(ipc.id, 'certified')).rejects.toThrow(/can only move to/i);
  });

  it('still allows the full happy path draft → submitted → certified → paid', async () => {
    const { svc, contract } = await harness();
    const ipc = await raise(svc, contract.id, 500_000);
    await svc.changeStatus(ipc.id, 'submitted');
    expect((await svc.changeStatus(ipc.id, 'certified')).status).toBe('certified');
    expect((await svc.changeStatus(ipc.id, 'paid')).status).toBe('paid');
  });
});
