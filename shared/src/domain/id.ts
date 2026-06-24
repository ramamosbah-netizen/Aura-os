import { randomUUID } from 'node:crypto';

/** Opaque identifier. UUID strings today; swappable for ULID without call-site changes. */
export type Id = string;

/** Generate a new unique id. */
export function newId(): Id {
  return randomUUID();
}
