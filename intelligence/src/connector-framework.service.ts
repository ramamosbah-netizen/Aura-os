import { Injectable, Logger } from '@nestjs/common';

export interface EcosystemConnector {
  key: string;
  name: string;
  category: 'erp' | 'communication' | 'storage' | 'devops';
  connected: boolean;
  health: 'healthy' | 'warning' | 'disconnected';
  lastSyncAt: Date | null;
}

@Injectable()
export class ConnectorFrameworkService {
  private readonly logger = new Logger('ConnectorFrameworkService');
  private readonly connectors: EcosystemConnector[] = [
    { key: 'sap_s4hana', name: 'SAP S/4HANA ERP Connector', category: 'erp', connected: true, health: 'healthy', lastSyncAt: new Date() },
    { key: 'oracle_financials', name: 'Oracle Financials Cloud', category: 'erp', connected: true, health: 'healthy', lastSyncAt: new Date() },
    { key: 'microsoft_teams', name: 'Microsoft 365 & Teams', category: 'communication', connected: true, health: 'healthy', lastSyncAt: new Date() },
    { key: 'slack_enterprise', name: 'Slack Enterprise Grid', category: 'communication', connected: true, health: 'healthy', lastSyncAt: new Date() },
    { key: 'sharepoint_online', name: 'SharePoint Online DMS', category: 'storage', connected: true, health: 'healthy', lastSyncAt: new Date() },
    { key: 'google_drive', name: 'Google Drive Document Store', category: 'storage', connected: false, health: 'disconnected', lastSyncAt: null },
  ];

  listConnectors(): EcosystemConnector[] {
    return this.connectors;
  }

  toggleConnector(key: string, connected: boolean): boolean {
    const conn = this.connectors.find((c) => c.key === key);
    if (!conn) return false;
    conn.connected = connected;
    conn.health = connected ? 'healthy' : 'disconnected';
    conn.lastSyncAt = connected ? new Date() : null;
    this.logger.log(`[ConnectorFramework] Connector "${key}" ${connected ? 'connected' : 'disconnected'}`);
    return true;
  }
}
