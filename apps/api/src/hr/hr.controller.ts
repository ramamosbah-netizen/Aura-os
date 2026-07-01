import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type Employee,
  type Leave,
  type PayrollRun,
  type TimesheetEntry,
  type ExpenseClaim,
  type StaffAdvance,
  type DocumentExpiryReport,
  type EosbResult,
  type TerminationType,
  type AttendanceRecord,
  type AttendanceSummary,
  type AttendanceStatus,
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
  iban?: string | null;
  molEmployeeId?: string | null;
  bankRoutingCode?: string | null;
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
      iban: dto.iban,
      molEmployeeId: dto.molEmployeeId,
      bankRoutingCode: dto.bankRoutingCode,
    });
  }

  @Post('wps')
  async generateWps(@Body() dto: { periodStart: string; periodEnd: string; establishmentId: string; bankCode: string }): Promise<import('@aura/hr').SifResult> {
    if (!dto?.periodStart || !dto?.periodEnd) throw new BadRequestException('periodStart and periodEnd are required');
    if (!dto?.establishmentId?.trim() || !dto?.bankCode?.trim()) throw new BadRequestException('establishmentId and bankCode are required');
    try {
      return await this.hrService.generateWps(this.tenant.get().tenantId, dto);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
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

  @Get('document-expiry')
  documentExpiry(@Query('withinDays') withinDays?: string, @Query('asOf') asOf?: string): Promise<DocumentExpiryReport> {
    const days = withinDays ? Number(withinDays) : 90;
    return this.hrService.documentExpiry(this.tenant.get().tenantId, Number.isFinite(days) ? days : 90, asOf);
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

  // ── Attendance ───────────────────────────────────────────────────────────

  @Post('attendance')
  async recordAttendance(@Body() dto: { employeeId: string; employeeName?: string; date: string; checkIn?: string; checkOut?: string; status?: AttendanceStatus; notes?: string }): Promise<AttendanceRecord> {
    if (!dto?.employeeId || !dto?.date) throw new BadRequestException('employeeId and date required');
    const ctx = this.tenant.get();
    try {
      return await this.hrService.recordAttendance({ tenantId: ctx.tenantId, companyId: ctx.companyId, createdBy: ctx.actorId, ...dto });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('attendance')
  listAttendance(@Query('employeeId') employeeId?: string): Promise<AttendanceRecord[]> {
    return this.hrService.listAttendance(this.tenant.get().tenantId, employeeId);
  }

  @Get('attendance/summary')
  async attendanceSummary(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employeeId') employeeId?: string,
  ): Promise<AttendanceSummary> {
    if (!from || !to) throw new BadRequestException('from and to (YYYY-MM-DD) are required');
    return this.hrService.attendanceSummary(this.tenant.get().tenantId, from, to, employeeId);
  }

  @Put('attendance/:id/checkout')
  async checkOutAttendance(@Param('id') id: string, @Body() dto: { checkOut: string }): Promise<AttendanceRecord> {
    if (!dto?.checkOut) throw new BadRequestException('checkOut (HH:MM) is required');
    try {
      return await this.hrService.checkOutAttendance(this.tenant.get().tenantId, id, dto.checkOut);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ── Expense Claims ───────────────────────────────────────────────────────

  @Post('expense-claims')
  async createExpenseClaim(@Body() dto: { employeeId: string; projectId?: string; category: ExpenseClaim['category']; amount: number; expenseDate: string; description?: string }): Promise<ExpenseClaim> {
    if (!dto?.employeeId) throw new BadRequestException('employeeId is required');
    if (!dto?.expenseDate) throw new BadRequestException('expenseDate is required');
    const ctx = this.tenant.get();
    try {
      return await this.hrService.createExpenseClaim({ tenantId: ctx.tenantId, ...dto, amount: Number(dto.amount) });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('expense-claims')
  listExpenseClaims(): Promise<ExpenseClaim[]> {
    return this.hrService.listExpenseClaims(this.tenant.get().tenantId);
  }

  @Post('expense-claims/:id/submit')
  async submitExpenseClaim(@Param('id') id: string): Promise<ExpenseClaim> {
    try {
      return await this.hrService.submitExpenseClaim(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('expense-claims/:id/approve')
  async approveExpenseClaim(@Param('id') id: string): Promise<ExpenseClaim> {
    const ctx = this.tenant.get();
    // approved_by is a uuid column; fall back to the nil-uuid system actor when unauthenticated (dev)
    const approverId = ctx.actorId ?? '00000000-0000-0000-0000-000000000000';
    try {
      return await this.hrService.approveExpenseClaim(ctx.tenantId, id, approverId);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('expense-claims/:id/reject')
  async rejectExpenseClaim(@Param('id') id: string): Promise<ExpenseClaim> {
    try {
      return await this.hrService.rejectExpenseClaim(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('expense-claims/:id/reimburse')
  async reimburseExpenseClaim(@Param('id') id: string, @Body() dto: { reimbursedDate?: string }): Promise<ExpenseClaim> {
    try {
      return await this.hrService.reimburseExpenseClaim(this.tenant.get().tenantId, id, dto?.reimbursedDate);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ── Staff Advances / Loans ────────────────────────────────────────────────

  @Post('staff-advances')
  async createStaffAdvance(@Body() dto: { employeeId: string; amount: number; reason?: string; installments?: number; requestDate: string }): Promise<StaffAdvance> {
    if (!dto?.employeeId) throw new BadRequestException('employeeId is required');
    if (!dto?.requestDate) throw new BadRequestException('requestDate is required');
    const ctx = this.tenant.get();
    try {
      return await this.hrService.createStaffAdvance({ tenantId: ctx.tenantId, ...dto, amount: Number(dto.amount) });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('staff-advances')
  listStaffAdvances(): Promise<StaffAdvance[]> {
    return this.hrService.listStaffAdvances(this.tenant.get().tenantId);
  }

  @Post('staff-advances/:id/approve')
  async approveStaffAdvance(@Param('id') id: string): Promise<StaffAdvance> {
    const ctx = this.tenant.get();
    const approverId = ctx.actorId ?? '00000000-0000-0000-0000-000000000000';
    try {
      return await this.hrService.approveStaffAdvance(ctx.tenantId, id, approverId);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('staff-advances/:id/reject')
  async rejectStaffAdvance(@Param('id') id: string): Promise<StaffAdvance> {
    try {
      return await this.hrService.rejectStaffAdvance(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('staff-advances/:id/disburse')
  async disburseStaffAdvance(@Param('id') id: string, @Body() dto: { disbursedDate?: string }): Promise<StaffAdvance> {
    try {
      return await this.hrService.disburseStaffAdvance(this.tenant.get().tenantId, id, dto?.disbursedDate);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('staff-advances/:id/repay')
  async repayStaffAdvance(@Param('id') id: string, @Body() dto: { amount: number }): Promise<StaffAdvance> {
    if (!(Number(dto?.amount) > 0)) throw new BadRequestException('amount must be positive');
    try {
      return await this.hrService.repayStaffAdvance(this.tenant.get().tenantId, id, Number(dto.amount));
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
