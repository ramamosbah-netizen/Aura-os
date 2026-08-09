import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresJournalStore } from './postgres-journal-store';
import { makeJournal } from './domain/journal';
import { makeAccount } from './domain/account';
import { newId } from '@aura/shared';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('PostgresJournalStore Double-Entry Trigger Integration', () => {
  let pool: Pool | null = null;
  let store: PostgresJournalStore;
  const tenantId = `test-tenant-${newId().slice(0, 8)}`;
  const accAId = newId();
  const accBId = newId();

  beforeAll(async () => {
    // Attempt to load DATABASE_URL from apps/api/.env.local
    let dbUrl = process.env.DATABASE_URL;
    try {
      const envPath = path.resolve(__dirname, '../../../apps/api/.env.local');
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
          if (line.startsWith('DATABASE_URL=')) {
            dbUrl = line.split('DATABASE_URL=')[1].trim();
            break;
          }
        }
      }
    } catch {
      // Ignored
    }

    if (dbUrl) {
      pool = new Pool({ connectionString: dbUrl });
      // Bind the tenant GUC on checkout, the same way the runtime pool does. Under the enforced
      // aura_app role (G-03) an unbound connection is denied by the RLS policy — which is the
      // point of the role. This test used to pass only because the runtime connected as the
      // bypassing owner; binding makes it exercise the isolation the application runs under.
      //
      // Not the `options=-c ...` startup parameter: connection poolers reject it (Supabase's
      // does), and this test runs against whatever DATABASE_URL points at.
      pool.on('connect', (client) => {
        void client.query(`SELECT set_config('app.current_tenant_id', '${tenantId}', false)`);
      });
      store = new PostgresJournalStore(pool);

      // Seed required accounts
      await pool.query(
        `INSERT INTO public.aura_finance_accounts (id, tenant_id, code, name, type)
         VALUES ($1, $2, '1010-TEST', 'Test Bank', 'asset'),
                ($3, $2, '3000-TEST', 'Test Equity', 'equity')`,
        [accAId, tenantId, accBId],
      );
    }
  });

  afterAll(async () => {
    if (pool) {
      // Cleanup seeded data
      await pool.query('DELETE FROM public.aura_finance_journal_lines WHERE account_id IN ($1, $2)', [accAId, accBId]);
      await pool.query('DELETE FROM public.aura_finance_journals WHERE tenant_id = $1', [tenantId]);
      await pool.query('DELETE FROM public.aura_finance_accounts WHERE tenant_id = $1', [tenantId]);
      await pool.end();
    }
  });

  it('allows creating a balanced journal entry', async () => {
    if (!pool) {
      console.log('Skipping PostgresJournalStore integration test: No DATABASE_URL found.');
      return;
    }

    const journal = makeJournal({
      tenantId,
      description: 'Balanced integration test entry',
      lines: [
        { accountId: accAId, accountCode: '1010-TEST', accountName: 'Test Bank', debit: 500, credit: 0 },
        { accountId: accBId, accountCode: '3000-TEST', accountName: 'Test Equity', debit: 0, credit: 500 },
      ],
    });

    await expect(store.create(journal)).resolves.not.toThrow();

    // Verify it was written
    const retrieved = await store.get(journal.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.description).toBe('Balanced integration test entry');
    expect(retrieved?.lines).toHaveLength(2);
  });

  it('rejects an unbalanced journal entry at the database trigger level', async () => {
    if (!pool) return;

    // We bypass the domain model makeJournal validation (which throws immediately)
    // by manually constructing the object or overriding it, so we can test the database trigger.
    const unbalancedJournal = {
      id: newId(),
      tenantId,
      reference: 'UNBALANCED-TEST',
      description: 'Unbalanced trigger integration test entry',
      createdBy: 'test-user',
      postedAt: new Date().toISOString(),
      lines: [
        { id: newId(), accountId: accAId, accountCode: '1010-TEST', accountName: 'Test Bank', debit: 500, credit: 0 },
        { id: newId(), accountId: accBId, accountCode: '3000-TEST', accountName: 'Test Equity', debit: 0, credit: 499 }, // Off by 1
      ],
    };

    // The database trigger should abort the transaction and raise an error
    await expect(store.create(unbalancedJournal as any)).rejects.toThrowError(
      /Double-entry integrity violation/i
    );
  });
});
