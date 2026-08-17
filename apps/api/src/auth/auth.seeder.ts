import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AccessService } from '@aura/core';
import { ELV_ROLE_MATRIX } from './elv-roles';

/**
 * Registers the master-administrator role and, only when explicitly configured, grants it
 * to the bootstrap identity. The role remains a compatibility id because existing grants
 * may already reference it; the product-facing identity is Master Administrator.
 *
 * Also registers the **standard ELV role matrix** (`elv-roles.ts`) so a fresh tenant starts
 * with the roles a contractor actually staffs, instead of an empty registry (register G-04).
 * Roles are *registered*, not granted — assigning people is an admin decision, made at
 * `/admin/access`. Registration is an idempotent upsert, so re-boots don't duplicate.
 */
@Injectable()
export class AuthSeeder implements OnModuleInit {
  private readonly logger = new Logger('AuthSeeder');

  constructor(private readonly access: AccessService) {}

  onModuleInit(): void {
    // The standard ELV role set. Separated from the dev grants below: these are the roles a
    // real deployment starts from, the grants below are demo identities.
    for (const role of ELV_ROLE_MATRIX) {
      this.access.registerRole({ id: role.id, name: role.name, permissions: role.permissions });
    }
    this.logger.log(
      `Seeded ${ELV_ROLE_MATRIX.length} standard ELV roles: ${ELV_ROLE_MATRIX.map((r) => r.id).join(' · ')}.`,
    );

    this.access.registerRole({
      // Compatibility id retained so existing installations do not orphan their grants.
      id: 'dealChainAdmin',
      name: 'Master Administrator',
      permissions: ['*'],
    });

    const masterAdminUser = process.env.AUTH_MASTER_ADMIN_USER?.trim();
    const masterAdminTenant = process.env.AUTH_MASTER_ADMIN_TENANT?.trim() || 'dev-tenant';
    if (masterAdminUser) {
      this.access.grant({
        userId: masterAdminUser,
        roleId: 'dealChainAdmin',
        scope: { kind: 'org', level: 'tenant', id: masterAdminTenant },
      });
      this.logger.log(`Master Administrator grant loaded for ${masterAdminUser} in ${masterAdminTenant}.`);
    } else {
      this.logger.warn('No AUTH_MASTER_ADMIN_USER configured; no bootstrap master-administrator grant was added.');
    }
  }
}
