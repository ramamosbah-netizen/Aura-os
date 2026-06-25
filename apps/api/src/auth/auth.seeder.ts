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
      id: 'dealChainAdmin',
      name: 'Deal Chain Admin',
      permissions: ['crm.*', 'tendering.*', 'contracts.*', 'projects.*', 'procurement.*', 'inventory.*'],
    });
    this.access.grant({
      userId: 'u-admin',
      roleId: 'dealChainAdmin',
      scope: { kind: 'org', level: 'tenant', id: 'dev-tenant' },
    });
    this.logger.log('Seeded deal-chain admin grant (u-admin can create across the chain in dev-tenant).');
  }
}
