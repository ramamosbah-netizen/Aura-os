import { Injectable, Logger } from '@nestjs/common';

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
export class AiGuardrailsService {
  private readonly logger = new Logger('AiGuardrails');
  private readonly rules = new Map<string, GuardrailRule>();

  registerRule(rule: GuardrailRule): void {
    this.rules.set(rule.key, rule);
    this.logger.log(`[AiGuardrails] Rule registered: "${rule.key}" (${rule.type})`);
  }

  listRules(): GuardrailRule[] {
    return Array.from(this.rules.values());
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
