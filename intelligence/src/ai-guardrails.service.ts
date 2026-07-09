import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '@aura/core';

// ── Guardrail Rule Types ──────────────────────────────────────────────────────

export type GuardrailType = 'blocked_keywords' | 'max_tokens' | 'topic_filter' | 'pii_mask';

export interface GuardrailRule {
  key: string;
  label: string;
  type: GuardrailType;
  enabled: boolean;
  config: {
    keywords?: string[];         // For blocked_keywords
    maxTokens?: number;          // For max_tokens
    blockedTopics?: string[];    // For topic_filter
    piiPatterns?: string[];      // Regex patterns for PII masking
  };
}

export interface GuardrailCheckResult {
  passed: boolean;
  violations: Array<{ rule: string; reason: string }>;
  sanitizedContent?: string;    // Content with PII masked, if applicable
}

// ── AI Guardrails Service ─────────────────────────────────────────────────────

@Injectable()
export class AiGuardrailsService implements OnModuleInit {
  private readonly logger = new Logger('AiGuardrails');
  private readonly rules = new Map<string, GuardrailRule>();
  /** Rows persist under this tenant until the registry goes fully tenant-scoped. */
  private static readonly TENANT = 'dev-tenant';

  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null) {
    // Default rule pack — active from first boot so AI output is never unguarded.
    // Admins tune these at /admin/ai (§2.7); modules may register more at runtime.
    this.registerRule({
      key: 'content-safety',
      label: 'Content safety keywords',
      type: 'blocked_keywords',
      enabled: true,
      config: { keywords: ['exploit', 'malware', 'ransomware', 'bypass security', 'sql injection'] },
    });
    this.registerRule({
      key: 'pii-mask',
      label: 'PII masking',
      type: 'pii_mask',
      enabled: true,
      config: {},
    });
    this.registerRule({
      key: 'token-cap',
      label: 'Completion token cap',
      type: 'max_tokens',
      enabled: true,
      config: { maxTokens: 4000 },
    });
  }

  registerRule(rule: GuardrailRule): void {
    this.rules.set(rule.key, rule);
    this.logger.log(`[AiGuardrails] Rule registered: "${rule.key}" (${rule.type})`);
  }

  listRules(): GuardrailRule[] {
    return Array.from(this.rules.values());
  }

  /** Load persisted rule state over the code defaults (PG mode). Runs once on boot. */
  async onModuleInit(): Promise<void> {
    if (!this.pool) return;
    try {
      const { rows } = await this.pool.query<{
        rule_key: string;
        label: string;
        rule_type: GuardrailType;
        config: GuardrailRule['config'];
        enabled: boolean;
      }>(`SELECT rule_key, label, rule_type, config, enabled FROM public.aura_ai_guardrails WHERE tenant_id = $1`, [
        AiGuardrailsService.TENANT,
      ]);
      for (const r of rows) {
        const existing = this.rules.get(r.rule_key);
        this.rules.set(r.rule_key, {
          key: r.rule_key,
          label: r.label || existing?.label || r.rule_key,
          type: r.rule_type,
          enabled: r.enabled,
          config: existing ? { ...existing.config, ...(r.config ?? {}) } : (r.config ?? {}),
        });
      }
      if (rows.length) this.logger.log(`Hydrated ${rows.length} guardrail rule state(s) from Postgres`);
    } catch (err) {
      this.logger.warn(`Guardrail hydrate failed (using code defaults): ${(err as Error).message}`);
    }
  }

  /**
   * Toggle a rule on/off (Admin Center 2.7). Returns false when the key is unknown.
   * Write-throughs to `aura_ai_guardrails` when Postgres is configured, so toggles
   * survive restarts (hydrated back in onModuleInit).
   */
  setEnabled(key: string, enabled: boolean): boolean {
    const rule = this.rules.get(key);
    if (!rule) return false;
    this.rules.set(key, { ...rule, enabled });
    if (this.pool) {
      void this.pool
        .query(
          `INSERT INTO public.aura_ai_guardrails (tenant_id, rule_key, label, rule_type, config, enabled)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (tenant_id, rule_key) DO UPDATE SET enabled = excluded.enabled, label = excluded.label, config = excluded.config`,
          [AiGuardrailsService.TENANT, rule.key, rule.label, rule.type, JSON.stringify(rule.config ?? {}), enabled],
        )
        .catch((err) => this.logger.error(`persist guardrail ${key} failed: ${(err as Error).message}`));
    }
    return true;
  }

  /**
   * Validate content against all enabled guardrail rules.
   * Returns a result with violations and optionally sanitized content.
   */
  check(content: string, tokenCount?: number): GuardrailCheckResult {
    const violations: GuardrailCheckResult['violations'] = [];
    let sanitizedContent = content;

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      switch (rule.type) {
        case 'blocked_keywords': {
          const keywords = rule.config.keywords ?? [];
          for (const kw of keywords) {
            if (content.toLowerCase().includes(kw.toLowerCase())) {
              violations.push({ rule: rule.key, reason: `Blocked keyword detected: "${kw}"` });
            }
          }
          break;
        }

        case 'max_tokens': {
          const limit = rule.config.maxTokens ?? 4096;
          const tokens = tokenCount ?? Math.ceil(content.length / 4);
          if (tokens > limit) {
            violations.push({ rule: rule.key, reason: `Token count ${tokens} exceeds limit ${limit}` });
          }
          break;
        }

        case 'topic_filter': {
          const topics = rule.config.blockedTopics ?? [];
          for (const topic of topics) {
            if (content.toLowerCase().includes(topic.toLowerCase())) {
              violations.push({ rule: rule.key, reason: `Blocked topic detected: "${topic}"` });
            }
          }
          break;
        }

        case 'pii_mask': {
          const patterns = rule.config.piiPatterns ?? [
            '\\b\\d{3}-\\d{2}-\\d{4}\\b',           // SSN
            '\\b[A-Z0-9]{5,10}\\d{4}\\b',             // Passport-like
            '\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b', // Credit card
          ];
          let masked = sanitizedContent;
          for (const pattern of patterns) {
            masked = masked.replace(new RegExp(pattern, 'g'), '[REDACTED]');
          }
          if (masked !== sanitizedContent) {
            sanitizedContent = masked;
            this.logger.warn(`[AiGuardrails] PII detected and masked by rule "${rule.key}"`);
          }
          break;
        }
      }
    }

    if (violations.length > 0) {
      this.logger.warn(`[AiGuardrails] Content check FAILED — ${violations.length} violation(s): ${violations.map((v) => v.reason).join('; ')}`);
    } else {
      this.logger.log(`[AiGuardrails] Content check PASSED`);
    }

    return {
      passed: violations.length === 0,
      violations,
      sanitizedContent: sanitizedContent !== content ? sanitizedContent : undefined,
    };
  }
}
