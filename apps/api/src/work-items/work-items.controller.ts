import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { TASK_RECURRENCES, type TaskRecurrence } from '@aura/crm';
import { WorkItemsService, type WorkItem, type WorkItemAction, type WorkItemsPayload } from './work-items.service';

const ACTIONS = new Set<WorkItemAction>(['start', 'complete', 'reopen']);

@Controller('work-items')
export class WorkItemsController {
  constructor(private readonly workItems: WorkItemsService, private readonly tenant: TenantContext) {}

  @Get()
  list(): Promise<WorkItemsPayload> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new UnauthorizedException('A signed-in user is required');
    return this.workItems.list(ctx.tenantId, ctx.actorId);
  }

  @Post()
  create(@Body() dto: { title?: string; memo?: string | null; dueAt?: string | null; reminderAt?: string | null; recurrence?: TaskRecurrence; recurrenceEndsOn?: string | null }): Promise<WorkItem> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new UnauthorizedException('A signed-in user is required');
    const title = dto?.title?.trim();
    if (!title) throw new BadRequestException('Task title is required');
    if (dto.dueAt && !/^\d{4}-\d{2}-\d{2}$/.test(dto.dueAt)) throw new BadRequestException('Due date must be YYYY-MM-DD');
    this.validateSchedule(dto);
    return this.workItems.create(ctx.tenantId, ctx.actorId, { title, memo: dto.memo ?? null, dueAt: dto.dueAt ?? null, reminderAt: dto.reminderAt ?? null, recurrence: dto.recurrence ?? 'none', recurrenceEndsOn: dto.recurrenceEndsOn ?? null });
  }

  @Post('reminders/sync')
  dispatchDueReminders(): Promise<{ dispatched: number }> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new UnauthorizedException('A signed-in user is required');
    return this.workItems.dispatchDueReminders(ctx.tenantId, ctx.actorId);
  }

  @Patch(':source/:id')
  update(
    @Param('source') source: string,
    @Param('id') id: string,
    @Body() dto: { title?: string; memo?: string | null; reminderAt?: string | null; recurrence?: TaskRecurrence; recurrenceEndsOn?: string | null },
  ): Promise<WorkItem> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new UnauthorizedException('A signed-in user is required');
    if (dto.title !== undefined && !dto.title.trim()) throw new BadRequestException('Task title is required');
    this.validateSchedule(dto);
    return this.workItems.update(ctx.tenantId, ctx.actorId, source, id, dto);
  }

  @Post(':source/:id/reschedule')
  reschedule(
    @Param('source') source: string,
    @Param('id') id: string,
    @Body() dto: { dueAt?: string; reason?: string },
  ): Promise<WorkItem> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new UnauthorizedException('A signed-in user is required');
    if (!dto?.dueAt || !/^\d{4}-\d{2}-\d{2}$/.test(dto.dueAt)) throw new BadRequestException('A valid new due date is required');
    if (!dto.reason?.trim() || dto.reason.trim().length < 3) throw new BadRequestException('A reason or justification is required');
    return this.workItems.reschedule(ctx.tenantId, ctx.actorId, source, id, dto.dueAt, dto.reason);
  }

  @Delete(':source/:id')
  remove(@Param('source') source: string, @Param('id') id: string): Promise<{ deleted: true }> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new UnauthorizedException('A signed-in user is required');
    return this.workItems.remove(ctx.tenantId, ctx.actorId, source, id);
  }

  @Post(':source/:id/:action')
  act(@Param('source') source: string, @Param('id') id: string, @Param('action') action: string): Promise<WorkItem> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new UnauthorizedException('A signed-in user is required');
    if (!ACTIONS.has(action as WorkItemAction)) throw new BadRequestException('Unknown work-item action');
    return this.workItems.act(ctx.tenantId, ctx.actorId, source, id, action as WorkItemAction);
  }

  private validateSchedule(dto: { reminderAt?: string | null; recurrence?: TaskRecurrence; recurrenceEndsOn?: string | null }): void {
    if (dto.reminderAt && Number.isNaN(Date.parse(dto.reminderAt))) throw new BadRequestException('Reminder must be a valid date and time');
    if (dto.recurrence && !(TASK_RECURRENCES as readonly string[]).includes(dto.recurrence)) throw new BadRequestException('Unknown recurrence');
    if (dto.recurrenceEndsOn && !/^\d{4}-\d{2}-\d{2}$/.test(dto.recurrenceEndsOn)) throw new BadRequestException('Recurrence end must be YYYY-MM-DD');
  }
}
