import { describe, it, expect } from 'vitest';
import { ConnectorService } from './connector.service';
import type { CircuitBreaker } from '../reliability/circuit-breaker';

const svc = (): ConnectorService => new ConnectorService(null, {} as CircuitBreaker);

describe('ConnectorService', () => {
  it('lists connectors WITHOUT the auth secrets', async () => {
    const s = svc();
    const id = await s.registerConnector({
      tenantId: 't1',
      systemName: 'SAP',
      authConfig: { url: 'https://sap', apiKey: 'TOP-SECRET' },
      mappingRules: { total: 'amount' },
      enabled: true,
    });
    const list = await s.listConnectors('t1');
    expect(list).toEqual([{ id, systemName: 'SAP', enabled: true, mappingRules: { total: 'amount' } }]);
    expect(JSON.stringify(list)).not.toContain('TOP-SECRET'); // authConfig never leaves the service
  });

  it('enables/disables a connector and isolates tenants', async () => {
    const s = svc();
    const id = await s.registerConnector({ tenantId: 't1', systemName: 'X', authConfig: {}, mappingRules: {}, enabled: true });
    expect(await s.setEnabled('t1', id, false)).toBe(true);
    expect((await s.listConnectors('t1'))[0].enabled).toBe(false);
    expect(await s.setEnabled('t2', id, true)).toBe(false); // another tenant can't touch it
    expect(await s.listConnectors('t2')).toHaveLength(0);
  });
});
