import type { Id } from '@aura/shared';
import type { DelayEvent, EotClaim } from './domain/delay-eot';

export const DELAY_STORE = Symbol('DELAY_STORE');
export const EOT_STORE = Symbol('EOT_STORE');

export interface DelayFilter {
  projectId?: Id;
  causeCategory?: string;
  status?: string;
}

export interface EotFilter {
  projectId?: Id;
  status?: string;
}

export interface DelayStore {
  create(event: DelayEvent): Promise<void>;
  update(event: DelayEvent): Promise<void>;
  get(id: Id): Promise<DelayEvent | null>;
  list(filter?: DelayFilter): Promise<DelayEvent[]>;
}

export interface EotStore {
  create(claim: EotClaim): Promise<void>;
  update(claim: EotClaim): Promise<void>;
  get(id: Id): Promise<EotClaim | null>;
  list(filter?: EotFilter): Promise<EotClaim[]>;
}
