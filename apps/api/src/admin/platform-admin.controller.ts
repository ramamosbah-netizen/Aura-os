import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { AiService, AuditService, MfaService, Permissions, SettingsService, TenantContext, WorkflowService } from '@aura/core';
import { readSecret } from '@aura/shared';
import { AiGuardrailsService, AutonomyService, type GuardrailRule } from '@aura/intelligence';
import { DemoSeeder } from '../demo/demo.seeder';

/**
 * Platform admin surfaces (Admin Center phase 2):
 *  - §2.8 notification routing status — which transports are configured (env, read-only
 *    booleans; secrets never leave the server), the effective routing (tenant settings
 *    override env), and the event→notification wirings.
 *  - §2.9 data admin — idempotent demo-data seed.
 * Routing edits themselves go through the settings service (`notify.*` keys).
 */
@Controller('admin/platform')
export class PlatformAdminController {
  constructor(
    private readonly settings: SettingsService,
    private readonly tenant: TenantContext,
    private readonly demo: DemoSeeder,
    private readonly ai: AiService,
    private readonly guardrails: AiGuardrailsService,
    private readonly autonomy: AutonomyService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
    private readonly workflows: WorkflowService,
  ) {}

  /**
   * §2.2/§2.3 depth — the security posture in one guarded read: auth mode, lockout
   * policy, MFA enrolments (never secrets), SSO wiring, PII-crypto staging. Env-bound
   * values are read-only here by design; the runbooks say how to change them.
   */
  @Permissions('admin.security.manage')
  @Get('security')
  async security(): Promise<{
    auth: { verifier: 'jwks' | 'hs256' | 'off'; required: boolean; devTokensAllowed: boolean; devPasswordSet: boolean; lockout: { maxAttempts: number; windowSec: number; lockSec: number } };
    mfa: Array<{ userId: string; active: boolean }>;
    sso: { jwksConfigured: boolean; groupRoleMap: Array<{ group: string; role: string }> };
    pii: { encryptionConfigured: boolean; rotationStaged: boolean };
  }> {
    const groupRoleMap = (process.env.AUTH_GROUP_ROLE_MAP ?? '')
      .split(',')
      .map((pair) => {
        const i = pair.indexOf('=');
        return i > 0 ? { group: pair.slice(0, i).trim(), role: pair.slice(i + 1).trim() } : null;
      })
      .filter((p): p is { group: string; role: string } => p !== null);
    return {
      auth: {
        verifier: process.env.AUTH_JWKS_URL?.trim() ? 'jwks' : readSecret('AUTH_JWT_SECRET') ? 'hs256' : 'off',
        required: process.env.AUTH_REQUIRED === 'true',
        devTokensAllowed: process.env.AUTH_ALLOW_DEV_TOKENS === 'true',
        devPasswordSet: !!process.env.AUTH_DEV_PASSWORD?.trim(),
        lockout: {
          maxAttempts: Number(process.env.AUTH_LOCKOUT_MAX_ATTEMPTS ?? 5),
          windowSec: Math.round(Number(process.env.AUTH_LOCKOUT_WINDOW_MS ?? 60_000) / 1000),
          lockSec: Math.round(Number(process.env.AUTH_LOCKOUT_DURATION_MS ?? 300_000) / 1000),
        },
      },
      mfa: await this.mfa.listEnrolments(),
      sso: { jwksConfigured: !!process.env.AUTH_JWKS_URL?.trim(), groupRoleMap },
      pii: {
        encryptionConfigured: !!readSecret('PII_ENCRYPTION_KEY'),
        rotationStaged: !!readSecret('PII_ENCRYPTION_KEY_PREVIOUS'),
      },
    };
  }

  /** §2.3 — the workflow-definitions registry with live instance counts per definition. */
  @Permissions('admin.workflows.manage')
  @Get('workflows')
  async workflowRegistry(): Promise<{
    definitions: Array<{ key: string; name: string; version: number; tenantScoped: boolean; states: number; transitions: number; initialState: string; instances: { running: number; completed: number; total: number } }>;
  }> {
    const tenantId = this.tenant.get().tenantId;
    const [defs, instances] = await Promise.all([
      this.workflows.listDefinitions(tenantId),
      this.workflows.listInstances({ tenantId }),
    ]);
    return {
      definitions: defs.map((d) => {
        const mine = instances.filter((i) => i.definitionKey === d.key);
        const open = mine.filter((i) => i.status === 'open').length;
        const completed = mine.filter((i) => i.status === 'completed').length;
        return {
          key: d.key,
          name: d.name,
          version: d.version,
          tenantScoped: !!d.tenantId,
          states: d.states.length,
          transitions: d.transitions.length,
          initialState: d.initialState,
          instances: { running: open, completed, total: mine.length },
        };
      }),
    };
  }

  /** §2.7 AI administration — provider seam, guardrail rules, autonomy queue size. */
  @Permissions('admin.ai.manage')
  @Get('ai')
  async aiStatus(): Promise<{
    provider: string;
    keyConfigured: boolean;
    guardrails: GuardrailRule[];
    autonomy: { pending: number; total: number };
  }> {
    const proposals = await this.autonomy.list(this.tenant.get().tenantId);
    return {
      provider: this.ai.activeProvider,
      keyConfigured: !!process.env.ANTHROPIC_API_KEY,
      guardrails: this.guardrails.listRules(),
      autonomy: {
        pending: proposals.filter((p: { status: string }) => p.status === 'pending').length,
        total: proposals.length,
      },
    };
  }

  /** Toggle a guardrail rule — write-through to aura_ai_guardrails, survives restarts; audited. */
  @Permissions('admin.ai.manage')
  @Post('ai/guardrails/toggle')
  toggleGuardrail(@Body() dto: { key?: string; enabled?: boolean }): { ok: true } {
    if (!dto?.key?.trim()) throw new BadRequestException('key is required');
    if (!this.guardrails.setEnabled(dto.key.trim(), dto.enabled !== false)) {
      throw new BadRequestException(`unknown guardrail: ${dto.key}`);
    }
    const ctx = this.tenant.get();
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'guardrail', dto.key.trim(), dto.enabled !== false ? 'enabled' : 'disabled', {});
    return { ok: true };
  }

  @Permissions('admin.notifications.manage')
  @Get('notifications')
  async notificationStatus(): Promise<{
    transports: Record<string, boolean>;
    effective: { channels: string; fallbackRecipient: string; recipients: string; source: Record<string, 'settings' | 'env' | 'unset'> };
    events: Array<{ type: string; title: string; rule: string | null }>;
  }> {
    const tenantId = this.tenant.get().tenantId;
    const setting = async (key: string): Promise<string | null> => {
      const v = await this.settings.get(tenantId, key).catch(() => null);
      return v?.trim() ? v.trim() : null;
    };
    const [ch, rec, fb] = await Promise.all([
      setting('notify.channels'),
      setting('notify.recipients'),
      setting('notify.fallbackRecipient'),
    ]);
    const src = (s: string | null, env: string | undefined): 'settings' | 'env' | 'unset' =>
      s !== null ? 'settings' : env?.trim() ? 'env' : 'unset';

    return {
      transports: {
        email: !!process.env.SMTP_RELAY_URL,
        sms: !!process.env.SMS_RELAY_URL,
        slack: !!process.env.SLACK_WEBHOOK_URL,
        teams: !!process.env.TEAMS_WEBHOOK_URL,
      },
      effective: {
        channels: ch ?? process.env.NOTIFY_CHANNELS ?? '',
        fallbackRecipient: fb ?? process.env.NOTIFY_FALLBACK_RECIPIENT ?? '',
        recipients: rec ?? process.env.NOTIFY_RECIPIENTS ?? '',
        source: {
          channels: src(ch, process.env.NOTIFY_CHANNELS),
          fallbackRecipient: src(fb, process.env.NOTIFY_FALLBACK_RECIPIENT),
          recipients: src(rec, process.env.NOTIFY_RECIPIENTS),
        },
      },
      // The event→notification wirings registered in notifications-subscriber.ts, each
      // with its per-event rule (notify.rule.<type>: null = defaults, 'off', or channel csv).
      events: await Promise.all(
        [
          { type: 'procurement.po.approved', title: 'Purchase order approved' },
          { type: 'contracts.ipc.certified', title: 'Payment certificate certified' },
          { type: 'finance.period.closed', title: 'Fiscal period closed' },
          { type: 'tendering.tender.awarded', title: 'Tender won' },
          { type: 'fleet.vehicle.registration_expiring', title: 'Vehicle registration expiring' },
          { type: 'amc.ticket.sla_breached', title: 'AMC ticket SLA breached' },
        ].map(async (e) => ({ ...e, rule: await setting(`notify.rule.${e.type}`) })),
      ),
    };
  }

  @Permissions('admin.data.manage')
  @Post('seed-demo')
  seedDemo(): Promise<{ seeded: boolean; reason?: string }> {
    return this.demo.runIfEmpty();
  }
}
