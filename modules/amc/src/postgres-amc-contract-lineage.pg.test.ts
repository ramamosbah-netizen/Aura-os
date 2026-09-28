import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PostgresAmcStore } from './postgres-amc-store';
import { ServiceContract } from './domain/service-contract';
import { AmcService } from './amc.service';

/**
 * J6-01 — A SERVICE CONTRACT OPENED FROM A HANDOVER, AGAINST REAL POSTGRESQL (migration 0396).
 *
 *   lineage     the project, the handover and the customer's account are stored and read back
 *   one         a second contract for the same handover is refused by the database, and the
 *               service answers the re-delivery with the contract already there
 *   honest      a contract that says it came from a handover but names no project is refused
 *
 * It SKIPS without a database rather than passing quietly.
 */
function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = path.resolve(__dirname, '../../../apps/api/.env.local');
    if (!fs.existsSync(envPath)) return undefined;
    for (const line of fs.readFileSync(envPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      if (line.startsWith('DATABASE_URL=')) return line.split('DATABASE_URL=')[1].trim();
    }
  } catch {
    // no env file — treated as "no database", which is a skip, not a failure
  }
  return undefined;
}

const TENANT = `j601pg-${Date.now()}`;

describe('service contracts opened from a handover (PostgreSQL)', () => {
  let pool: Pool | null = null;
  let store: PostgresAmcStore;

  beforeAll(async () => {
    const url = databaseUrl();
    if (!url) return;
    pool = new Pool({ connectionString: url });
    pool.on('connect', (client) => {
      void client.query(`SELECT set_config('app.current_tenant_id', '${TENANT}', false)`);
    });
    try {
      await pool.query('SELECT 1 FROM public.aura_amc_service_contracts WHERE handover_id IS NULL LIMIT 1');
    } catch {
      await pool.end(); pool = null; // not migrated to 0396 — skip
      return;
    }
    store = new PostgresAmcStore(pool);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM public.aura_amc_service_contracts WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool.end();
  });

  const skipless = (name: string, body: () => Promise<void>) =>
    it(name, async (ctx) => {
      if (!pool) { ctx.skip(); return; }
      await body();
    });

  const contract = (over: Partial<ConstructorParameters<typeof ServiceContract>[0]> = {}) => new ServiceContract({
    id: randomUUID(), tenantId: TENANT, contractNumber: `AMC-${randomUUID().slice(0, 8)}`, clientName: 'Diamond Developers',
    serviceScope: 'Warranty & AMC', startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2027-09-01T00:00:00Z'), value: 0,
    ...over,
  });

  skipless('stores and reads back the project, the handover and the customer', async () => {
    const handoverId = randomUUID(); const projectId = randomUUID(); const accountId = randomUUID();
    await store.saveContract(contract({ source: 'handover', handoverId, projectId, projectName: 'Creek Tower ELV', accountId }));
    const read = await store.findContractByHandover(TENANT, handoverId);
    expect(read).toMatchObject({ source: 'handover', handoverId, projectId, projectName: 'Creek Tower ELV', accountId, clientName: 'Diamond Developers' });
  });

  skipless('refuses a second contract for the same handover — the database decides, not the reactor', async () => {
    const handoverId = randomUUID(); const projectId = randomUUID();
    await store.saveContract(contract({ source: 'handover', handoverId, projectId }));
    await expect(store.saveContract(contract({ source: 'handover', handoverId, projectId }))).rejects.toThrow(/aura_amc_contracts_one_per_handover|duplicate key/);

    // …and the service answers a re-delivered acceptance with the contract already there.
    const service = new AmcService(store, { append: async () => undefined } as never);
    const again = await service.openFromHandover({
      tenantId: TENANT, handoverId, projectId, projectName: 'Creek Tower ELV', accountId: null, clientName: 'x',
      startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2027-09-01T00:00:00Z'),
    });
    expect(again.opened).toBe(false);
    expect((await store.listContracts(TENANT)).filter((c) => c.handoverId === handoverId)).toHaveLength(1);
  });

  skipless('refuses a contract that claims a handover but names no project', async () => {
    // Past the domain's own guard, straight at the table: the CHECK is the last word.
    await expect(pool!.query(
      `INSERT INTO public.aura_amc_service_contracts (tenant_id, contract_number, client_name, service_scope, start_date, end_date, source, handover_id)
       VALUES ($1, 'AMC-ORPHAN', 'x', 'x', '2026-09-01', '2027-09-01', 'handover', $2)`,
      [TENANT, randomUUID()],
    )).rejects.toThrow(/aura_amc_contracts_handover_lineage_chk/);
  });

  skipless('keeps a manually entered contract as it was', async () => {
    const manual = contract({ clientName: 'Walk-in Customer LLC' });
    await store.saveContract(manual);
    expect(await store.findContract(manual.id)).toMatchObject({ source: 'manual', projectId: null, handoverId: null, accountId: null });
  });
});
