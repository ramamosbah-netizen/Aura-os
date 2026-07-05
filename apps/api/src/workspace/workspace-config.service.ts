import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type WorkspaceConfig,
  type WorkspaceMe,
  type WorkspaceRoleId,
  defaultWorkspaceConfig,
  mergeWorkspaceConfig,
  resolveWorkspaceMe,
  resolveRole,
  WORKSPACE_ROLES,
  isAdminRole,
} from '@aura/shared';
import { WORKSPACE_CONFIG_STORE, type WorkspaceConfigStore } from './workspace-config-store';

export interface WorkspaceUser {
  username: string;
  role: WorkspaceRoleId;
  roleLabel: string;
  isAdmin: boolean;
}

/**
 * Holds the admin-editable workspace configuration (users → roles, roles →
 * allowed functions), one document per tenant, persisted through the store
 * (Postgres in prod, in-memory otherwise). Pure resolution lives in
 * `@aura/shared` so the web filters identically. A tenant with no saved config
 * yet resolves to the seeded default until the first admin save.
 */
@Injectable()
export class WorkspaceConfigService {
  private readonly logger = new Logger('Workspace');

  constructor(@Inject(WORKSPACE_CONFIG_STORE) private readonly store: WorkspaceConfigStore) {}

  async get(tenantId: string): Promise<WorkspaceConfig> {
    return (await this.store.get(tenantId)) ?? defaultWorkspaceConfig();
  }

  async update(tenantId: string, patch: Partial<WorkspaceConfig>): Promise<WorkspaceConfig> {
    const base = await this.get(tenantId);
    const next = mergeWorkspaceConfig(base, patch);
    await this.store.save(tenantId, next);
    this.logger.log(`Workspace config saved for ${tenantId} (${Object.keys(next.assignments).length} users assigned).`);
    return next;
  }

  /** Effective view for one user (used by GET /workspace/me). */
  async me(tenantId: string, username: string): Promise<WorkspaceMe> {
    return resolveWorkspaceMe(await this.get(tenantId), username);
  }

  /** The directory an admin manages — every assigned user with their role. */
  async users(tenantId: string): Promise<WorkspaceUser[]> {
    const config = await this.get(tenantId);
    return Object.keys(config.assignments)
      .sort()
      .map((username) => {
        const role = resolveRole(config, username);
        const meta = WORKSPACE_ROLES.find((r) => r.id === role);
        return { username, role, roleLabel: meta?.label ?? role, isAdmin: isAdminRole(role) };
      });
  }
}
