import type { Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { ElvDeviceFilter, ElvDeviceStore } from './store.interface';
import type { ElvDevice } from './domain/device';

/** Dev/test adapter — in-memory, non-persistent. Mirrors the Postgres adapter's ordering. */
export class InMemoryElvDeviceStore implements ElvDeviceStore {
  private readonly devices = new Map<string, ElvDevice>();

  async save(device: ElvDevice): Promise<void> {
    this.devices.set(device.id, { ...device });
  }

  async find(id: string, tenantId: string): Promise<ElvDevice | null> {
    const d = this.devices.get(id);
    return d && d.tenantId === tenantId ? { ...d } : null;
  }

  async findByTag(tenantId: string, projectId: string, tag: string): Promise<ElvDevice | null> {
    const wanted = tag.trim().toUpperCase();
    const hit = [...this.devices.values()].find(
      (d) => d.tenantId === tenantId && d.projectId === projectId && d.tag === wanted,
    );
    return hit ? { ...hit } : null;
  }

  async list(tenantId: string, filter?: ElvDeviceFilter): Promise<ElvDevice[]> {
    return [...this.devices.values()]
      .filter(
        (d) =>
          d.tenantId === tenantId &&
          (!filter?.projectId || d.projectId === filter.projectId) &&
          (!filter?.system || d.system === filter.system) &&
          (!filter?.status || d.status === filter.status),
      )
      .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  }

  async listPaged(tenantId: string, page: PageParams, filter?: ElvDeviceFilter): Promise<Page<ElvDevice>> {
    const all = await this.list(tenantId, filter);
    return makePage(all.slice(page.offset, page.offset + page.limit), all.length, page);
  }
}
