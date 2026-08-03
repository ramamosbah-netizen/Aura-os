import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { IpcLine } from './domain/ipc-line';

/** DI token for the IPC valuation-line store. */
export const IPC_LINE_STORE = Symbol('IPC_LINE_STORE');

export interface IpcLineStore {
  add(line: IpcLine): Promise<void>;
  /** Add on a caller-owned transaction; null tx falls back to add. */
  addWithClient(tx: TxHandle | null, line: IpcLine): Promise<void>;
  listByCertificate(certificateId: Id, tenantId: Id): Promise<IpcLine[]>;
}
