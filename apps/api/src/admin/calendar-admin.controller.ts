import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { type CalendarAdjustment, type CalendarDefinition, type CalendarHoliday, CalendarService, Permissions, TenantContext } from '@aura/core';

/**
 * Business calendar admin (Admin Center phase 2, Vol 15 §2.1). The kernel
 * CalendarService drives working-day math (HR timesheets, project scheduling);
 * this surface manages calendars, weekends, public holidays, and operational
 * adjustments (e.g. Ramadan hours). Guarded by `admin.calendar.manage`.
 */
@Controller('admin/calendar')
export class CalendarAdminController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly tenant: TenantContext,
  ) {}

  @Permissions('admin.calendar.manage')
  @Get()
  list(): Promise<CalendarDefinition[]> {
    return this.calendar.listCalendars(this.tenant.get().tenantId);
  }

  @Permissions('admin.calendar.manage')
  @Post()
  save(
    @Body() dto: { id?: string; name?: string; companyId?: string | null; weekends?: number[]; standardHoursPerDay?: number },
  ): Promise<CalendarDefinition> {
    const name = dto?.name?.trim();
    if (!name) throw new BadRequestException('name is required');
    const weekends = Array.isArray(dto.weekends) ? dto.weekends.map(Number).filter((d) => d >= 0 && d <= 6) : [0, 6];
    return this.calendar.saveCalendar({
      id: dto.id?.trim() || undefined,
      tenantId: this.tenant.get().tenantId,
      companyId: dto.companyId ?? null,
      name,
      weekends,
      standardHoursPerDay: Number(dto.standardHoursPerDay) || 8,
    });
  }

  @Permissions('admin.calendar.manage')
  @Delete()
  async remove(@Query('id') id?: string): Promise<{ removed: boolean }> {
    if (!id?.trim()) throw new BadRequestException('id is required');
    return { removed: await this.calendar.deleteCalendar(this.tenant.get().tenantId, id.trim()) };
  }

  @Permissions('admin.calendar.manage')
  @Get(':id/holidays')
  holidays(@Param('id') id: string): Promise<CalendarHoliday[]> {
    return this.calendar.listHolidays(id);
  }

  @Permissions('admin.calendar.manage')
  @Post(':id/holidays')
  async addHoliday(
    @Param('id') id: string,
    @Body() dto: { date?: string; description?: string },
  ): Promise<{ ok: true }> {
    if (!dto?.date?.trim()) throw new BadRequestException('date is required (YYYY-MM-DD)');
    await this.calendar.addHoliday(id, dto.date.trim(), dto.description?.trim() || null);
    return { ok: true };
  }

  @Permissions('admin.calendar.manage')
  @Delete(':id/holidays')
  async removeHoliday(@Param('id') id: string, @Query('date') date?: string): Promise<{ removed: boolean }> {
    if (!date?.trim()) throw new BadRequestException('date is required');
    return { removed: await this.calendar.removeHoliday(id, date.trim()) };
  }

  @Permissions('admin.calendar.manage')
  @Get(':id/adjustments')
  adjustments(@Param('id') id: string): Promise<Array<CalendarAdjustment & { id: string }>> {
    return this.calendar.listAdjustments(id);
  }

  @Permissions('admin.calendar.manage')
  @Post(':id/adjustments')
  addAdjustment(
    @Param('id') id: string,
    @Body() dto: { startDate?: string; endDate?: string; workingHoursPerDay?: number; description?: string },
  ): Promise<{ id: string }> {
    if (!dto?.startDate?.trim() || !dto?.endDate?.trim()) throw new BadRequestException('startDate and endDate are required');
    const hours = Number(dto.workingHoursPerDay);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) throw new BadRequestException('workingHoursPerDay must be 0–24');
    return this.calendar.addAdjustment(id, {
      startDate: dto.startDate.trim(),
      endDate: dto.endDate.trim(),
      workingHoursPerDay: hours,
      description: dto.description?.trim() || null,
    });
  }

  @Permissions('admin.calendar.manage')
  @Delete(':id/adjustments')
  async removeAdjustment(@Param('id') id: string, @Query('adjustmentId') adjustmentId?: string): Promise<{ removed: boolean }> {
    if (!adjustmentId?.trim()) throw new BadRequestException('adjustmentId is required');
    return { removed: await this.calendar.removeAdjustment(id, adjustmentId.trim()) };
  }
}
