import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../src/reliability/circuit-breaker';
import { ConnectorService } from './integration/connector.service';
import { SdkGeneratorService } from './integration/sdk-generator.service';

describe('Integration Services - Phase 4', () => {
  describe('ConnectorService', () => {
    it('should successfully translate and sync internal events dynamically to external schemas', async () => {
      const breaker = new CircuitBreaker();
      const service = new ConnectorService(null, breaker);

      // Register external connector configuration for Procore
      const connId = await service.registerConnector({
        tenantId: 't-construction-group',
        systemName: 'procore',
        authConfig: { url: 'https://api.procore.com/v1/projects' },
        mappingRules: {
          value: 'total_amount',
          supplier: 'vendor_name',
        },
        enabled: true,
      });

      expect(connId).toBeDefined();

      // Trigger sync mapping
      const result = await service.syncEvent(
        't-construction-group',
        'procore',
        'finance.invoice.approved',
        {
          value: 150000,
          supplier: 'Union Steel Corp',
          internalNotes: 'Secret internal billing note', // Should not be mapped/sent external
        }
      );

      expect(result).toBeDefined();
      expect(result.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.syncedId).toBeDefined();
    });
  });

  describe('SdkGeneratorService', () => {
    it('should generate a typed TypeScript client SDK helper code block', () => {
      const service = new SdkGeneratorService();

      const sdkCode = service.generateTypeScriptSDK([
        {
          key: 'procurement.po.create',
          description: 'Raise a new purchase order',
          payloadProperties: ['value: number', 'supplier: string'],
        },
      ]);

      expect(sdkCode).toContain('export class AuraClientSDK');
      expect(sdkCode).toContain('procurementPoCreate');
      expect(sdkCode).toContain('postCommand(\'procurement.po.create\', payload, idempotencyKey)');
    });
  });
});
