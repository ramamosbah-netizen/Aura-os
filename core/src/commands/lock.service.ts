import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

@Injectable()
export class LockService {
  private readonly logger = new Logger('LockEngine');
  private readonly inMemoryLocks = new Set<string>();

  /**
   * Hashes a string key into a 64-bit BigInt for PostgreSQL advisory locking.
   */
  hashKey(key: string): bigint {
    const hash = createHash('sha256').update(key).digest();
    // Read the first 8 bytes as a signed 64-bit BigInt
    return hash.readBigInt64BE(0);
  }

  /**
   * Acquires a transaction-level advisory lock using PostgreSQL pg_advisory_xact_lock.
   * The lock is automatically released by PostgreSQL when the transaction commits or aborts.
   * If tx is null (in-memory mode), falls back to an in-memory lock map.
   */
  async acquireLock(tx: any | null, lockKey: string): Promise<void> {
    if (!tx) {
      if (this.inMemoryLocks.has(lockKey)) {
        throw new Error(`Lock already held: ${lockKey}`);
      }
      this.inMemoryLocks.add(lockKey);
      return;
    }

    const client = tx as PoolClient;
    const lockId = this.hashKey(lockKey);

    try {
      // pg_advisory_xact_lock blocks until lock is acquired.
      // If we want a non-blocking attempt, we can use pg_try_advisory_xact_lock.
      await client.query('SELECT pg_advisory_xact_lock($1)', [lockId.toString()]);
      this.logger.log(`Advisory lock acquired on key: ${lockKey} (hash: ${lockId})`);
    } catch (error: any) {
      this.logger.error(`Failed to acquire advisory lock on ${lockKey}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Releases an in-memory lock (no-op for Postgres, as transaction end releases it).
   */
  releaseInMemoryLock(lockKey: string): void {
    this.inMemoryLocks.delete(lockKey);
  }
}
