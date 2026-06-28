import { Injectable, Logger } from '@nestjs/common';

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

  private configKey(tenantId: string, entityType: string) {
    return `${tenantId}::${entityType}`;
  }

  async configure(config: ApprovalMatrixConfig): Promise<void> {
    const sorted = [...config.rules].sort((a, b) => a.order - b.order);
    this.configs.set(this.configKey(config.tenantId, config.entityType), { ...config, rules: sorted });
    this.logger.log(`[ApprovalMatrix] Configured ${sorted.length} rules for "${config.entityType}" (tenant: ${config.tenantId})`);
  }

  /**
   * Evaluate the approval matrix against a given entity payload.
   * Returns the first matching rule's decision (rules are ordered by priority).
   */
  async resolve(tenantId: string, entityType: string, payload: Record<string, any>): Promise<ApprovalDecision | null> {
    const config = this.configs.get(this.configKey(tenantId, entityType));
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
