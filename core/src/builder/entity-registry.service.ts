import { Injectable, Logger } from '@nestjs/common';

// ── Entity Definition ─────────────────────────────────────────────────────────

export interface EntityFieldSchema {
  key: string;
  label: string;
  type: string;
  required: boolean;
  indexed?: boolean;
  searchable?: boolean;
}

export interface EntityDefinition {
  id: string;
  tenantId: string;
  entityKey: string;          // e.g. 'invoice', 'project'
  label: string;
  module: string;             // e.g. 'finance', 'projects'
  schema: {
    fields: EntityFieldSchema[];
    labelField: string;       // which field to use as display name
  };
}

// ── Registry ──────────────────────────────────────────────────────────────────

@Injectable()
export class EntityRegistryService {
  private readonly logger = new Logger('EntityRegistryService');
  private readonly store = new Map<string, EntityDefinition>();

  private storeKey(tenantId: string, entityKey: string) {
    return `${tenantId}::${entityKey}`;
  }

  async register(def: Omit<EntityDefinition, 'id'>): Promise<EntityDefinition> {
    const id = `entity-${Math.random().toString(36).substring(7)}`;
    const entity: EntityDefinition = { id, ...def };
    this.store.set(this.storeKey(def.tenantId, def.entityKey), entity);
    this.logger.log(`[EntityRegistry] Registered entity "${def.entityKey}" (module: ${def.module}) — ${def.schema.fields.length} fields`);
    return entity;
  }

  async get(tenantId: string, entityKey: string): Promise<EntityDefinition | null> {
    return this.store.get(this.storeKey(tenantId, entityKey)) ?? null;
  }

  async list(tenantId: string, module?: string): Promise<EntityDefinition[]> {
    return Array.from(this.store.values()).filter(
      (e) => e.tenantId === tenantId && (!module || e.module === module)
    );
  }

  async getSearchableFields(tenantId: string, entityKey: string): Promise<EntityFieldSchema[]> {
    const entity = await this.get(tenantId, entityKey);
    if (!entity) return [];
    return entity.schema.fields.filter((f) => f.searchable);
  }
}
