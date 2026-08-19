import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions, TenantContext } from '@aura/core';
import { MailService, type MailCaller } from './mail.service';
import { MAIL_STORE, type MailStore } from './mail-store';
import type { MailParticipant, MailRecord } from './mail-domain';
import { Inject } from '@nestjs/common';

/** Dev fallback identity when auth enforcement is off, mirroring CommsController. */
const DEV_USER = process.env.WORKSPACE_DEV_USER ?? 'u-admin';

interface ComposeDto {
  to?: MailParticipant[] | string[];
  cc?: MailParticipant[] | string[];
  bcc?: MailParticipant[] | string[];
  subject?: string;
  body?: string;
  accountId?: string | null;
}

interface ScheduleDto { localDateTime?: string; timezone?: string }

/**
 * The mail HTTP surface for the Communication workspace.
 *
 * Mounted at `comms/mailbox` rather than a top-level path so the guard's derived permission stays
 * inside the `comms.*` namespace every standard role already holds — a new namespace would refuse
 * mail to everyone but a wildcard admin, which is the exact breakage C1/3 repaired.
 *
 * Identity comes from the verified request context; no route takes a tenant, company or user in
 * its DTO, so an id in a body cannot impersonate.
 */
@Controller('comms/mailbox')
@Permissions('comms.mail.read')
export class MailboxController {
  constructor(
    private readonly mail: MailService,
    private readonly tenant: TenantContext,
    @Inject(MAIL_STORE) private readonly store: MailStore,
  ) {}

  private caller(): MailCaller {
    const ctx = this.tenant.get();
    const userId = ctx.actorId ?? DEV_USER;
    return { tenantId: ctx.tenantId, companyId: ctx.companyId ?? null, userId, address: null };
  }

  /**
   * Connected sending accounts. Returns what is actually configured — nothing is invented, so a
   * tenant with no external mailbox sees only AURA internal and the UI cannot imply otherwise.
   */
  @Get('accounts')
  async accounts(): Promise<Array<{ id: string; provider: string; label: string; status: string; capabilities: string[] }>> {
    const ctx = this.tenant.get();
    const rows = await this.store.listAccounts(ctx.tenantId, 'email');
    return [
      { id: 'aura-internal', provider: 'aura-internal', label: 'AURA internal mail', status: 'connected', capabilities: ['send', 'scheduled_send'] },
      ...rows.map((row) => ({
        id: row.id, provider: row.provider, label: row.label, status: row.status, capabilities: row.capabilities,
      })),
    ];
  }

  @Get('folder/:folder')
  async folder(@Param('folder') folder: string, @Query('q') q?: string): Promise<MailRecord[]> {
    const known = ['inbox', 'sent', 'drafts', 'scheduled', 'needs-review'];
    if (!known.includes(folder)) throw new BadRequestException(`Unknown folder: ${folder}`);
    return this.mail.folder(this.caller(), folder as never, q ?? null);
  }

  @Get('message/:id/thread')
  async thread(@Param('id') id: string): Promise<MailRecord[]> {
    return this.mail.thread(this.caller(), id);
  }

  @Post('drafts')
  @Permissions('comms.mail.send')
  async createDraft(@Body() dto: ComposeDto): Promise<MailRecord> {
    return this.mail.createDraft(this.caller(), dto);
  }

  @Patch('drafts/:id')
  @Permissions('comms.mail.send')
  async updateDraft(@Param('id') id: string, @Body() dto: ComposeDto): Promise<MailRecord> {
    return this.mail.updateDraft(this.caller(), id, dto);
  }

  @Delete('drafts/:id')
  @Permissions('comms.mail.send')
  async deleteDraft(@Param('id') id: string): Promise<{ ok: true }> {
    await this.mail.deleteDraft(this.caller(), id);
    return { ok: true };
  }

  @Post('message/:id/send')
  @Permissions('comms.mail.send')
  async send(@Param('id') id: string): Promise<MailRecord> {
    return this.mail.queueForSend(this.caller(), id);
  }

  @Post('message/:id/schedule')
  @Permissions('comms.mail.send')
  async schedule(@Param('id') id: string, @Body() dto: ScheduleDto): Promise<MailRecord> {
    if (!dto?.localDateTime || !dto?.timezone) {
      throw new BadRequestException('A scheduled send requires both a date/time and a timezone');
    }
    return this.mail.schedule(this.caller(), id, { localDateTime: dto.localDateTime, timezone: dto.timezone });
  }

  @Post('message/:id/cancel')
  @Permissions('comms.mail.send')
  async cancel(@Param('id') id: string): Promise<MailRecord> {
    return this.mail.cancel(this.caller(), id);
  }

  @Post('message/:id/reply')
  @Permissions('comms.mail.send')
  async reply(@Param('id') id: string, @Body() dto: { body?: string; all?: boolean }): Promise<MailRecord> {
    return dto?.all
      ? this.mail.replyAll(this.caller(), id, dto?.body ?? '')
      : this.mail.reply(this.caller(), id, dto?.body ?? '');
  }

  @Post('message/:id/forward')
  @Permissions('comms.mail.send')
  async forward(@Param('id') id: string, @Body() dto: { to?: MailParticipant[] | string[]; body?: string }): Promise<MailRecord> {
    if (!dto?.to || dto.to.length === 0) throw new BadRequestException('A forward requires at least one recipient');
    return this.mail.forward(this.caller(), id, dto.to, dto?.body ?? '');
  }

  @Post('message/:id/read')
  async markRead(@Param('id') id: string): Promise<{ ok: true }> {
    await this.mail.markRead(this.caller(), id);
    return { ok: true };
  }
}
