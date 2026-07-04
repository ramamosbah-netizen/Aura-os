import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import type { ChatAttachment, ChatChannel, ChatMessage, ChatMessageKind, MailMessage, Mailbox } from '@aura/shared';
import { CommsService, type ChannelSummary } from './comms.service';
import { WorkspaceConfigService } from '../workspace/workspace-config.service';

/** Dev fallback identity when auth enforcement is off (mirrors WorkspaceController). */
const DEV_USER = process.env.WORKSPACE_DEV_USER ?? 'u-admin';

/** Team chat + internal mail. Identity comes from the JWT sub, like /workspace/me. */
@Controller('comms')
export class CommsController {
  constructor(
    private readonly comms: CommsService,
    private readonly workspace: WorkspaceConfigService,
    private readonly tenant: TenantContext,
  ) {}

  private async caller(): Promise<{ tenantId: string; username: string; isAdmin: boolean }> {
    const ctx = this.tenant.get();
    const username = ctx.actorId ?? DEV_USER;
    const me = await this.workspace.me(ctx.tenantId, username);
    return { tenantId: ctx.tenantId, username, isAdmin: me.isAdmin };
  }

  @Get('channels')
  async channels(): Promise<ChannelSummary[]> {
    const { tenantId, username, isAdmin } = await this.caller();
    return this.comms.channels(tenantId, username, isAdmin);
  }

  @Post('dm')
  async openDm(@Body() body: { peer?: string }): Promise<ChatChannel> {
    if (!body?.peer) throw new BadRequestException('peer is required');
    const { tenantId, username } = await this.caller();
    return this.comms.openDm(tenantId, username, body.peer);
  }

  @Get('channels/:id/messages')
  async messages(@Param('id') id: string): Promise<ChatMessage[]> {
    const { tenantId, username } = await this.caller();
    return this.comms.messages(tenantId, username, id);
  }

  @Post('channels/:id/messages')
  async post(
    @Param('id') id: string,
    @Body() body: { kind?: ChatMessageKind; text?: string; attachment?: ChatAttachment | null },
  ): Promise<ChatMessage> {
    const { tenantId, username } = await this.caller();
    const result = await this.comms.post(tenantId, {
      channelId: id,
      sender: username,
      kind: body?.kind ?? 'text',
      text: body?.text,
      attachment: body?.attachment ?? null,
    });
    if ('error' in result) throw new BadRequestException(result.error);
    return result;
  }

  @Get('mail')
  async mailbox(): Promise<Mailbox> {
    const { tenantId, username } = await this.caller();
    return this.comms.mailbox(tenantId, username);
  }

  @Post('mail')
  async sendMail(@Body() body: { to?: string[]; subject?: string; body?: string }): Promise<MailMessage> {
    const { tenantId, username } = await this.caller();
    const result = await this.comms.sendMail(tenantId, {
      from: username,
      to: body?.to ?? [],
      subject: body?.subject,
      body: body?.body,
    });
    if ('error' in result) throw new BadRequestException(result.error);
    return result;
  }

  @Post('mail/:id/read')
  async markRead(@Param('id') id: string): Promise<{ ok: true }> {
    const { tenantId, username } = await this.caller();
    await this.comms.markMailRead(tenantId, username, id);
    return { ok: true };
  }

  @Get('unread')
  async unread(@Query() _q: unknown): Promise<{ chat: number; mail: number }> {
    const { tenantId, username, isAdmin } = await this.caller();
    return this.comms.unread(tenantId, username, isAdmin);
  }
}
