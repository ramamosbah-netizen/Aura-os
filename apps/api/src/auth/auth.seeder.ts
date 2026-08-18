import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AccessService, CredentialsService, TenantContext, UsersService } from '@aura/core';
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

  constructor(
    private readonly access: AccessService,
    private readonly users: UsersService,
    private readonly credentials: CredentialsService,
    private readonly tenant: TenantContext,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDevIdentities();
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

  /**
   * Dev sign-in bootstrap.
   *
   * Login now requires a REGISTERED identity with a REAL credential, so the demo grants
   * above are no longer enough to sign in — an id the users registry has never seen is not
   * a user. This registers the demo accounts and gives each a hashed password taken from
   * `AUTH_DEV_PASSWORD`.
   *
   * That variable used to BE the authentication check: any password was accepted when it
   * was unset, and when it was set every account in the deployment shared it. It is now
   * only a dev bootstrap for explicitly named accounts — every other account is refused
   * until an administrator sets its password.
   *
   * Refused outright in production, where passwords come from the admin API.
   */
  private async seedDevIdentities(): Promise<void> {
    const password = process.env.AUTH_DEV_PASSWORD?.trim();
    if (!password) {
      this.logger.warn(
        'AUTH_DEV_PASSWORD is not set — no dev account has a password, so every sign-in will be refused. ' +
          'Set it (dev only) or set a password via POST /api/v1/admin/users/:id/password.',
      );
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      this.logger.error('AUTH_DEV_PASSWORD is set in production and was REFUSED. Remove this variable.');
      return;
    }

    const tenantId = process.env.AUTH_DEV_ADMIN_TENANT?.trim() || process.env.AUTH_DEFAULT_TENANT?.trim() || 'dev-tenant';
    const accounts = (process.env.AUTH_DEV_ADMIN_USER?.trim() || 'u-admin')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    // TENANT-BOUND. `auth_credentials` is FORCE ROW LEVEL SECURITY, so its policy applies to
    // every role including the owner — a seeder that writes with no tenant bound has its
    // INSERT rejected by `with check`, not silently mis-scoped. Boot runs outside any request,
    // so nothing binds a tenant unless we do it here.
    //
    // This is the correct direction: seeding is a tenant-scoped operation and should look
    // like one. The alternative — exempting the seeder from RLS — would make the bootstrap
    // path the one place tenant isolation does not apply.
    await this.tenant.run({ tenantId, companyId: null, actorId: null }, async () => {
      for (const userId of accounts) {
        this.users.save({ tenantId, userId, displayName: userId, active: true });
        // Never clobber a password that has already been set for this account.
        if (await this.credentials.has(tenantId, userId)) continue;
        await this.credentials.setPassword(tenantId, userId, password, { mustChange: false });
      }
    });
    this.logger.warn(
      `DEV ONLY — registered [${accounts.join(', ')}] on '${tenantId}' with a password from AUTH_DEV_PASSWORD. ` +
        'Every other account is refused until an administrator sets its password.',
    );
  }
}
