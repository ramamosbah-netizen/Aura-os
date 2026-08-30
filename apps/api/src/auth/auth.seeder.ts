import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AccessService, CredentialsService, TenantContext, UsersService } from '@aura/core';
import { readSecret } from '@aura/shared';
import { ELV_ROLE_MATRIX } from './elv-roles';

/**
 * Seeds a demo identity so auth is exercisable end-to-end: an admin role carrying the
 * deal-chain create permissions, granted to `u-admin` at the dev tenant. A token for
 * u-admin can create across the chain; a token for any ungranted user is denied (403).
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
      // Dev super-admin: full wildcard so u-admin can exercise every module's handlers once
      // auth is turned on (the per-module @Permissions guard is now enforced platform-wide).
      id: 'dealChainAdmin',
      name: 'Platform Admin (dev)',
      permissions: ['*'],
    });
    // Keep the dev grant scope aligned with the explicitly selected disposable/dev tenant. The
    // previous hardcoded `dev-tenant` scope caused authenticated release-proof jobs that use an
    // isolated tenant to receive a legitimate 403 despite having the intended dev role.
    const devTenant =
      process.env.AUTH_DEV_ADMIN_TENANT?.trim() || process.env.AUTH_DEFAULT_TENANT?.trim() || 'dev-tenant';
    this.access.grant({
      userId: 'u-admin',
      roleId: 'dealChainAdmin',
      scope: { kind: 'org', level: 'tenant', id: devTenant },
    });
    // A second granted admin so maker-checker flows (e.g. quotation approval, where the
    // preparer may not approve their own) have a distinct, authorised checker in dev.
    this.access.grant({
      userId: 'u-approver',
      roleId: 'dealChainAdmin',
      scope: { kind: 'org', level: 'tenant', id: devTenant },
    });
    // Tiered approvers demonstrate the value-threshold approval matrix (P0-3): the same wildcard
    // permissions, but capped by an `approvalLimit` on the grant. An amount-bearing authorisation
    // (quotation approve / contract sign / IPC certify / invoice approve) above the cap is refused
    // with "above your approval limit" (→403), so a more senior approver is required. u-admin +
    // u-approver carry no cap (Board tier — unlimited).
    this.access.grant({
      userId: 'u-manager',
      roleId: 'dealChainAdmin',
      scope: { kind: 'org', level: 'tenant', id: devTenant },
      attributes: { approvalLimit: 50_000 },
    });
    this.access.grant({
      userId: 'u-director',
      roleId: 'dealChainAdmin',
      scope: { kind: 'org', level: 'tenant', id: devTenant },
      attributes: { approvalLimit: 500_000 },
    });
    this.logger.log('Seeded approval matrix: u-admin/u-approver (unlimited) · u-director (≤500k) · u-manager (≤50k) in dev-tenant.');
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
    // Read through the secret seam, so `AUTH_DEV_PASSWORD_FILE` (vault/secret mount, and what
    // scripts/configure-local-auth.mjs writes) works exactly like the plain variable. Reading
    // `process.env` directly here was the reason a fully-configured local setup still booted
    // with no credential: the `_FILE` form was silently ignored and every sign-in was refused.
    const password = readSecret('AUTH_DEV_PASSWORD');
    if (!password) {
      this.logger.warn(
        'AUTH_DEV_PASSWORD (or AUTH_DEV_PASSWORD_FILE) is not set — no dev account has a password, so every sign-in will be refused. ' +
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
