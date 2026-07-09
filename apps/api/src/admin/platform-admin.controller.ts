import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { AiService, AuditService, Permissions, SettingsService, TenantContext } from '@aura/core';
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
  ) {}

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
    events: Array<{ type: string; title: string }>;
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
      // The event→notification wirings registered in notifications-subscriber.ts.
      events: [
        { type: 'procurement.po.approved', title: 'Purchase order approved' },
        { type: 'contracts.ipc.certified', title: 'Payment certificate certified' },
        { type: 'finance.period.closed', title: 'Fiscal period closed' },
        { type: 'tendering.tender.awarded', title: 'Tender won' },
        { type: 'fleet.vehicle.registration_expiring', title: 'Vehicle registration expiring' },
        { type: 'amc.ticket.sla_breached', title: 'AMC ticket SLA breached' },
      ],
    };
  }

  @Permissions('admin.data.manage')
  @Post('seed-demo')
  seedDemo(): Promise<{ seeded: boolean; reason?: string }> {
    return this.demo.runIfEmpty();
  }
}
