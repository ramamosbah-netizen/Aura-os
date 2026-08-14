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

export interface ConsumeResult {
  remainingBalance: number;
  status: 'credits_metered_successfully' | 'already_metered';
  creditsConsumed: number;
}

@Injectable()
export class SaasCreditBillingService {
  private readonly logger = new Logger('SaasCreditBillingService');
  private readonly localBalances = new Map<string, TenantCreditBalance>();
  /** Idempotency guard for the in-memory path: billing keys already charged. */
  private readonly settledKeys = new Map<string, number>();

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
   *
   * When a `billingKey` is supplied the charge is idempotent: a retry of the same execution debits
   * the tenant exactly once. On the DB path a partial-unique index on `billing_key` makes the ledger
   * insert the source of truth — if it conflicts, the earlier charge already stands and the balance
   * is left untouched. On the in-memory path a settled-key map plays the same role.
   */
  async consumeCredits(
    tenantId: string,
    agentId: string,
    creditsToConsume = 1.0,
    taskType = 'agent_execution',
    billingKey?: string,
  ): Promise<ConsumeResult> {
    if (this.pool) {
      return this.consumeCreditsDb(tenantId, agentId, creditsToConsume, taskType, billingKey);
    }
    return this.consumeCreditsLocal(tenantId, agentId, creditsToConsume, billingKey);
  }

  /**
   * Atomic DB path: idempotency-claim, budget-guard, debit and ledger all commit in ONE transaction.
   *
   * Order matters. We INSERT the ledger row FIRST as the idempotency claim — a duplicate billing_key
   * hits the partial-unique index, returns no row, and we roll back without charging. If we own the
   * claim we debit with a guarded UPDATE (`WHERE balance_credits >= price`) so an overspend can never
   * commit under concurrency; if the guard matches nothing, funds are insufficient and the whole
   * transaction (including the ledger claim) rolls back. Because check → debit → ledger share one
   * transaction, there is no window in which a crash could leave a charge without a matching debit.
   */
  private async consumeCreditsDb(
    tenantId: string,
    agentId: string,
    creditsToConsume: number,
    taskType: string,
    billingKey?: string,
  ): Promise<ConsumeResult> {
    const seed = await this.getTenantBalance(tenantId);
    const client = await this.pool!.connect();
    try {
      await client.query('BEGIN');

      // 1. Idempotency claim. balance_after is backfilled once the debit tells us the new balance.
      const claim = await client.query(
        // The unique index on billing_key is partial (WHERE billing_key IS NOT NULL), so the
        // ON CONFLICT target must repeat that predicate to match it.
        `INSERT INTO public.aura_ai_credit_ledger (tenant_id, agent_id, task_type, credits_consumed, balance_after, billing_key)
         VALUES ($1, $2, $3, $4, 0, $5)
         ON CONFLICT (billing_key) WHERE billing_key IS NOT NULL DO NOTHING
         RETURNING id`,
        [tenantId, agentId, taskType, creditsToConsume, billingKey ?? null],
      );
      if (billingKey && claim.rows.length === 0) {
        await client.query('ROLLBACK');
        const bal = await this.getTenantBalance(tenantId);
        return { remainingBalance: bal.balanceCredits, status: 'already_metered', creditsConsumed: 0 };
      }

      // 2. Ensure the tenant's credit row exists (seeded from the default balance on first use).
      await client.query(
        `INSERT INTO public.aura_tenant_ai_credits (tenant_id, plan_tier, balance_credits, monthly_quota_credits)
         VALUES ($1, $2, $3, $4) ON CONFLICT (tenant_id) DO NOTHING`,
        [tenantId, seed.planTier, seed.balanceCredits, seed.monthlyQuotaCredits],
      );

      // 3. Guarded atomic debit — commits only if the balance can cover it.
      const debit = await client.query(
        `UPDATE public.aura_tenant_ai_credits
            SET balance_credits = balance_credits - $2, updated_at = now()
          WHERE tenant_id = $1 AND balance_credits >= $2
          RETURNING balance_credits`,
        [tenantId, creditsToConsume],
      );
      if (debit.rows.length === 0) {
        await client.query('ROLLBACK');
        this.logger.warn(`Tenant "${tenantId}" has insufficient AI credits for ${creditsToConsume} (agent ${agentId}).`);
        throw new ForbiddenException(`Tenant "${tenantId}" has insufficient AI credits. Please top up.`);
      }
      const newBalance = Number(debit.rows[0].balance_credits);

      if (claim.rows.length > 0) {
        await client.query(`UPDATE public.aura_ai_credit_ledger SET balance_after = $2 WHERE id = $1`, [claim.rows[0].id, newBalance]);
      }

      await client.query('COMMIT');

      // Keep the in-memory cache and idempotency set in step with what committed.
      this.localBalances.set(tenantId, { ...seed, balanceCredits: newBalance, updatedAt: new Date() });
      if (billingKey) this.settledKeys.set(billingKey, creditsToConsume);

      this.logger.log(`[SaaS Metering] Tenant "${tenantId}" consumed ${creditsToConsume} credits for Agent "${agentId}". Balance after: ${newBalance}`);
      return { remainingBalance: newBalance, status: 'credits_metered_successfully', creditsConsumed: creditsToConsume };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** In-memory path for tests and pool-less boot: single-threaded, so a settled-key map is enough. */
  private async consumeCreditsLocal(
    tenantId: string,
    agentId: string,
    creditsToConsume: number,
    billingKey?: string,
  ): Promise<ConsumeResult> {
    if (billingKey && this.settledKeys.has(billingKey)) {
      const balance = await this.getTenantBalance(tenantId);
      return { remainingBalance: balance.balanceCredits, status: 'already_metered', creditsConsumed: 0 };
    }

    const current = await this.getTenantBalance(tenantId);
    if (current.balanceCredits < creditsToConsume) {
      this.logger.warn(`Tenant "${tenantId}" credit balance exhausted (${current.balanceCredits} remaining, requested ${creditsToConsume})`);
      throw new ForbiddenException(`Tenant "${tenantId}" has insufficient AI credits (${current.balanceCredits} available). Please top up.`);
    }

    const newBalance = current.balanceCredits - creditsToConsume;
    current.balanceCredits = newBalance;
    current.updatedAt = new Date();
    this.localBalances.set(tenantId, current);
    if (billingKey) this.settledKeys.set(billingKey, creditsToConsume);

    this.logger.log(`[SaaS Metering] Tenant "${tenantId}" consumed ${creditsToConsume} credits for Agent "${agentId}". Balance after: ${newBalance}`);
    return { remainingBalance: newBalance, status: 'credits_metered_successfully', creditsConsumed: creditsToConsume };
  }

  /**
   * Top up AI credits for a tenant.
   */
  async topUpCredits(tenantId: string, amountCredits: number): Promise<TenantCreditBalance> {
    if (!(amountCredits > 0)) {
      throw new ForbiddenException('Top-up amount must be a positive number of credits.');
    }
    const current = await this.getTenantBalance(tenantId);
    const newBalance = current.balanceCredits + amountCredits;

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO public.aura_tenant_ai_credits (tenant_id, plan_tier, balance_credits, monthly_quota_credits)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id) DO UPDATE SET balance_credits = public.aura_tenant_ai_credits.balance_credits + $5, updated_at = now()`,
        [tenantId, current.planTier, newBalance, current.monthlyQuotaCredits, amountCredits],
      ).catch((err) => this.logger.warn(`Failed DB update balance on top-up: ${err.message}`));

      // A top-up is a positive movement on the same ledger the debits are recorded against.
      await this.pool.query(
        `INSERT INTO public.aura_ai_credit_ledger (tenant_id, agent_id, task_type, credits_consumed, balance_after)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, 'system', 'credit_topup', -amountCredits, newBalance],
      ).catch((err) => this.logger.warn(`Failed DB insert top-up ledger: ${err.message}`));
    }

    current.balanceCredits = newBalance;
    current.updatedAt = new Date();
    this.localBalances.set(tenantId, current);

    this.logger.log(`[SaaS Billing] Topped up ${amountCredits} credits for Tenant "${tenantId}". New balance: ${newBalance}`);
    return current;
  }
}
