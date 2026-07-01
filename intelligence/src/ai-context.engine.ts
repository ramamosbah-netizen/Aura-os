import { Injectable, Logger } from '@nestjs/common';

// ── Digital Twin Context ──────────────────────────────────────────────────────

export interface DigitalTwinSnapshot {
  tenantId: string;
  entityType: string;
  entityId: string;
  snapshotData: Record<string, any>;
  capturedAt: Date;
}

export interface AiContextWindow {
  tenantId: string;
  query: string;
  relevantEntities: DigitalTwinSnapshot[];
  systemContext: string;
  tokenEstimate: number;
}

// ── AI Context Engine ─────────────────────────────────────────────────────────

@Injectable()
export class AiContextEngine {
  private readonly logger = new Logger('AiContextEngine');
  private readonly snapshots = new Map<string, DigitalTwinSnapshot>();

  private snapKey(tenantId: string, entityType: string, entityId: string) {
    return `${tenantId}::${entityType}::${entityId}`;
  }

  /**
   * Capture a digital twin snapshot for a given entity.
   * Overwrites the previous snapshot (only latest state maintained per entity).
   */
  async captureSnapshot(snapshot: Omit<DigitalTwinSnapshot, 'capturedAt'>): Promise<void> {
    const full: DigitalTwinSnapshot = { ...snapshot, capturedAt: new Date() };
    this.snapshots.set(this.snapKey(snapshot.tenantId, snapshot.entityType, snapshot.entityId), full);
    this.logger.log(`[AiContext] Digital twin snapshot captured: ${snapshot.entityType}/${snapshot.entityId}`);
  }

  /**
   * Build an AI Context Window — assembles relevant digital twin snapshots
   * into a structured context object to feed into an LLM prompt.
   */
  async buildContextWindow(params: {
    tenantId: string;
    query: string;
    entityTypes?: string[];
    maxEntities?: number;
  }): Promise<AiContextWindow> {
    const { tenantId, query, entityTypes, maxEntities = 10 } = params;

    const entities = Array.from(this.snapshots.values())
      .filter((s) => s.tenantId === tenantId)
      .filter((s) => !entityTypes || entityTypes.includes(s.entityType))
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())
      .slice(0, maxEntities);

    const systemContext = [
      `AURA OS — AI Context Window`,
      `Tenant: ${tenantId}`,
      `Query: "${query}"`,
      `Relevant entities loaded: ${entities.length}`,
      `Snapshot timestamps range: ${entities.length > 0
        ? `${entities[entities.length - 1].capturedAt.toISOString()} → ${entities[0].capturedAt.toISOString()}`
        : 'none'}`,
    ].join('\n');

    // Rough token estimate: ~4 chars per token, JSON serialization
    const tokenEstimate = Math.ceil(JSON.stringify(entities).length / 4) + 200;

    this.logger.log(`[AiContext] Context window built: ${entities.length} entities, ~${tokenEstimate} tokens for query "${query}"`);

    return { tenantId, query, relevantEntities: entities, systemContext, tokenEstimate };
  }

  async getSnapshot(tenantId: string, entityType: string, entityId: string): Promise<DigitalTwinSnapshot | null> {
    return this.snapshots.get(this.snapKey(tenantId, entityType, entityId)) ?? null;
  }

  async listSnapshots(tenantId: string, entityType?: string): Promise<DigitalTwinSnapshot[]> {
    return Array.from(this.snapshots.values()).filter(
      (s) => s.tenantId === tenantId && (!entityType || s.entityType === entityType)
    );
  }
}
