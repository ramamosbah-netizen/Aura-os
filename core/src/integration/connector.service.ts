import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';
import { CircuitBreaker } from '../reliability/circuit-breaker';

export interface IntegrationConnector {
  id: string;
  tenantId: string;
  systemName: string;
  authConfig: any;
  mappingRules: Record<string, string>; // Maps internal property keys to external ones
  enabled: boolean;
}

@Injectable()
export class ConnectorService {
  private readonly logger = new Logger('ConnectorService');
  private readonly localConnectors = new Map<string, IntegrationConnector>();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool | null,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  async registerConnector(connector: Omit<IntegrationConnector, 'id'>): Promise<string> {
    const id = Math.random().toString(36).substring(7);
    if (!this.pool) {
      this.localConnectors.set(id, { id, ...connector });
      return id;
    }

    await this.pool.query(
      `INSERT INTO public.aura_integration_connectors (id, tenant_id, system_name, auth_config, mapping_rules, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
      [
        id,
        connector.tenantId,
        connector.systemName,
        JSON.stringify(connector.authConfig),
        JSON.stringify(connector.mappingRules),
        connector.enabled,
      ]
    );

    return id;
  }

  async syncEvent(tenantId: string, systemName: string, eventType: string, payload: any): Promise<any> {
    this.logger.log(`Syncing event "${eventType}" to external system "${systemName}" for tenant "${tenantId}"`);

    let connector: IntegrationConnector | undefined;

    if (!this.pool) {
      connector = Array.from(this.localConnectors.values()).find(
        (c) => c.tenantId === tenantId && c.systemName === systemName
      );
    } else {
      const { rows } = await this.pool.query<IntegrationConnector>(
        `SELECT id, tenant_id as "tenantId", system_name as "systemName", auth_config as "authConfig", mapping_rules as "mappingRules", enabled
           FROM public.aura_integration_connectors
          WHERE tenant_id = $1 AND system_name = $2 AND enabled = true`,
        [tenantId, systemName]
      );
      connector = rows[0];
    }

    if (!connector) {
      this.logger.warn(`No active connector configuration found for "${systemName}"`);
      return null;
    }

    // Map payload attributes dynamically based on rules configuration
    const mappedPayload: Record<string, any> = {};
    for (const [internalKey, externalKey] of Object.entries(connector.mappingRules)) {
      mappedPayload[externalKey] = payload[internalKey] !== undefined ? payload[internalKey] : null;
    }

    // Wrap external API call inside Circuit Breaker for resilience
    const mockPostRequest = async () => {
      this.logger.debug(`Sending HTTP payload to ${connector?.authConfig.url}: ${JSON.stringify(mappedPayload)}`);
      // Simulating external system successful sync
      return { status: 200, success: true, syncedId: Math.random().toString(36).substring(7) };
    };

    return this.circuitBreaker.execute(mockPostRequest);
  }
}
