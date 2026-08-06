import { describe, it, expect, vi } from 'vitest';
import type { EventStore, TxRunner, AccessService } from '@aura/core';
import { RetentionReleaseService } from './retention-release.service';
import { InMemoryRetentionReleaseStore } from './in-memory-retention-release-store';
import { PaymentCertificateService } from './payment-certificate.service';
import { InMemoryPaymentCertificateStore } from './in-memory-payment-certificate-store';
import { InMemoryIpcLineStore } from './in-memory-ipc-line-store';
import { InMemoryContractStore } from './in-memory-contract-store';
import { ContractService } from './contract.service';
import { makeContract } from './domain/contract';

// Retention accrues on every IPC and, until this service, had no way home. The release is the
// return path: raised against the derived position, approved under the IPC's own controls, and
// its approval is the AR trigger that bills the client for the tranche.

const tx = { run: async (fn: (h: unknown) => Promise<void>) => fn(null) } as unknown as TxRunner;
const access = { assert: () => {}, assertApprovalAuthority: () => {} } as unknown as AccessService;
const commands = { register: () => {} } as unknown as never;

async function harness(contractValue = 1_000_000) {
  const append = vi.fn().mockResolvedValue(undefined);
  const events = { append, appendWithClient: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const contractStore = new InMemoryContractStore();
  const contracts = new ContractService(contractStore, events, tx, commands, access);
  const contract = makeContract({ tenantId: 't1', title: 'Mall ELV', value: contractValue, status: 'active' });
  await contractStore.create(contract);
  const certificates = new PaymentCertificateService(
    new InMemoryPaymentCertificateStore(),
    new InMemoryIpcLineStore(),
    events,
    tx,
    contracts,
    access,
  );
  const svc = new RetentionReleaseService(new InMemoryRetentionReleaseStore(), events, certificates, contracts, access);
  const emitted = () => append.mock.calls.flatMap((c) => (c[0] as Array<{ type: string }>).map((e) => e.type));

  /** Certify one IPC so retention is actually held: 500k work × 10%, capped at 5% of value. */
  const certifyIpc = async (work = 500_000) => {
    const ipc = await certificates.create({ tenantId: 't1', contractId: contract.id, cumulativeWorkDone: work, retentionPercent: 10, retentionCapPercent: 5 });
    await certificates.changeStatus(ipc.id, 'certified');
    return ipc;
  };
  return { svc, certificates, contract, certifyIpc, emitted };
}

describe('RetentionReleaseService', () => {
  it('derives the position from the certified IPCs', async () => {
    const { svc, contract, certifyIpc } = await harness();
    await certifyIpc(); // 10% of 500k = 50k, at the 5%-of-1m cap = 50,000 held
    const p = await svc.position('t1', contract.id);
    expect(p.retentionHeld).toBe(50_000);
    expect(p.releasable).toBe(50_000);
    expect(p.suggested.practicalCompletion).toBe(25_000); // half at PC
  });

  it('bills the client on approval — one contracts.retention.released, and the position moves', async () => {
    const { svc, contract, certifyIpc, emitted } = await harness();
    await certifyIpc();
    const release = await svc.create({ tenantId: 't1', contractId: contract.id, amount: 25_000, createdBy: 'qs-1' });
    expect(release.reference).toBe('RET-001');
    expect(emitted()).toContain('contracts.retention.raised');

    const approved = await svc.decide(release.id, 'approved', 'commercial-manager');
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe('commercial-manager');
    expect(emitted().filter((t) => t === 'contracts.retention.released')).toHaveLength(1);

    const p = await svc.position('t1', contract.id);
    expect(p).toMatchObject({ retentionHeld: 50_000, released: 25_000, pending: 0, releasable: 25_000 });
    expect(await svc.releasedTotal('t1', contract.id)).toBe(25_000);
  });

  it('refuses to release more than was withheld, and counts drafts as reserved', async () => {
    const { svc, contract, certifyIpc } = await harness();
    await certifyIpc(); // 50,000 held
    await expect(svc.create({ tenantId: 't1', contractId: contract.id, amount: 60_000 })).rejects.toThrow(/exceeds the 50000 still releasable/i);

    await svc.create({ tenantId: 't1', contractId: contract.id, amount: 30_000 }); // draft reserves
    await expect(svc.create({ tenantId: 't1', contractId: contract.id, amount: 30_000 })).rejects.toThrow(/exceeds the 20000 still releasable/i);
  });

  it('will not approve a release twice — the second would bill the tranche again', async () => {
    const { svc, contract, certifyIpc, emitted } = await harness();
    await certifyIpc();
    const release = await svc.create({ tenantId: 't1', contractId: contract.id, amount: 25_000 });
    await svc.decide(release.id, 'approved', 'commercial-manager');
    await expect(svc.decide(release.id, 'approved', 'commercial-manager')).rejects.toThrow(/already approved/i);
    expect(emitted().filter((t) => t === 'contracts.retention.released')).toHaveLength(1);
  });

  it('refuses the preparer approving their own release', async () => {
    const { svc, contract, certifyIpc } = await harness();
    await certifyIpc();
    const release = await svc.create({ tenantId: 't1', contractId: contract.id, amount: 10_000, createdBy: 'qs-1' });
    await expect(svc.decide(release.id, 'approved', 'qs-1')).rejects.toThrow(/access denied/i);
    await svc.decide(release.id, 'approved', 'someone-else'); // a different approver is fine
  });

  it('rejects a release without billing anything, and frees its reservation', async () => {
    const { svc, contract, certifyIpc, emitted } = await harness();
    await certifyIpc();
    const release = await svc.create({ tenantId: 't1', contractId: contract.id, amount: 50_000 });
    await svc.decide(release.id, 'rejected');
    expect(emitted()).not.toContain('contracts.retention.released');
    expect((await svc.position('t1', contract.id)).releasable).toBe(50_000);
  });

  it('refuses a release on a contract that has withheld nothing yet', async () => {
    const { svc, contract } = await harness();
    await expect(svc.create({ tenantId: 't1', contractId: contract.id, amount: 1_000 })).rejects.toThrow(/exceeds the 0 still releasable/i);
  });
});
