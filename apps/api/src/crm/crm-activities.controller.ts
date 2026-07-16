import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import {
  type Activity, type ActivityType, type ActivityStatus, type ActivityRelatedType,
  ACTIVITY_RELATED_TYPES, ACTIVITY_TYPES, ActivityService,
} from '@aura/crm';

class CreateActivityDto {
  // G10 — same edge rule as relatedType: a typo'd type would persist and silently vanish from
  // every type-filtered view. The list is the domain's, so widening the vocabulary is one edit.
  @IsIn(ACTIVITY_TYPES as readonly string[]) type!: ActivityType;
  @IsString() subject!: string;
  @IsOptional() @IsString() notes?: string;
  // G1: the related-type union is enforced at the edge, not just in TypeScript — a typo'd
  // relatedType would otherwise persist and silently drop the activity out of every view that
  // filters by it. The list is the domain's, so widening the chain never needs a change here.
  @IsOptional() @IsIn(ACTIVITY_RELATED_TYPES as readonly string[]) relatedType?: ActivityRelatedType;
  @IsOptional() @IsString() relatedId?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() status?: ActivityStatus;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() relatedName?: string;
  @IsOptional() @IsString() outcome?: string;
}

class FollowUpDto {
  @IsIn(ACTIVITY_TYPES as readonly string[]) type!: ActivityType;
  @IsString() subject!: string;
  @IsOptional() @IsString() dueDate?: string;
}

class CompleteActivityDto {
  @IsOptional() @IsString() outcome?: string;
  @IsOptional() followUp?: FollowUpDto;
}

/**
 * CRM activities API — interactions + tasks. Stamps tenant/actor from context and
 * delegates to ActivityService.
 */
@Controller('crm/activities')
export class CrmActivitiesController {
  constructor(
    private readonly activities: ActivityService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateActivityDto): Promise<Activity> {
    if (!dto?.type) throw new BadRequestException('type is required');
    if (!dto?.subject?.trim()) throw new BadRequestException('subject is required');
    const ctx = this.tenant.get();
    return this.activities.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      type: dto.type,
      subject: dto.subject,
      notes: dto.notes ?? null,
      relatedType: dto.relatedType ?? null,
      relatedId: dto.relatedId,
      relatedName: dto.relatedName ?? null,
      dueDate: dto.dueDate ?? null,
      status: dto.status,
      assigneeId: dto.assigneeId ?? ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(
    @Query('relatedType') relatedType?: string,
    @Query('relatedId') relatedId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ): Promise<Activity[]> {
    return this.activities.list({ tenantId: this.tenant.get().tenantId, relatedType, relatedId, status, type, limit: 100 });
  }

  @Get('paged')
  paged(
    @Query('relatedType') relatedType?: string,
    @Query('relatedId') relatedId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.activities.listPaged(
      { tenantId: this.tenant.get().tenantId, relatedType, relatedId, status, type },
      parsePageParams(limit, offset),
    );
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Activity> {
    const found = await this.activities.get(id);
    if (!found) throw new NotFoundException(`activity ${id} not found`);
    return found;
  }

  @Post(':id/cancel')
  async cancel(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Activity> {
    try {
      return await this.activities.cancel(id);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'cancel failed');
    }
  }

  /** G11 — begin work on a planned activity (site visits span hours; started ≠ scheduled). */
  @Post(':id/start')
  async start(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Activity> {
    try {
      return await this.activities.start(id);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'start failed');
    }
  }

  @Post(':id/reopen')
  async reopen(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Activity> {
    try {
      return await this.activities.reopen(id);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'reopen failed');
    }
  }

  /**
   * Complete an activity, optionally recording the outcome and scheduling a
   * follow-up task linked to the same record — the "log the call → what happened
   * → book the next step" loop that keeps a relationship warm.
   */
  @Post(':id/complete')
  async complete(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto?: CompleteActivityDto): Promise<Activity> {
    const done = await this.activities.complete(id, undefined, dto?.outcome);
    if (dto?.followUp?.subject?.trim() && dto.followUp.type) {
      const ctx = this.tenant.get();
      await this.activities.create({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        type: dto.followUp.type,
        subject: dto.followUp.subject,
        relatedType: done.relatedType,
        relatedId: done.relatedId,
        relatedName: done.relatedName,
        dueDate: dto.followUp.dueDate ?? null,
        assigneeId: done.assigneeId ?? ctx.actorId,
        createdBy: ctx.actorId,
      });
    }
    return done;
  }
}
