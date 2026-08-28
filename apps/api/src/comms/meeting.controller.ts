import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions, TenantContext } from '@aura/core';
import { MEETING_TYPES, type MeetingPatch, type MeetingType } from './meeting-store';
import { MeetingService } from './meeting.service';
import { WorkspaceConfigService } from '../workspace/workspace-config.service';

const DEV_USER = process.env.WORKSPACE_DEV_USER ?? 'u-admin';

@Controller('comms/meetings')
@Permissions('comms.channel.read')
export class MeetingController {
  constructor(private readonly meetings: MeetingService, private readonly tenant: TenantContext, private readonly workspace: WorkspaceConfigService) {}
  private async caller() { const ctx = this.tenant.get(); const userId = ctx.actorId ?? DEV_USER; const me = await this.workspace.me(ctx.tenantId, userId); return { tenantId: ctx.tenantId, companyId: ctx.companyId ?? null, userId, isAdmin: me.isAdmin }; }

  @Get()
  async list(@Query('scope') scope?: string) { const c = await this.caller(); return this.meetings.list(c.tenantId, c.companyId, scope); }

  @Get(':id')
  async get(@Param('id') id: string) { const c = await this.caller(); return this.meetings.get(c.tenantId, id, c.companyId); }

  @Post()
  @Permissions('comms.channel.send')
  async create(@Body() dto: { title?: string; meetingType?: string; startsAt?: string; endsAt?: string; timezone?: string; location?: string; onlineUrl?: string; attendees?: Array<{ userId?: string; address?: string; displayName?: string; response?: 'pending' | 'accepted' | 'declined' | 'tentative' }>; relatedType?: string; relatedId?: string; relatedName?: string; agenda?: string }) {
    const c = await this.caller();
    if (!dto?.title?.trim() || !dto.startsAt || !dto.endsAt) throw new BadRequestException('Title, start and end are required');
    if (dto.meetingType && !MEETING_TYPES.includes(dto.meetingType as MeetingType)) throw new BadRequestException('Unknown meeting type');
    return this.meetings.create({ tenantId: c.tenantId, companyId: c.companyId, organizerId: c.userId, title: dto.title, meetingType: dto.meetingType as MeetingType | undefined, startsAt: dto.startsAt, endsAt: dto.endsAt, timezone: dto.timezone, location: dto.location, onlineUrl: dto.onlineUrl, attendees: (dto.attendees ?? []).map((attendee) => ({ ...attendee, displayName: attendee.displayName?.trim() || attendee.userId || attendee.address || 'Guest' })), relatedType: dto.relatedType, relatedId: dto.relatedId, relatedName: dto.relatedName, agenda: dto.agenda });
  }

  @Patch(':id')
  @Permissions('comms.channel.send')
  async update(@Param('id') id: string, @Body() dto: MeetingPatch) { const c = await this.caller(); if (dto.meetingType && !MEETING_TYPES.includes(dto.meetingType)) throw new BadRequestException('Unknown meeting type'); return this.meetings.update(c.tenantId, id, dto, c.userId, c.isAdmin, c.companyId); }

  @Post(':id/items')
  @Permissions('comms.channel.send')
  async addItem(@Param('id') id: string, @Body() dto: { kind?: string; title?: string; detail?: string; ownerId?: string; dueAt?: string }) { const c = await this.caller(); return this.meetings.addItem(c.tenantId, c.userId, id, dto, c.isAdmin, c.companyId); }

  @Patch(':id/items/:itemId')
  @Permissions('comms.channel.send')
  async updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: { status?: 'open' | 'done' | 'cancelled' }) { const c = await this.caller(); return this.meetings.updateItem(c.tenantId, id, itemId, dto, c.userId, c.isAdmin, c.companyId); }

  @Post(':id/close')
  @Permissions('comms.channel.send')
  async close(@Param('id') id: string, @Body() dto: { minutes?: string }) { const c = await this.caller(); return this.meetings.close(c.tenantId, id, dto?.minutes ?? null, c.userId, c.isAdmin, c.companyId); }
}
