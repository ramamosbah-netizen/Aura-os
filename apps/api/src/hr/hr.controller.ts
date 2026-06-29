import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type Employee,
  type Leave,
  type PayrollRun,
  type TimesheetEntry,
  type EosbResult,
  type TerminationType,
  HrService,
  calculateEosb,
} from '@aura/hr';

interface CreateEmployeeDto {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  department: string;
  joinedDate: string;
  visaExpiry?: string | null;
  permitExpiry?: string | null;
  laborCamp?: string | null;
}

interface RequestLeaveDto {
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
}

interface ResolveLeaveDto {
  status: 'approved' | 'rejected';
}

interface RunPayrollDto {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
}

@Controller('hr')
export class HrController {
  constructor(
    private readonly hrService: HrService,
    private readonly tenant: TenantContext,
  ) {}

  // ── Employees ──────────────────────────────────────────────────────────────

  @Post('employees')
  createEmployee(@Body() dto: CreateEmployeeDto): Promise<Employee> {
    if (!dto?.firstName?.trim()) throw new BadRequestException('firstName is required');
    if (!dto?.lastName?.trim()) throw new BadRequestException('lastName is required');
    if (!dto?.role?.trim()) throw new BadRequestException('role is required');
    if (!dto?.department?.trim()) throw new BadRequestException('department is required');
    if (!dto?.joinedDate?.trim()) throw new BadRequestException('joinedDate is required');

    const ctx = this.tenant.get();
    return this.hrService.createEmployee(ctx.actorId, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      role: dto.role,
      department: dto.department,
      joinedDate: dto.joinedDate,
      visaExpiry: dto.visaExpiry,
      permitExpiry: dto.permitExpiry,
      laborCamp: dto.laborCamp,
    });
  }

  @Delete('employees/:id')
  async deleteEmployee(@Param('id') id: string): Promise<{ success: boolean }> {
    const ctx = this.tenant.get();
    const success = await this.hrService.deleteEmployee(ctx.tenantId, ctx.actorId, id);
    return { success };
  }

  @Get('employees')
  listEmployees(): Promise<Employee[]> {
    const ctx = this.tenant.get();
    return this.hrService.listEmployees(ctx.tenantId);
  }

  // ── Leaves ─────────────────────────────────────────────────────────────────

  @Post('leaves')
  requestLeave(@Body() dto: RequestLeaveDto): Promise<Leave> {
    if (!dto?.employeeId) throw new BadRequestException('employeeId is required');
    if (!dto?.leaveType?.trim()) throw new BadRequestException('leaveType is required');
    if (!dto?.startDate?.trim()) throw new BadRequestException('startDate is required');
    if (!dto?.endDate?.trim()) throw new BadRequestException('endDate is required');

    const ctx = this.tenant.get();
    return this.hrService.requestLeave(ctx.actorId, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      employeeId: dto.employeeId,
      leaveType: dto.leaveType,
      startDate: dto.startDate,
      endDate: dto.endDate,
      reason: dto.reason,
    });
  }

  @Put('leaves/:id/resolve')
  resolveLeave(
    @Param('id') id: string,
    @Body() dto: ResolveLeaveDto,
  ): Promise<Leave> {
    if (!dto?.status || !['approved', 'rejected'].includes(dto.status)) {
      throw new BadRequestException('status must be approved or rejected');
    }

    const ctx = this.tenant.get();
    return this.hrService.resolveLeave(ctx.tenantId, ctx.actorId, id, dto.status);
  }

  @Get('leaves')
  listLeaves(): Promise<Leave[]> {
    const ctx = this.tenant.get();
    return this.hrService.listLeaves(ctx.tenantId);
  }

  // ── Payroll Runs ────────────────────────────────────────────────────────────

  @Post('payroll')
  runPayroll(@Body() dto: RunPayrollDto): Promise<PayrollRun> {
    if (!dto?.employeeId) throw new BadRequestException('employeeId is required');
    if (!dto?.periodStart?.trim()) throw new BadRequestException('periodStart is required');
    if (!dto?.periodEnd?.trim()) throw new BadRequestException('periodEnd is required');
    if (dto.basicSalary === undefined || dto.basicSalary < 0) throw new BadRequestException('basicSalary must be >= 0');
    if (dto.allowances === undefined || dto.allowances < 0) throw new BadRequestException('allowances must be >= 0');
    if (dto.deductions === undefined || dto.deductions < 0) throw new BadRequestException('deductions must be >= 0');

    const ctx = this.tenant.get();
    return this.hrService.runPayroll(ctx.actorId, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      employeeId: dto.employeeId,
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
      basicSalary: dto.basicSalary,
      allowances: dto.allowances,
      deductions: dto.deductions,
    });
  }

  @Put('payroll/:id/pay')
  markPayrollPaid(@Param('id') id: string): Promise<PayrollRun> {
    const ctx = this.tenant.get();
    return this.hrService.markPayrollPaid(ctx.tenantId, ctx.actorId, id);
  }

  @Get('payroll')
  listPayrollRuns(): Promise<PayrollRun[]> {
    const ctx = this.tenant.get();
    return this.hrService.listPayrollRuns(ctx.tenantId);
  }

  // ── End-of-Service Benefit (gratuity) — stateless UAE calculator ──────────
  @Post('eosb')
  calcEosb(
    @Body() dto: { basicSalary: number; joinedDate: string; lastWorkingDay: string; terminationType: TerminationType },
  ): EosbResult {
    if (!(Number(dto?.basicSalary) > 0)) throw new BadRequestException('basicSalary must be positive');
    if (!dto?.joinedDate || !dto?.lastWorkingDay) throw new BadRequestException('joinedDate and lastWorkingDay are required');
    try {
      return calculateEosb({
        basicSalary: Number(dto.basicSalary),
        joinedDate: dto.joinedDate,
        lastWorkingDay: dto.lastWorkingDay,
        terminationType: dto.terminationType === 'resignation' ? 'resignation' : 'termination',
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ── Timesheets ─────────────────────────────────────────────────────────────

  @Post('timesheets')
  async createTimesheet(@Body() dto: { employeeId: string; projectId?: string; wbsNodeId?: string; date: string; hours: number; overtime?: number; description?: string }): Promise<TimesheetEntry> {
    if (!dto?.employeeId || !dto?.date) throw new BadRequestException('employeeId and date required');
    const ctx = this.tenant.get();
    try {
      return await this.hrService.createTimesheetEntry({ tenantId: ctx.tenantId, ...dto });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('timesheets')
  listTimesheets(): Promise<TimesheetEntry[]> {
    return this.hrService.listTimesheets(this.tenant.get().tenantId);
  }

  @Post('timesheets/:id/submit')
  async submitTimesheet(@Param('id') id: string): Promise<TimesheetEntry> {
    try {
      return await this.hrService.submitTimesheetEntry(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('timesheets/:id/approve')
  async approveTimesheet(@Param('id') id: string): Promise<TimesheetEntry> {
    const ctx = this.tenant.get();
    try {
      return await this.hrService.approveTimesheetEntry(ctx.tenantId, id, ctx.actorId ?? 'system');
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('timesheets/:id/reject')
  async rejectTimesheet(@Param('id') id: string): Promise<TimesheetEntry> {
    try {
      return await this.hrService.rejectTimesheetEntry(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
