import { Injectable, Logger } from '@nestjs/common';
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

export interface WorkspaceUser {
  username: string;
  role: WorkspaceRoleId;
  roleLabel: string;
  isAdmin: boolean;
}

/**
 * Holds the admin-editable workspace configuration (users → roles, roles →
 * allowed functions). In-memory, seeded with a sensible default directory —
 * mirrors the platform's in-memory-first services; a Postgres-backed store can
 * drop in behind the same interface later. Pure resolution lives in
 * `@aura/shared` so the web filters identically.
 */
@Injectable()
export class WorkspaceConfigService {
  private readonly logger = new Logger('Workspace');
  private config: WorkspaceConfig = defaultWorkspaceConfig();

  get(): WorkspaceConfig {
    return this.config;
  }

  update(patch: Partial<WorkspaceConfig>): WorkspaceConfig {
    this.config = mergeWorkspaceConfig(this.config, patch);
    this.logger.log(`Workspace config updated (${Object.keys(this.config.assignments).length} users assigned).`);
    return this.config;
  }

  /** Effective view for one user (used by GET /workspace/me). */
  me(username: string): WorkspaceMe {
    return resolveWorkspaceMe(this.config, username);
  }

  /** The directory an admin manages — every assigned user with their role. */
  users(): WorkspaceUser[] {
    return Object.keys(this.config.assignments)
      .sort()
      .map((username) => {
        const role = resolveRole(this.config, username);
        const meta = WORKSPACE_ROLES.find((r) => r.id === role);
        return { username, role, roleLabel: meta?.label ?? role, isAdmin: isAdminRole(role) };
      });
  }
}
