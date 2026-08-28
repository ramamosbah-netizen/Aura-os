import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Permissions, TenantContext } from '@aura/core';
import type { ChatAttachment, ChatChannel, ChatMessage, ChatMessageKind, MailMessage, Mailbox } from '@aura/shared';
import { CommsService, type ChannelSummary, type ChatPerson, type CommunicationFile, type UnreadCommunication } from './comms.service';
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

  /**
   * Identity comes from the verified request context and nowhere else. No route here takes a
   * tenant, company or user field in its DTO, so the only way to act as someone is to hold their
   * session — an id placed in a body or query cannot impersonate.
   */
  private async caller(): Promise<{ tenantId: string; companyId: string | null; username: string; isAdmin: boolean }> {
    const ctx = this.tenant.get();
    const username = ctx.actorId ?? DEV_USER;
    const me = await this.workspace.me(ctx.tenantId, username);
    return { tenantId: ctx.tenantId, companyId: ctx.companyId ?? null, username, isAdmin: me.isAdmin };
  }

  @Get('channels')
  @Permissions('comms.channel.read')
  async channels(): Promise<ChannelSummary[]> {
    const { tenantId, companyId, username, isAdmin } = await this.caller();
    return this.comms.channels(tenantId, username, isAdmin, companyId);
  }

  @Get('people')
  @Permissions('comms.channel.read')
  async people(): Promise<ChatPerson[]> {
    const { tenantId, companyId, username } = await this.caller();
    return this.comms.people(tenantId, username, companyId);
  }

  @Get('files')
  @Permissions('comms.channel.read')
  async files(): Promise<CommunicationFile[]> {
    const { tenantId, companyId, username, isAdmin } = await this.caller();
    return this.comms.files(tenantId, username, isAdmin, companyId);
  }

  @Get('unread/items')
  @Permissions('comms.channel.read')
  async unreadItems(): Promise<UnreadCommunication[]> {
    const { tenantId, companyId, username, isAdmin } = await this.caller();
    return this.comms.unreadItems(tenantId, username, isAdmin, companyId);
  }

  @Post('dm')
  @Permissions('comms.dm.create')
  async openDm(@Body() body: { peer?: string }): Promise<ChatChannel> {
    if (typeof body?.peer !== 'string' || !body.peer.trim()) throw new BadRequestException('peer is required');
    const { tenantId, companyId, username } = await this.caller();
    return this.comms.openDm(tenantId, username, body.peer, companyId);
  }

  @Get('projects/:projectId')
  @Permissions('comms.channel.read')
  async openProject(@Param('projectId') projectId: string): Promise<ChatChannel> {
    const { tenantId, companyId, username, isAdmin } = await this.caller();
    return this.comms.openProject(tenantId, username, projectId, isAdmin, companyId);
  }

  @Post('team')
  @Permissions('comms.team.create')
  async openTeam(@Body() body: { name?: string; members?: string[] }): Promise<ChatChannel> {
    const { tenantId, companyId, username } = await this.caller();
    return this.comms.openTeam(tenantId, username, body?.name ?? '', body?.members ?? [], companyId);
  }

  @Get('channels/:id/messages')
  @Permissions('comms.channel.read')
  async messages(@Param('id') id: string): Promise<ChatMessage[]> {
    const { tenantId, companyId, username, isAdmin } = await this.caller();
    return this.comms.messages(tenantId, username, id, isAdmin, companyId);
  }

  @Post('channels/:id/messages')
  @Permissions('comms.channel.send')
  async post(
    @Param('id') id: string,
    @Body() body: { kind?: ChatMessageKind; text?: string; attachment?: ChatAttachment | null },
  ): Promise<ChatMessage> {
    const { tenantId, companyId, username, isAdmin } = await this.caller();
    const result = await this.comms.post(tenantId, {
      channelId: id,
      sender: username,
      kind: body?.kind ?? 'text',
      text: body?.text,
      attachment: body?.attachment ?? null,
    }, companyId, isAdmin);
    if ('error' in result) throw new BadRequestException(result.error);
    return result;
  }

  @Get('mail')
  @Permissions('comms.mail.read')
  async mailbox(): Promise<Mailbox> {
    const { tenantId, username } = await this.caller();
    return this.comms.mailbox(tenantId, username);
  }

  @Post('mail')
  @Permissions('comms.mail.send')
  async sendMail(@Body() body: { to?: string[]; subject?: string; body?: string }): Promise<MailMessage> {
    const { tenantId, companyId, username } = await this.caller();
    const result = await this.comms.sendMail(tenantId, {
      from: username,
      to: body?.to ?? [],
      subject: body?.subject,
      body: body?.body,
    }, companyId);
    if ('error' in result) throw new BadRequestException(result.error);
    return result;
  }

  @Post('mail/:id/read')
  @Permissions('comms.mail.read')
  async markRead(@Param('id') id: string): Promise<{ ok: true }> {
    const { tenantId, username } = await this.caller();
    await this.comms.markMailRead(tenantId, username, id);
    return { ok: true };
  }

  @Get('unread')
  @Permissions('comms.channel.read')
  async unread(@Query() _q: unknown): Promise<{ chat: number; mail: number; whatsapp: number; total: number }> {
    const { tenantId, companyId, username, isAdmin } = await this.caller();
    return this.comms.unread(tenantId, username, isAdmin, companyId);
  }
}
