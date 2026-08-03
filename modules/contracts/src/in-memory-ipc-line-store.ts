import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { IpcLine } from './domain/ipc-line';
import type { IpcLineStore } from './ipc-line-store';

export class InMemoryIpcLineStore implements IpcLineStore {
  private readonly rows: IpcLine[] = [];

  async add(line: IpcLine): Promise<void> {
    this.rows.push({ ...line });
  }

  async addWithClient(_tx: TxHandle | null, line: IpcLine): Promise<void> {
    return this.add(line);
  }

  async listByCertificate(certificateId: Id, tenantId: Id): Promise<IpcLine[]> {
    return this.rows
      .filter((l) => l.certificateId === certificateId && l.tenantId === tenantId)
      .map((l) => ({ ...l }));
  }
}
