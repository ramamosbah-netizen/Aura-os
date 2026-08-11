import type { Page, PageParams } from '@aura/shared';
import type { ElvDevice } from './domain/device';

export const ELV_DEVICE_STORE = Symbol('ELV_DEVICE_STORE');

export interface ElvDeviceFilter {
  projectId?: string;
  system?: string;
  status?: string;
}

/**
 * Persistence for the ELV device register.
 *
 * Every read takes `tenantId` explicitly rather than exposing a bare `get(id)`. Postgres RLS is
 * the net underneath (0163/0164), but the application must refuse on its own too — that is N-08,
 * and a store shaped this way cannot reopen it.
 */
export interface ElvDeviceStore {
  save(device: ElvDevice): Promise<void>;
  find(id: string, tenantId: string): Promise<ElvDevice | null>;
  /** Tag is how a device is identified on site, so lookup by it has to be first-class. */
  findByTag(tenantId: string, projectId: string, tag: string): Promise<ElvDevice | null>;
  list(tenantId: string, filter?: ElvDeviceFilter): Promise<ElvDevice[]>;
  listPaged(tenantId: string, page: PageParams, filter?: ElvDeviceFilter): Promise<Page<ElvDevice>>;
}
