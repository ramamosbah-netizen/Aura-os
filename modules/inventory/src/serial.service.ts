import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Page, PageParams } from '@aura/shared';
import { SERIAL_STORE, type SerialStore } from './serial-store';
import {
  type SerialUnit,
  makeSerialUnit,
  issue,
  install,
  returnToStock,
  markFaulty,
} from './domain/serial-unit';

/**
 * Serial-unit tracking — the per-unit ledger for serialised ELV stock. Register a serial on
 * receipt, then track it in_stock → issued → installed (with warranty) → returned/faulty.
 */
@Injectable()
export class SerialService {
  private readonly logger = new Logger('SerialService');

  constructor(@Inject(SERIAL_STORE) private readonly store: SerialStore) {}

  async register(params: {
    tenantId: string; companyId?: string | null; serialNumber: string; itemCode: string;
    itemName: string; warehouse?: string | null; grnId?: string | null; createdBy?: string | null;
  }): Promise<SerialUnit> {
    const unit = makeSerialUnit(params);
    await this.store.save(unit);
    return unit;
  }

  get(id: string, tenantId: string): Promise<SerialUnit | null> {
    return this.store.find(id, tenantId);
  }

  list(tenantId: string, filter?: { status?: string; projectId?: string; itemCode?: string }): Promise<SerialUnit[]> {
    return this.store.list(tenantId, filter);
  }

  listPaged(tenantId: string, page: PageParams, filter?: { status?: string; projectId?: string }): Promise<Page<SerialUnit>> {
    return this.store.listPaged(tenantId, page, filter);
  }

  async issue(id: string, tenantId: string, patch: { projectId: string; projectName?: string | null }): Promise<SerialUnit> {
    const next = issue(await this.mustFind(id, tenantId), patch);
    await this.store.save(next);
    return next;
  }

  async install(id: string, tenantId: string, patch: { location?: string | null; warrantyMonths?: number; warrantyStartDate?: string }): Promise<SerialUnit> {
    const next = install(await this.mustFind(id, tenantId), patch);
    await this.store.save(next);
    this.logger.log(`[Serial] ${next.serialNumber} installed — warranty ${next.warrantyMonths}mo from ${next.warrantyStartDate}`);
    return next;
  }

  async returnToStock(id: string, tenantId: string): Promise<SerialUnit> {
    const next = returnToStock(await this.mustFind(id, tenantId));
    await this.store.save(next);
    return next;
  }

  async markFaulty(id: string, tenantId: string, reason: string): Promise<SerialUnit> {
    const next = markFaulty(await this.mustFind(id, tenantId), reason);
    await this.store.save(next);
    return next;
  }

  private async mustFind(id: string, tenantId: string): Promise<SerialUnit> {
    const u = await this.store.find(id, tenantId);
    if (!u) throw new Error(`not found: serial unit ${id}`);
    return u;
  }
}
