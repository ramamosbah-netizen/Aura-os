import { Inject, Injectable, Logger, Optional, ForbiddenException } from '@nestjs/common';
import { PG_POOL } from '@aura/core';
import type { Pool } from 'pg';

export interface TenantCreditBalance {
  tenantId: string;
  planTier: 'starter' | 'pro' | 'enterprise';
  balanceCredits: number;
  monthlyQuotaCredits: number;
  autoRecharge: boolean;
  updatedAt: Date;
}

export interface CreditLedgerEntry {
  id: string;
  tenantId: string;
  agentId: string;
  taskType: string;
  creditsConsumed: number;
  balanceAfter: number;
  createdAt: Date;
}

@Injectable()
export class SaasCreditBillingService {
  private readonly logger = new Logger('SaasCreditBillingService');
  private readonly localBalances = new Map<string, TenantCreditBalance>();

  constructor(@Optional() @Inject(PG_POOL) private readonly pool?: Pool) {}

  /**
   * Fetch current AI credit balance for a tenant.
   */
  async getTenantBalance(tenantId: string): Promise<TenantCreditBalance> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM public.aura_tenant_ai_credits WHERE tenant_id = $1`,
          [tenantId],
        );
        if (res.rows.length > 0) {
          const r = res.rows[0];
          return {
            tenantId: r.tenant_id,
            planTier: r.plan_tier,
            balanceCredits: Number(r.balance_credits),
            monthlyQuotaCredits: Number(r.monthly_quota_credits),
            autoRecharge: Boolean(r.auto_recharge),
            updatedAt: new Date(r.updated_at),
          };
        }
      } catch (err: any) {
        this.logger.warn(`Failed DB fetch for tenant credits: ${err.message}`);
      }
    }

    // Default seeded credit balance
    let balance = this.localBalances.get(tenantId);
    if (!balance) {
      balance = {
        tenantId,
        planTier: 'enterprise',
        balanceCredits: 50000.0,
        monthlyQuotaCredits: 50000.0,
        autoRecharge: true,
        updatedAt: new Date(),
      };
      this.localBalances.set(tenantId, balance);
    }
    return balance;
  }

  /**
   * Meter & consume credits before executing an AI agent task.
   */
  async consumeCredits(tenantId: string, agentId: string, creditsToConsume = 1.0, taskType = 'agent_execution'): Promise<{ remainingBalance: number; status: string }> {
    const current = await this.getTenantBalance(tenantId);

    if (current.balanceCredits < creditsToConsume) {
      this.logger.warn(`Tenant "${tenantId}" credit balance exhausted (${current.balanceCredits} credits remaining, requested ${creditsToConsume})`);
      throw new ForbiddenException(`Tenant "${tenantId}" has insufficient AI credits (${current.balanceCredits} available). Please top up.`);
    }

    const newBalance = current.balanceCredits - creditsToConsume;
    current.balanceCredits = newBalance;
    current.updatedAt = new Date();
    this.localBalances.set(tenantId, current);

    this.logger.log(`[SaaS Metering] Tenant "${tenantId}" consumed ${creditsToConsume} credits for Agent "${agentId}". Balance after: ${newBalance}`);

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO public.aura_tenant_ai_credits (tenant_id, plan_tier, balance_credits, monthly_quota_credits)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id) DO UPDATE SET balance_credits = $3, updated_at = now()`,
        [tenantId, current.planTier, newBalance, current.monthlyQuotaCredits],
      ).catch((err) => this.logger.warn(`Failed DB update balance: ${err.message}`));

      await this.pool.query(
        `INSERT INTO public.aura_ai_credit_ledger (tenant_id, agent_id, task_type, credits_consumed, balance_after)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, agentId, taskType, creditsToConsume, newBalance],
      ).catch((err) => this.logger.warn(`Failed DB insert ledger: ${err.message}`));
    }

    return { remainingBalance: newBalance, status: 'credits_metered_successfully' };
  }

  /**
   * Top up AI credits for a tenant.
   */
  async topUpCredits(tenantId: string, amountCredits: number): Promise<TenantCreditBalance> {
    const current = await this.getTenantBalance(tenantId);
    current.balanceCredits += amountCredits;
    current.updatedAt = new Date();
    this.localBalances.set(tenantId, current);

    this.logger.log(`[SaaS Billing] Topped up ${amountCredits} credits for Tenant "${tenantId}". New balance: ${current.balanceCredits}`);
    return current;
  }
}
