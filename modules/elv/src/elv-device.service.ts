import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Id, Page, PageParams } from '@aura/shared';
import { makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  type ElvDevice,
  type ElvDeviceStatus,
  type NewElvDevice,
  handoverReadiness,
  makeElvDevice,
  normaliseMac,
  setDeviceStatus,
} from './domain/device';
import { ELV_DEVICE_STORE, type ElvDeviceFilter, type ElvDeviceStore } from './store.interface';

/** Fields an engineer corrects in the field. Status moves through its own guarded transition. */
export type ElvDevicePatch = Partial<
  Pick<
    ElvDevice,
    | 'model'
    | 'manufacturer'
    | 'location'
    | 'drawingRef'
    | 'serialNumber'
    | 'macAddress'
    | 'ipAddress'
    | 'cableRef'
    | 'homeRunTo'
    | 'portRef'
    | 'warrantyExpiresAt'
    | 'notes'
  >
>;

/**
 * ELV device register service.
 *
 * Every read takes the tenant explicitly (see store.interface) — there is no bare `get(id)` for
 * N-08 to reopen. The service owns three things the store cannot: the duplicate-tag rule, the
 * status machine, and the handover-readiness rollup that turns a device list into a punch list.
 */
@Injectable()
export class ElvDeviceService {
  private readonly logger = new Logger('ELV');

  constructor(
    @Inject(ELV_DEVICE_STORE) private readonly store: ElvDeviceStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async create(input: NewElvDevice): Promise<ElvDevice> {
    const device = makeElvDevice(input);

    // Checked here as well as by the unique constraint: the constraint gives a Postgres error,
    // this gives the engineer a sentence that names the tag they duplicated.
    const clash = await this.store.findByTag(device.tenantId, device.projectId, device.tag);
    if (clash) throw new Error(`device ${device.tag} already exists on this project`);

    await this.store.save(device);
    await this.events.append([
      makeEvent({
        type: 'elv.device.registered',
        aggregateId: device.id,
        aggregateType: 'elv_device',
        tenantId: device.tenantId,
        companyId: device.companyId,
        payload: { tag: device.tag, system: device.system, projectId: device.projectId },
      }),
    ]);
    this.logger.log(`Device registered: ${device.tag} (${device.system}) on project ${device.projectId}`);
    return device;
  }

  get(id: Id, tenantId: Id): Promise<ElvDevice | null> {
    return this.store.find(id, tenantId);
  }

  list(tenantId: Id, filter?: ElvDeviceFilter): Promise<ElvDevice[]> {
    return this.store.list(tenantId, filter);
  }

  listPaged(tenantId: Id, page: PageParams, filter?: ElvDeviceFilter): Promise<Page<ElvDevice>> {
    return this.store.listPaged(tenantId, page, filter);
  }

  async patch(id: Id, tenantId: Id, patch: ElvDevicePatch): Promise<ElvDevice> {
    const existing = await this.store.find(id, tenantId);
    if (!existing) throw new Error(`device ${id} not found`);

    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const updated: ElvDevice = {
      ...existing,
      ...defined,
      // Normalised on every write, not just at creation — a MAC corrected in the field arrives
      // in whatever format the engineer's tool produced.
      macAddress: 'macAddress' in defined ? normaliseMac(patch.macAddress) : existing.macAddress,
      updatedAt: new Date().toISOString(),
    };
    await this.store.save(updated);
    return updated;
  }

  /** Guarded status transition — the sequence lives in the domain, not here. */
  async changeStatus(id: Id, tenantId: Id, status: ElvDeviceStatus): Promise<ElvDevice> {
    const existing = await this.store.find(id, tenantId);
    if (!existing) throw new Error(`device ${id} not found`);

    const updated = setDeviceStatus(existing, status);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: 'elv.device.status_changed',
        aggregateId: updated.id,
        aggregateType: 'elv_device',
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        payload: { tag: updated.tag, from: existing.status, to: status },
      }),
    ]);
    return updated;
  }

  /** Attach a device to the commissioning record that proves it. */
  async linkCommissioning(id: Id, tenantId: Id, commissioningRecordId: Id): Promise<ElvDevice> {
    const existing = await this.store.find(id, tenantId);
    if (!existing) throw new Error(`device ${id} not found`);
    const updated = { ...existing, commissioningRecordId, updatedAt: new Date().toISOString() };
    await this.store.save(updated);
    return updated;
  }

  /**
   * The punch list: what stands between this project and a handover the client will sign.
   *
   * Deliberately counts devices that WORK but are not DOCUMENTED separately from those that are
   * not commissioned — they are different jobs for different people, and lumping them together
   * is why "we're 95% done" is never true.
   */
  async handoverPunchList(
    tenantId: Id,
    projectId: Id,
  ): Promise<{
    total: number;
    ready: number;
    notCommissioned: number;
    undocumented: number;
    blockers: Array<{ id: Id; tag: string; missing: string[] }>;
  }> {
    const devices = await this.store.list(tenantId, { projectId });
    const blockers: Array<{ id: Id; tag: string; missing: string[] }> = [];
    let ready = 0;
    let notCommissioned = 0;
    let undocumented = 0;

    for (const d of devices) {
      if (d.status === 'removed') continue;
      const readiness = handoverReadiness(d);
      if (readiness.ready) {
        ready++;
        continue;
      }
      if (readiness.missing.includes('not commissioned')) notCommissioned++;
      else undocumented++;
      blockers.push({ id: d.id, tag: d.tag, missing: readiness.missing });
    }

    const total = devices.filter((d) => d.status !== 'removed').length;
    return { total, ready, notCommissioned, undocumented, blockers };
  }
}
