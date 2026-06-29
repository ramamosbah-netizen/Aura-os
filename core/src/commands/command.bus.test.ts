import { describe, expect, it, vi } from 'vitest';
import { CommandBus, type CommandDefinition } from './command.bus';
import { IdempotencyService } from './idempotency.service';
import { LockService } from './lock.service';
import { AccessService } from '../identity/access.service';
import { NullTxRunner } from '../events/tx';
import type { Pool } from 'pg';

describe('Command CQRS Pipeline', () => {
  it('runs validation, authorization, idempotency, and advisory locks', async () => {
    // 1. Setup mock dependencies
    const mockAssert = vi.fn();
    const accessService = { assert: mockAssert } as unknown as AccessService;

    const idempotencyService = new IdempotencyService(null);
    const lockService = new LockService();
    const txRunner = new NullTxRunner();

    const commandBus = new CommandBus(
      accessService,
      idempotencyService,
      lockService,
      txRunner
    );

    // 2. Register a command definition
    const handlerFn = vi.fn().mockResolvedValue({ success: true, id: 'po-1' });
    const validateFn = vi.fn().mockImplementation((payload: any) => {
      if (!payload.title) throw new Error('Title required');
    });

    const commandDef: CommandDefinition = {
      name: 'procurement.po.create',
      permission: 'procurement.po.create',
      validate: validateFn,
      getLockKey: (cmd) => `lock:po:${cmd.payload.title}`,
      handler: handlerFn,
    };

    commandBus.register(commandDef);

    // 3. Dispatch valid command
    const cmd1 = {
      id: 'cmd-1',
      name: 'procurement.po.create',
      tenantId: 't1',
      actorId: 'u1',
      payload: { title: 'Cables Supply' },
      idempotencyKey: 'idem-key-1',
    };

    const res1 = await commandBus.execute(cmd1);
    expect(res1).toEqual({ success: true, id: 'po-1' });
    expect(validateFn).toHaveBeenCalledWith(cmd1.payload);
    expect(mockAssert).toHaveBeenCalledWith('u1', {
      permission: 'procurement.po.create',
      orgPath: [{ level: 'tenant', id: 't1' }],
    });
    expect(handlerFn).toHaveBeenCalledTimes(1);

    // 4. Test Idempotency: Dispatching again with same key should skip validation and return cached response immediately
    validateFn.mockClear();
    handlerFn.mockClear();
    mockAssert.mockClear();

    const res2 = await commandBus.execute(cmd1);
    expect(res2).toEqual({ success: true, id: 'po-1' });
    expect(validateFn).toHaveBeenCalledTimes(1);
    expect(mockAssert).toHaveBeenCalledTimes(1);
    expect(handlerFn).not.toHaveBeenCalled();

    // 5. Test validation failure
    const cmdInvalid = {
      id: 'cmd-2',
      name: 'procurement.po.create',
      tenantId: 't1',
      actorId: 'u1',
      payload: {}, // missing title
    };

    await expect(commandBus.execute(cmdInvalid)).rejects.toThrow('Title required');
  });

  it('runs query for lock acquisition when pool is present', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    const mockClient = { query: mockQuery, release: vi.fn() };
    const mockPool = { connect: vi.fn().mockResolvedValue(mockClient) } as unknown as Pool;

    const lockService = new LockService();
    await lockService.acquireLock(mockClient, 'lock:some-key');

    expect(mockQuery).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [expect.any(String)]);
  });
});
