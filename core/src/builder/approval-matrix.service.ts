import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

// ── Rules DSL Types ───────────────────────────────────────────────────────────

export type RuleOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'in' | 'not_in';

export interface ApprovalCondition {
  field: string;                    // e.g. 'value', 'department', 'priority'
  operator: RuleOperator;
  value: any;                       // threshold value or array for 'in'/'not_in'
}

export interface ApprovalRule {
  id: string;
  label: string;
  conditions: ApprovalCondition[];  // All conditions must match (AND logic)
  approvers: string[];              // User IDs or role names
  minApprovals: number;             // How many must approve (quorum)
  escalateTo?: string;              // Escalation user if not approved within SLA
  order: number;                    // Rule evaluation priority (lower = first)
}

export interface ApprovalMatrixConfig {
  tenantId: string;
  entityType: string;
  rules: ApprovalRule[];
}

export interface ApprovalDecision {
  ruleId: string;
  ruleLabel: string;
  approvers: string[];
  minApprovals: number;
  escalateTo?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ApprovalMatrixService {
  private readonly logger = new Logger('ApprovalMatrixService');
  private readonly configs = new Map<string, ApprovalMatrixConfig>();

  constructor(@Inject(PG_POOL) private readonly pool: Pool | null = null) {}

  private configKey(tenantId: string, entityType: string) {
    return `${tenantId}::${entityType}`;
  }

  async configure(config: ApprovalMatrixConfig): Promise<void> {
    const sorted = [...config.rules].sort((a, b) => a.order - b.order);
    this.configs.set(this.configKey(config.tenantId, config.entityType), { ...config, rules: sorted });
    if (this.pool) {
      await this.pool.query(
        `insert into public.aura_approval_matrices (tenant_id, entity_type, rules, updated_at)
         values ($1, $2, $3::jsonb, now())
         on conflict (tenant_id, entity_type) do update set rules = excluded.rules, updated_at = now()`,
        [config.tenantId, config.entityType, JSON.stringify(sorted)],
      );
    }
    this.logger.log(`[ApprovalMatrix] Configured ${sorted.length} rules for "${config.entityType}" (tenant: ${config.tenantId})`);
  }

  private async load(tenantId: string, entityType: string): Promise<ApprovalMatrixConfig | null> {
    const cached = this.configs.get(this.configKey(tenantId, entityType));
    if (cached) return cached;
    if (!this.pool) return null;
    const { rows } = await this.pool.query<{ rules: ApprovalRule[] }>(
      `select rules from public.aura_approval_matrices where tenant_id = $1 and entity_type = $2`,
      [tenantId, entityType],
    );
    if (!rows.length) return null;
    const rules = (typeof rows[0].rules === 'string' ? JSON.parse(rows[0].rules as unknown as string) : rows[0].rules) as ApprovalRule[];
    const config: ApprovalMatrixConfig = { tenantId, entityType, rules: [...rules].sort((a, b) => a.order - b.order) };
    this.configs.set(this.configKey(tenantId, entityType), config);
    return config;
  }

  /**
   * Evaluate the approval matrix against a given entity payload.
   * Returns the first matching rule's decision (rules are ordered by priority).
   */
  async resolve(tenantId: string, entityType: string, payload: Record<string, any>): Promise<ApprovalDecision | null> {
    const config = await this.load(tenantId, entityType);
    if (!config) {
      this.logger.warn(`[ApprovalMatrix] No matrix configured for "${entityType}"`);
      return null;
    }

    for (const rule of config.rules) {
      if (this.evaluateRule(rule, payload)) {
        this.logger.log(`[ApprovalMatrix] Rule matched: "${rule.label}" for ${entityType} — approvers: [${rule.approvers.join(', ')}]`);
        return {
          ruleId: rule.id,
          ruleLabel: rule.label,
          approvers: rule.approvers,
          minApprovals: rule.minApprovals,
          escalateTo: rule.escalateTo,
        };
      }
    }

    this.logger.warn(`[ApprovalMatrix] No rule matched for ${entityType} payload`);
    return null;
  }

  private evaluateRule(rule: ApprovalRule, payload: Record<string, any>): boolean {
    return rule.conditions.every((cond) => this.evaluateCondition(cond, payload));
  }

  private evaluateCondition(cond: ApprovalCondition, payload: Record<string, any>): boolean {
    const actual = payload[cond.field];
    const expected = cond.value;

    switch (cond.operator) {
      case 'gt':    return Number(actual) > Number(expected);
      case 'gte':   return Number(actual) >= Number(expected);
      case 'lt':    return Number(actual) < Number(expected);
      case 'lte':   return Number(actual) <= Number(expected);
      case 'eq':    return actual === expected;
      case 'neq':   return actual !== expected;
      case 'in':    return Array.isArray(expected) && expected.includes(actual);
      case 'not_in': return Array.isArray(expected) && !expected.includes(actual);
      default:      return false;
    }
  }
}
