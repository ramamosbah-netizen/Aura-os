import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel } from '@aura/shared';
import { AccessService } from '../identity/access.service';
import { TX_RUNNER, type TxRunner } from '../events/tx';
import { IdempotencyService } from './idempotency.service';
import { LockService } from './lock.service';

export interface Command<Payload = any> {
  id: string; // unique command execution uuid
  name: string; // e.g. "procurement.po.create"
  tenantId: string;
  companyId?: string | null;
  actorId?: string | null;
  payload: Payload;
  idempotencyKey?: string | null;
}

export interface CommandDefinition<Payload = any, Result = any> {
  name: string;
  permission?: string;
  validate?: (payload: Payload) => void | Promise<void>;
  handler: (command: Command<Payload>, tx: any | null) => Promise<Result>;
  getLockKey?: (command: Command<Payload>) => string | null;
}

@Injectable()
export class CommandBus {
  private readonly logger = new Logger('CommandBus');
  private readonly registry = new Map<string, CommandDefinition>();

  constructor(
    private readonly access: AccessService,
    private readonly idempotency: IdempotencyService,
    private readonly lock: LockService,
    @Inject(TX_RUNNER) private readonly txRunner: TxRunner,
  ) {}

  /**
   * Registers a command definition.
   */
  register<Payload, Result>(definition: CommandDefinition<Payload, Result>): void {
    if (this.registry.has(definition.name)) {
      throw new Error(`Command ${definition.name} is already registered.`);
    }
    this.registry.set(definition.name, definition);
    this.logger.log(`Registered command handler: ${definition.name}`);
  }

  /**
   * Dispatches a command through the full pipeline:
   * 1. Validate payload schema.
   * 2. Authorize actor permissions.
   * 3. Enforce idempotency locks/responses.
   * 4. Wrap execution inside a database transaction block.
   * 5. Apply distributed advisory locking if requested.
   */
  async execute<Result = any>(command: Command): Promise<Result> {
    const def = this.registry.get(command.name);
    if (!def) {
      throw new Error(`No handler registered for command: ${command.name}`);
    }

    this.logger.log(`Executing command: ${command.name} (id: ${command.id})`);

    // 1. Validation
    if (def.validate) {
      await def.validate(command.payload);
    }

    // 2. Authorization
    if (def.permission && command.actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [
        { level: 'tenant', id: command.tenantId },
      ];
      if (command.companyId) {
        orgPath.push({ level: 'company', id: command.companyId });
      }

      const target: AccessTarget = {
        permission: def.permission,
        orgPath,
      };
      this.access.assert(command.actorId, target);
    }

    // 3. Idempotency Check
    if (command.idempotencyKey) {
      const cached = await this.idempotency.getRecord(command.tenantId, command.idempotencyKey);
      if (cached) {
        this.logger.log(`Idempotency hit! Returning cached response for key: ${command.idempotencyKey}`);
        if (cached.status >= 400) {
          throw new Error(cached.body.message ?? 'Cached command execution failed.');
        }
        return cached.body as Result;
      }
    }

    // 4. Transaction Block
    try {
      const result = await this.txRunner.run(async (tx) => {
        // 5. Locking
        const lockKey = def.getLockKey ? def.getLockKey(command) : null;
        if (lockKey) {
          await this.lock.acquireLock(tx, lockKey);
        }

        try {
          const res = await def.handler(command, tx);
          return res;
        } finally {
          if (lockKey && !tx) {
            this.lock.releaseInMemoryLock(lockKey);
          }
        }
      });

      // 6. Save Idempotency success
      if (command.idempotencyKey) {
        await this.idempotency.saveRecord(command.tenantId, command.idempotencyKey, 200, result);
      }

      return result;
    } catch (error: any) {
      // Save Idempotency error
      if (command.idempotencyKey) {
        await this.idempotency.saveRecord(command.tenantId, command.idempotencyKey, 500, {
          message: error.message,
        });
      }
      throw error;
    }
  }
}
