import type { DomainEvent } from '@aura/shared';
import type { PoolClient } from 'pg';

export interface Projection {
  name: string;
  version: number;
  handle(event: DomainEvent, client: PoolClient | null): Promise<void>;
  reset?(client: PoolClient | null): Promise<void>; // Invoked before a rebuild/replay
}

export interface ProjectionStatus {
  projectionName: string;
  version: number;
  lastEventId: string | null;
  lastOccurredAt: Date | null;
  rebuilding: boolean;
  updatedAt: Date;
}
