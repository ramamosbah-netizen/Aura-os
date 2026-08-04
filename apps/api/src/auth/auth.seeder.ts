import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AccessService } from '@aura/core';

/**
 * Seeds a demo identity so auth is exercisable end-to-end: an admin role carrying the
 * deal-chain create permissions, granted to `u-admin` at the dev tenant. A token for
 * u-admin can create across the chain; a token for any ungranted user is denied (403).
 */
@Injectable()
export class AuthSeeder implements OnModuleInit {
  private readonly logger = new Logger('AuthSeeder');

  constructor(private readonly access: AccessService) {}

  onModuleInit(): void {
    this.access.registerRole({
      // Dev super-admin: full wildcard so u-admin can exercise every module's handlers once
      // auth is turned on (the per-module @Permissions guard is now enforced platform-wide).
      id: 'dealChainAdmin',
      name: 'Platform Admin (dev)',
      permissions: ['*'],
    });
    this.access.grant({
      userId: 'u-admin',
      roleId: 'dealChainAdmin',
      scope: { kind: 'org', level: 'tenant', id: 'dev-tenant' },
    });
    // A second granted admin so maker-checker flows (e.g. quotation approval, where the
    // preparer may not approve their own) have a distinct, authorised checker in dev.
    this.access.grant({
      userId: 'u-approver',
      roleId: 'dealChainAdmin',
      scope: { kind: 'org', level: 'tenant', id: 'dev-tenant' },
    });
    // Tiered approvers demonstrate the value-threshold approval matrix (P0-3): the same wildcard
    // permissions, but capped by an `approvalLimit` on the grant. An amount-bearing authorisation
    // (quotation approve / contract sign / IPC certify / invoice approve) above the cap is refused
    // with "above your approval limit" (→403), so a more senior approver is required. u-admin +
    // u-approver carry no cap (Board tier — unlimited).
    this.access.grant({
      userId: 'u-manager',
      roleId: 'dealChainAdmin',
      scope: { kind: 'org', level: 'tenant', id: 'dev-tenant' },
      attributes: { approvalLimit: 50_000 },
    });
    this.access.grant({
      userId: 'u-director',
      roleId: 'dealChainAdmin',
      scope: { kind: 'org', level: 'tenant', id: 'dev-tenant' },
      attributes: { approvalLimit: 500_000 },
    });
    this.logger.log('Seeded approval matrix: u-admin/u-approver (unlimited) · u-director (≤500k) · u-manager (≤50k) in dev-tenant.');
  }
}
