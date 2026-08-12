import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import {
  type CommissioningRecord,
  type CommissioningTestItem,
  type PunchItem,
  type PunchSeverity,
  type ElvSystem,
  CommissioningService,
} from '@aura/commissioning';

class RegisterDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() code!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() system?: ElvSystem;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsInt() @Min(0) pointsTotal?: number;
}

class TestDto {
  @IsInt() @Min(0) pointsPassed!: number;
  @IsOptional() @IsInt() @Min(0) pointsTotal?: number;
  @IsOptional() @IsString() testDate?: string;
  @IsOptional() @IsString() remarks?: string;
}

class CommissionDto {
  @IsString() commissionedBy!: string;
  @IsString() witnessedBy!: string;
}

class FailDto {
  @IsString() reason!: string;
}

class TestItemDto {
  @IsString() pointNo!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() expected?: string;
}
class TestResultDto {
  @IsString() result!: 'pass' | 'fail';
  @IsOptional() @IsString() actual?: string;
  @IsOptional() @IsString() remarks?: string;
}
class PunchDto {
  @IsString() description!: string;
  @IsOptional() @IsString() severity?: PunchSeverity;
  @IsOptional() @IsString() location?: string;
}
class ClosePunchDto {
  @IsString() resolution!: string;
}

/**
 * Commissioning (Test & Commission) API — the ELV deliverable register. Register a system,
 * record its test pass/total, then commission it with a witnessed sign-off (the event that
 * unlocks handover). Domain guards throw plain Errors classified by the global taxonomy
 * (404 not-found, 409 already/only-can, 400 required) — no 500 leaks.
 */
@Controller('commissioning/records')
export class CommissioningController {
  constructor(
    private readonly service: CommissioningService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  register(@Body() dto: RegisterDto): Promise<CommissioningRecord> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.service.register({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: dto.projectId,
      projectName: dto.projectName ?? null,
      code: dto.code,
      title: dto.title,
      system: dto.system,
      location: dto.location ?? null,
      pointsTotal: dto.pointsTotal,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(@Query('projectId') projectId?: string): Promise<CommissioningRecord[]> {
    return this.service.list(this.tenant.get().tenantId, projectId);
  }

  @Get('paged')
  paged(
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.listPaged(this.tenant.get().tenantId, parsePageParams(limit, offset), projectId);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<CommissioningRecord> {
    const found = await this.service.get(id, this.tenant.get().tenantId);
    if (!found) throw new NotFoundException(`commissioning record ${id} not found`);
    return found;
  }

  @Put(':id/test')
  recordTest(@Param('id') id: string, @Body() dto: TestDto): Promise<CommissioningRecord> {
    if (dto?.pointsPassed == null) throw new BadRequestException('pointsPassed is required');
    return this.service.recordTest(id, this.tenant.get().tenantId, {
      pointsPassed: dto.pointsPassed,
      pointsTotal: dto.pointsTotal,
      testDate: dto.testDate ?? null,
      remarks: dto.remarks ?? null,
    });
  }

  @Put(':id/commission')
  commission(@Param('id') id: string, @Body() dto: CommissionDto): Promise<CommissioningRecord> {
    if (!dto?.commissionedBy?.trim() || !dto?.witnessedBy?.trim()) {
      throw new BadRequestException('commissionedBy and witnessedBy are required');
    }
    return this.service.commission(id, this.tenant.get().tenantId, {
      commissionedBy: dto.commissionedBy,
      witnessedBy: dto.witnessedBy,
    });
  }

  @Put(':id/fail')
  fail(@Param('id') id: string, @Body() dto: FailDto): Promise<CommissioningRecord> {
    if (!dto?.reason?.trim()) throw new BadRequestException('reason is required');
    return this.service.fail(id, this.tenant.get().tenantId, dto.reason);
  }

  /** The commissioning 360: the record with its test sheet + punch list. */
  @Get(':id/detail')
  async detail(@Param('id') id: string) {
    const found = await this.service.getDetail(id, this.tenant.get().tenantId);
    if (!found) throw new NotFoundException(`commissioning record ${id} not found`);
    return found;
  }

  // ── Test sheet ───────────────────────────────────────────────────────────────

  @Get(':id/test-items')
  listTestItems(@Param('id') id: string): Promise<CommissioningTestItem[]> {
    return this.service.listTestItems(id, this.tenant.get().tenantId);
  }

  @Post(':id/test-items')
  addTestItem(@Param('id') id: string, @Body() dto: TestItemDto): Promise<CommissioningTestItem> {
    if (!dto?.pointNo?.trim()) throw new BadRequestException('pointNo is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    return this.service.addTestItem(id, this.tenant.get().tenantId, { pointNo: dto.pointNo, description: dto.description, expected: dto.expected ?? null });
  }

  @Put(':id/test-items/:itemId/result')
  recordResult(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: TestResultDto): Promise<CommissioningTestItem> {
    if (dto?.result !== 'pass' && dto?.result !== 'fail') throw new BadRequestException('result must be pass or fail');
    const ctx = this.tenant.get();
    return this.service.recordTestResult(id, itemId, ctx.tenantId, { result: dto.result, actual: dto.actual ?? null, remarks: dto.remarks ?? null, testedBy: ctx.actorId });
  }

  // ── Punch list ───────────────────────────────────────────────────────────────

  @Get(':id/punch')
  listPunch(@Param('id') id: string): Promise<PunchItem[]> {
    return this.service.listPunchItems(id, this.tenant.get().tenantId);
  }

  @Post(':id/punch')
  addPunch(@Param('id') id: string, @Body() dto: PunchDto): Promise<PunchItem> {
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    const ctx = this.tenant.get();
    return this.service.addPunchItem(id, ctx.tenantId, { description: dto.description, severity: dto.severity, location: dto.location ?? null, raisedBy: ctx.actorId });
  }

  @Put(':id/punch/:punchId/close')
  closePunch(@Param('id') id: string, @Param('punchId') punchId: string, @Body() dto: ClosePunchDto): Promise<PunchItem> {
    if (!dto?.resolution?.trim()) throw new BadRequestException('resolution is required');
    const ctx = this.tenant.get();
    return this.service.closePunchItem(id, punchId, ctx.tenantId, { resolution: dto.resolution, closedBy: ctx.actorId });
  }
}
