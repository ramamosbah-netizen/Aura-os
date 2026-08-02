import { Injectable, Logger } from '@nestjs/common';

// ── 6-Tier Memory Architecture ────────────────────────────────────────────────
//
//  Tier 1  Session Memory    — ephemeral, per-conversation turn context
//  Tier 2  Working Memory    — short-lived scratch-pad for in-flight agent reasoning
//  Tier 3  Business Memory   — persistent ERP entity state snapshots (projects, POs, budgets)
//  Tier 4  Knowledge Memory  — RAG vector store (pgvector) for document retrieval
//  Tier 5  User Preferences  — per-user settings, language, notification & approval preferences
//  Tier 6  Digital Twin      — full organisational digital twin snapshots (org structure, KPIs)
//
// Agents call `assembleContext(agentId, tiers)` which merges the requested tiers
// into a single unified context object the LLM receives alongside the system prompt.

export type MemoryTier =
  | 'session'
  | 'working'
  | 'business'
  | 'knowledge'
  | 'user_preferences'
  | 'digital_twin';

export interface MemoryEntry {
  tier: MemoryTier;
  key: string;
  value: any;
  createdAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface AssembledMemoryContext {
  agentId: string;
  tenantId: string;
  tiers: MemoryTier[];
  entries: MemoryEntry[];
  tokenEstimate: number;
  assembledAt: Date;
}

export interface MemoryTierStatus {
  tier: MemoryTier;
  label: string;
  entryCount: number;
  description: string;
  maxCapacity: number;
  ttlSeconds: number | null;
}

@Injectable()
export class MemoryManagerService {
  private readonly logger = new Logger('MemoryManagerService');

  // In-memory stores keyed by `tenantId::tier::key`
  private readonly store = new Map<string, MemoryEntry>();

  // ── Tier Configuration ──────────────────────────────────────────

  private readonly tierConfig: Record<MemoryTier, { label: string; description: string; maxCapacity: number; ttlSeconds: number | null }> = {
    session: {
      label: 'Session Memory',
      description: 'Ephemeral per-conversation context. Cleared when the session ends.',
      maxCapacity: 200,
      ttlSeconds: 3600,        // 1 hour
    },
    working: {
      label: 'Working Memory',
      description: 'Short-lived scratch-pad for in-flight multi-step agent reasoning chains.',
      maxCapacity: 500,
      ttlSeconds: 1800,        // 30 minutes
    },
    business: {
      label: 'Business Memory',
      description: 'Persistent ERP entity state — project budgets, PO statuses, contract milestones.',
      maxCapacity: 10_000,
      ttlSeconds: null,        // persistent
    },
    knowledge: {
      label: 'Knowledge Memory (RAG)',
      description: 'Vector-indexed documents, contracts, specifications retrieved via pgvector similarity search.',
      maxCapacity: 50_000,
      ttlSeconds: null,
    },
    user_preferences: {
      label: 'User Preferences',
      description: 'Per-user language, notification settings, approval delegation, and UI preferences.',
      maxCapacity: 1_000,
      ttlSeconds: null,
    },
    digital_twin: {
      label: 'Digital Twin Snapshots',
      description: 'Full organisational digital twin — org hierarchy, KPI dashboards, resource utilisation.',
      maxCapacity: 5_000,
      ttlSeconds: 86_400,      // 24 hours
    },
  };

  // ── Write Operations ────────────────────────────────────────────

  /**
   * Store a memory entry into a specific tier.
   */
  write(tenantId: string, tier: MemoryTier, key: string, value: any, metadata?: Record<string, any>): void {
    const storeKey = `${tenantId}::${tier}::${key}`;
    const config = this.tierConfig[tier];
    const now = new Date();
    this.store.set(storeKey, {
      tier,
      key,
      value,
      createdAt: now,
      expiresAt: config.ttlSeconds ? new Date(now.getTime() + config.ttlSeconds * 1000) : undefined,
      metadata,
    });
    this.logger.debug(`[Memory] Written ${tier}::${key} for tenant ${tenantId}`);
  }

  // ── Read Operations ─────────────────────────────────────────────

  /**
   * Read a single memory entry.
   */
  read(tenantId: string, tier: MemoryTier, key: string): MemoryEntry | null {
    const storeKey = `${tenantId}::${tier}::${key}`;
    const entry = this.store.get(storeKey);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.store.delete(storeKey);
      return null;
    }
    return entry;
  }

  /**
   * List all non-expired entries in a tier for a tenant.
   */
  listTier(tenantId: string, tier: MemoryTier): MemoryEntry[] {
    const prefix = `${tenantId}::${tier}::`;
    const now = new Date();
    const results: MemoryEntry[] = [];
    for (const [k, entry] of this.store) {
      if (!k.startsWith(prefix)) continue;
      if (entry.expiresAt && entry.expiresAt < now) {
        this.store.delete(k);
        continue;
      }
      results.push(entry);
    }
    return results;
  }

  // ── Context Assembly ────────────────────────────────────────────

  /**
   * Assemble a unified memory context for an agent execution across requested tiers.
   * This is the primary method called by AgentRuntimeService before LLM invocation.
   */
  assembleContext(tenantId: string, agentId: string, tiers: MemoryTier[]): AssembledMemoryContext {
    const entries: MemoryEntry[] = [];
    for (const tier of tiers) {
      entries.push(...this.listTier(tenantId, tier));
    }

    // Rough token estimation: ~4 chars per token for JSON-serialised entries
    const tokenEstimate = Math.ceil(JSON.stringify(entries.map((e) => e.value)).length / 4);

    this.logger.log(
      `[Memory] Assembled context for agent "${agentId}" across ${tiers.length} tiers → ${entries.length} entries (~${tokenEstimate} tokens)`,
    );

    return {
      agentId,
      tenantId,
      tiers,
      entries,
      tokenEstimate,
      assembledAt: new Date(),
    };
  }

  // ── Eviction & Cleanup ──────────────────────────────────────────

  /**
   * Clear all entries in a specific tier for a tenant.
   */
  clearTier(tenantId: string, tier: MemoryTier): number {
    const prefix = `${tenantId}::${tier}::`;
    let count = 0;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
        count++;
      }
    }
    this.logger.log(`[Memory] Cleared ${count} entries from ${tier} for tenant ${tenantId}`);
    return count;
  }

  /**
   * Evict all expired entries globally.
   */
  evictExpired(): number {
    const now = new Date();
    let count = 0;
    for (const [k, entry] of this.store) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.store.delete(k);
        count++;
      }
    }
    return count;
  }

  // ── Status & Observability ──────────────────────────────────────

  /**
   * Returns current memory tier status for display in the AI Control Center.
   */
  getTierStatuses(tenantId: string): MemoryTierStatus[] {
    const allTiers: MemoryTier[] = ['session', 'working', 'business', 'knowledge', 'user_preferences', 'digital_twin'];
    return allTiers.map((tier) => {
      const config = this.tierConfig[tier];
      const entryCount = this.listTier(tenantId, tier).length;
      return {
        tier,
        label: config.label,
        entryCount,
        description: config.description,
        maxCapacity: config.maxCapacity,
        ttlSeconds: config.ttlSeconds,
      };
    });
  }
}
