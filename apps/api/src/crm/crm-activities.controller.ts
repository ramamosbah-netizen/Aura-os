import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type Activity, type ActivityType, type ActivityStatus, type ActivityRelatedType, ActivityService } from '@aura/crm';

class CreateActivityDto {
  @IsString() type!: ActivityType;
  @IsString() subject!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() relatedType?: ActivityRelatedType;
  @IsOptional() @IsString() relatedId?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() status?: ActivityStatus;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() relatedName?: string;
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

  @Post(':id/reopen')
  async reopen(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Activity> {
    try {
      return await this.activities.reopen(id);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'reopen failed');
    }
  }

  @Post(':id/complete')
  async complete(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Activity> {
    return await this.activities.complete(id);
  }
}
