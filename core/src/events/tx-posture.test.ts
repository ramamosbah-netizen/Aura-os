import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { CoreModule } from '../core.module';
import { TX_RUNNER, PostgresTxRunner, NullTxRunner } from './tx';
import { TenantContext } from '../tenancy/tenant-context';
import { evaluateTxPosture } from './tx-posture';

describe('evaluateTxPosture — governed financial workflows must be atomic in production', () => {
  it('allows a NullTxRunner when no database is configured (in-memory / tests)', () => {
    expect(evaluateTxPosture({ databaseConfigured: false, runnerIsTransactional: false }).ok).toBe(true);
  });
  it('allows a transactional runner when a database is configured', () => {
    expect(evaluateTxPosture({ databaseConfigured: true, runnerIsTransactional: true }).ok).toBe(true);
  });
  it('FAILS CLOSED when a database is configured but the runner is not transactional', () => {
    const d = evaluateTxPosture({ databaseConfigured: true, runnerIsTransactional: false });
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/non-atomic/i);
  });
});

describe('CoreModule TX_RUNNER factory (the REAL provider, not a copy)', () => {
  // Read the provider straight off CoreModule's decorator metadata so this proves the wiring the API
  // actually boots with — a Postgres deployment gets a PostgresTxRunner, dev gets a NullTxRunner.
  const providers = (Reflect.getMetadata('providers', CoreModule) as Array<Record<string, unknown>> | undefined) ?? [];
  const tx = providers.find((p) => p && p.provide === TX_RUNNER) as { useFactory?: (...a: unknown[]) => unknown } | undefined;

  it('is registered with a factory', () => {
    expect(tx).toBeDefined();
    expect(typeof tx!.useFactory).toBe('function');
  });

  it('yields a PostgresTxRunner with a pool (production) and a NullTxRunner without (dev)', () => {
    const tenant = new TenantContext();
    expect(tx!.useFactory!({} as unknown, tenant)).toBeInstanceOf(PostgresTxRunner);
    expect(tx!.useFactory!(null, tenant)).toBeInstanceOf(NullTxRunner);
  });
});
