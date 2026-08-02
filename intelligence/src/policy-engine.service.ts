import { Injectable, Logger } from '@nestjs/common';

export interface EnterprisePolicy {
  key: string;
  name: string;
  category: 'financial' | 'data_integrity' | 'security' | 'workflow';
  condition: string;
  action: 'require_approval' | 'forbidden' | 'allow' | 'require_role';
  targetRole?: string;
  enabled: boolean;
}

@Injectable()
export class PolicyEngineService {
  private readonly logger = new Logger('PolicyEngineService');
  private readonly policies = new Map<string, EnterprisePolicy>();

  constructor() {
    this.seedDefaultPolicies();
  }

  private seedDefaultPolicies(): void {
    this.registerPolicy({
      key: 'po_over_100k_approval',
      name: 'PO Purchases > AED 100,000 Require Human Approval',
      category: 'financial',
      condition: 'valueAmount > 100000',
      action: 'require_approval',
      enabled: true,
    });

    this.registerPolicy({
      key: 'delete_customer_forbidden',
      name: 'Deleting CRM Accounts via AI is Forbidden',
      category: 'data_integrity',
      condition: 'action == "delete_customer"',
      action: 'forbidden',
      enabled: true,
    });

    this.registerPolicy({
      key: 'price_override_finance_role',
      name: 'Item Price Overrides Require Finance Manager Role',
      category: 'security',
      condition: 'action == "override_price"',
      action: 'require_role',
      targetRole: 'Finance Manager',
      enabled: true,
    });
  }

  registerPolicy(policy: EnterprisePolicy): void {
    this.policies.set(policy.key, policy);
    this.logger.log(`[PolicyEngine] Enterprise policy registered: "${policy.name}"`);
  }

  listPolicies(): EnterprisePolicy[] {
    return Array.from(this.policies.values());
  }

  togglePolicy(key: string, enabled: boolean): boolean {
    const policy = this.policies.get(key);
    if (!policy) return false;
    policy.enabled = enabled;
    this.logger.log(`[PolicyEngine] Policy "${key}" ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }
}
