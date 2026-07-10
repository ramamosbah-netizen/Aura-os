import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { FormCustomValuesService, FormOverridesService, TenantContext } from '@aura/core';
import { applyFormOverrides, parsePageParams, assertFormValid, employeeFormSchema, pickCustomFieldValues } from '@aura/shared';
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
  type PerformanceAppraisal,
  type AppraisalCriterion,
  type OrgChartNode,
  HrService,
  calculateEosb,
} from '@aura/hr';

class CreateEmployeeDto {
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsString() role!: string;
  @IsString() department!: string;
  @IsOptional() @IsString() managerId?: string | null;
  @IsString() joinedDate!: string;
  @IsOptional() @IsString() visaExpiry?: string | null;
  @IsOptional() @IsString() permitExpiry?: string | null;
  @IsOptional() @IsString() laborCamp?: string | null;
  @IsOptional() @IsString() iban?: string | null;
  @IsOptional() @IsString() molEmployeeId?: string | null;
  @IsOptional() @IsString() bankRoutingCode?: string | null;
}

class RequestLeaveDto {
  @IsString() employeeId!: string;
  @IsString() leaveType!: string;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsString() reason?: string | null;
}

class ResolveLeaveDto {
  @IsIn(['approved', 'rejected']) status!: 'approved' | 'rejected';
}

class RunPayrollDto {
  @IsString() employeeId!: string;
  @IsString() periodStart!: string;
  @IsString() periodEnd!: string;
  @IsNumber() basicSalary!: number;
  @IsNumber() allowances!: number;
  @IsNumber() deductions!: number;
}

@Controller('hr')
export class HrController {
  constructor(
    private readonly hrService: HrService,
    private readonly tenant: TenantContext,
    private readonly formOverrides: FormOverridesService,
    private readonly customValues: FormCustomValuesService,
  ) {}

  // ── Employees ──────────────────────────────────────────────────────────────

  @Post('employees')
  async createEmployee(@Body() dto: CreateEmployeeDto, @Req() req: { body?: Record<string, unknown> }): Promise<Employee> {
    const body = req.body;
    if (!dto?.firstName?.trim()) throw new BadRequestException('firstName is required');
    if (!dto?.lastName?.trim()) throw new BadRequestException('lastName is required');
    if (!dto?.role?.trim()) throw new BadRequestException('role is required');
    if (!dto?.department?.trim()) throw new BadRequestException('department is required');
    if (!dto?.joinedDate?.trim()) throw new BadRequestException('joinedDate is required');

    // Enforce the shared metadata schema server-side (email/phone format, the
    // camp→visa-tracking rule) so the same rules the renderer shows can't be
    // bypassed by calling the endpoint directly.
    // Form Designer overrides (Vol 15 �2.4) merge over the code schema before enforcement.
    // Validate the RAW body: the global pipe strips unknown keys from the decorated
    // DTO, but designer-added cf_* fields (Form Designer P2) live only in the body.
    const merged = applyFormOverrides(employeeFormSchema, await this.formOverrides.get(this.tenant.get().tenantId, employeeFormSchema.id));
    assertFormValid(merged, (body ?? dto) as Record<string, unknown>);

    const ctx = this.tenant.get();
    const employee = await this.hrService.createEmployee(ctx.actorId, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      role: dto.role,
      department: dto.department,
      managerId: dto.managerId ?? null,
      joinedDate: dto.joinedDate,
      visaExpiry: dto.visaExpiry,
      permitExpiry: dto.permitExpiry,
      laborCamp: dto.laborCamp,
      iban: dto.iban,
      molEmployeeId: dto.molEmployeeId,
      bankRoutingCode: dto.bankRoutingCode,
    });
    // Capture designer-added field values per record (Form Designer P2).
    await this.customValues.save(ctx.tenantId, merged.id, employee.id, pickCustomFieldValues(merged, body));
    return employee;
  }

  @Post('wps')
  async generateWps(@Body() dto: { periodStart: string; periodEnd: string; establishmentId: string; bankCode: string }): Promise<import('@aura/hr').SifResult> {
    if (!dto?.periodStart || !dto?.periodEnd) throw new BadRequestException('periodStart and periodEnd are required');
    if (!dto?.establishmentId?.trim() || !dto?.bankCode?.trim()) throw new BadRequestException('establishmentId and bankCode are required');
    return await this.hrService.generateWps(this.tenant.get().tenantId, dto);
  }

  @Delete('employees/:id')
  async deleteEmployee(@Param('id') id: string): Promise<{ success: boolean }> {
    const ctx = this.tenant.get();
    const success = await this.hrService.deleteEmployee(ctx.tenantId, ctx.actorId, id);
    return { success };
  }

  @Post('employees/:id/restore')
  restoreEmployee(@Param('id') id: string): Promise<Employee> {
    // "employee profile not found" is classified to 404 by the global error taxonomy.
    return this.hrService.restoreEmployee(this.tenant.get().tenantId, id);
  }

  @Get('employees')
  listEmployees(): Promise<Employee[]> {
    const ctx = this.tenant.get();
    return this.hrService.listEmployees(ctx.tenantId);
  }

  @Get('employees/paged')
  listEmployeesPaged(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.hrService.listEmployeesPaged({ tenantId: this.tenant.get().tenantId }, parsePageParams(limit, offset));
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

  @Get('leaves/paged')
  listLeavesPaged(@Query('employeeId') employeeId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.hrService.listLeavesPaged({ tenantId: this.tenant.get().tenantId, employeeId }, parsePageParams(limit, offset));
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

  @Get('leave-balance/:employeeId')
  leaveBalance(
    @Param('employeeId') employeeId: string,
    @Query('asOf') asOf?: string,
    @Query('annualDays') annualDays?: string,
  ): Promise<import('@aura/hr').LeaveBalance> {
    return this.hrService.leaveBalance(this.tenant.get().tenantId, employeeId, asOf, annualDays ? Number(annualDays) : undefined);
  }

  @Get('payroll')
  listPayrollRuns(): Promise<PayrollRun[]> {
    const ctx = this.tenant.get();
    return this.hrService.listPayrollRuns(ctx.tenantId);
  }

  @Get('payroll/paged')
  listPayrollRunsPaged(@Query('employeeId') employeeId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.hrService.listPayrollRunsPaged({ tenantId: this.tenant.get().tenantId, employeeId }, parsePageParams(limit, offset));
  }

  @Get('payroll/:id')
  async getPayrollRun(@Param('id') id: string): Promise<PayrollRun> {
    const run = await this.hrService.getPayrollRun(this.tenant.get().tenantId, id);
    if (!run) throw new NotFoundException(`payroll run ${id} not found`);
    return run;
  }

  // ── End-of-Service Benefit (gratuity) — stateless UAE calculator ──────────
  @Post('eosb')
  calcEosb(
    @Body() dto: { basicSalary: number; joinedDate: string; lastWorkingDay: string; terminationType: TerminationType },
  ): EosbResult {
    if (!(Number(dto?.basicSalary) > 0)) throw new BadRequestException('basicSalary must be positive');
    if (!dto?.joinedDate || !dto?.lastWorkingDay) throw new BadRequestException('joinedDate and lastWorkingDay are required');
    return calculateEosb({
      basicSalary: Number(dto.basicSalary),
      joinedDate: dto.joinedDate,
      lastWorkingDay: dto.lastWorkingDay,
      terminationType: dto.terminationType === 'resignation' ? 'resignation' : 'termination',
    });
  }

  // ── Timesheets ─────────────────────────────────────────────────────────────

  @Post('timesheets')
  async createTimesheet(@Body() dto: { employeeId: string; projectId?: string; wbsNodeId?: string; date: string; hours: number; overtime?: number; description?: string }): Promise<TimesheetEntry> {
    if (!dto?.employeeId || !dto?.date) throw new BadRequestException('employeeId and date required');
    const ctx = this.tenant.get();
    return await this.hrService.createTimesheetEntry({ tenantId: ctx.tenantId, ...dto });
  }

  @Get('timesheets')
  listTimesheets(): Promise<TimesheetEntry[]> {
    return this.hrService.listTimesheets(this.tenant.get().tenantId);
  }

  @Get('timesheets/paged')
  listTimesheetsPaged(@Query('employeeId') employeeId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.hrService.listTimesheetsPaged({ tenantId: this.tenant.get().tenantId, employeeId }, parsePageParams(limit, offset));
  }

  @Post('timesheets/:id/submit')
  async submitTimesheet(@Param('id') id: string): Promise<TimesheetEntry> {
    return await this.hrService.submitTimesheetEntry(this.tenant.get().tenantId, id);
  }

  @Post('timesheets/:id/approve')
  async approveTimesheet(@Param('id') id: string): Promise<TimesheetEntry> {
    const ctx = this.tenant.get();
    return await this.hrService.approveTimesheetEntry(ctx.tenantId, id, ctx.actorId ?? 'system');
  }

  @Post('timesheets/:id/reject')
  async rejectTimesheet(@Param('id') id: string): Promise<TimesheetEntry> {
    return await this.hrService.rejectTimesheetEntry(this.tenant.get().tenantId, id);
  }

  // ── Attendance ───────────────────────────────────────────────────────────

  @Post('attendance')
  async recordAttendance(@Body() dto: { employeeId: string; employeeName?: string; date: string; checkIn?: string; checkOut?: string; status?: AttendanceStatus; notes?: string }): Promise<AttendanceRecord> {
    if (!dto?.employeeId || !dto?.date) throw new BadRequestException('employeeId and date required');
    const ctx = this.tenant.get();
    return await this.hrService.recordAttendance({ tenantId: ctx.tenantId, companyId: ctx.companyId, createdBy: ctx.actorId, ...dto });
  }

  @Get('attendance')
  listAttendance(@Query('employeeId') employeeId?: string): Promise<AttendanceRecord[]> {
    return this.hrService.listAttendance(this.tenant.get().tenantId, employeeId);
  }

  @Get('attendance/paged')
  listAttendancePaged(@Query('employeeId') employeeId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.hrService.listAttendancePaged({ tenantId: this.tenant.get().tenantId, employeeId }, parsePageParams(limit, offset));
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
    return await this.hrService.checkOutAttendance(this.tenant.get().tenantId, id, dto.checkOut);
  }

  // ── Expense Claims ───────────────────────────────────────────────────────

  @Post('expense-claims')
  async createExpenseClaim(@Body() dto: { employeeId: string; projectId?: string; category: ExpenseClaim['category']; amount: number; expenseDate: string; description?: string }): Promise<ExpenseClaim> {
    if (!dto?.employeeId) throw new BadRequestException('employeeId is required');
    if (!dto?.expenseDate) throw new BadRequestException('expenseDate is required');
    const ctx = this.tenant.get();
    return await this.hrService.createExpenseClaim({ tenantId: ctx.tenantId, ...dto, amount: Number(dto.amount) });
  }

  @Get('expense-claims')
  listExpenseClaims(): Promise<ExpenseClaim[]> {
    return this.hrService.listExpenseClaims(this.tenant.get().tenantId);
  }

  @Get('expense-claims/paged')
  listExpenseClaimsPaged(@Query('employeeId') employeeId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.hrService.listExpenseClaimsPaged({ tenantId: this.tenant.get().tenantId, employeeId }, parsePageParams(limit, offset));
  }

  @Post('expense-claims/:id/submit')
  async submitExpenseClaim(@Param('id') id: string): Promise<ExpenseClaim> {
    return await this.hrService.submitExpenseClaim(this.tenant.get().tenantId, id);
  }

  @Post('expense-claims/:id/approve')
  async approveExpenseClaim(@Param('id') id: string): Promise<ExpenseClaim> {
    const ctx = this.tenant.get();
    // approved_by is a uuid column; fall back to the nil-uuid system actor when unauthenticated (dev)
    const approverId = ctx.actorId ?? '00000000-0000-0000-0000-000000000000';
    return await this.hrService.approveExpenseClaim(ctx.tenantId, id, approverId);
  }

  @Post('expense-claims/:id/reject')
  async rejectExpenseClaim(@Param('id') id: string): Promise<ExpenseClaim> {
    return await this.hrService.rejectExpenseClaim(this.tenant.get().tenantId, id);
  }

  @Post('expense-claims/:id/reimburse')
  async reimburseExpenseClaim(@Param('id') id: string, @Body() dto: { reimbursedDate?: string }): Promise<ExpenseClaim> {
    return await this.hrService.reimburseExpenseClaim(this.tenant.get().tenantId, id, dto?.reimbursedDate);
  }

  // ── Staff Advances / Loans ────────────────────────────────────────────────

  @Post('staff-advances')
  async createStaffAdvance(@Body() dto: { employeeId: string; amount: number; reason?: string; installments?: number; requestDate: string }): Promise<StaffAdvance> {
    if (!dto?.employeeId) throw new BadRequestException('employeeId is required');
    if (!dto?.requestDate) throw new BadRequestException('requestDate is required');
    const ctx = this.tenant.get();
    return await this.hrService.createStaffAdvance({ tenantId: ctx.tenantId, ...dto, amount: Number(dto.amount) });
  }

  @Get('staff-advances')
  listStaffAdvances(): Promise<StaffAdvance[]> {
    return this.hrService.listStaffAdvances(this.tenant.get().tenantId);
  }

  @Get('staff-advances/paged')
  listStaffAdvancesPaged(@Query('employeeId') employeeId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.hrService.listStaffAdvancesPaged({ tenantId: this.tenant.get().tenantId, employeeId }, parsePageParams(limit, offset));
  }

  @Post('staff-advances/:id/approve')
  async approveStaffAdvance(@Param('id') id: string): Promise<StaffAdvance> {
    const ctx = this.tenant.get();
    const approverId = ctx.actorId ?? '00000000-0000-0000-0000-000000000000';
    return await this.hrService.approveStaffAdvance(ctx.tenantId, id, approverId);
  }

  @Post('staff-advances/:id/reject')
  async rejectStaffAdvance(@Param('id') id: string): Promise<StaffAdvance> {
    return await this.hrService.rejectStaffAdvance(this.tenant.get().tenantId, id);
  }

  @Post('staff-advances/:id/disburse')
  async disburseStaffAdvance(@Param('id') id: string, @Body() dto: { disbursedDate?: string }): Promise<StaffAdvance> {
    return await this.hrService.disburseStaffAdvance(this.tenant.get().tenantId, id, dto?.disbursedDate);
  }

  @Post('staff-advances/:id/repay')
  async repayStaffAdvance(@Param('id') id: string, @Body() dto: { amount: number }): Promise<StaffAdvance> {
    if (!(Number(dto?.amount) > 0)) throw new BadRequestException('amount must be positive');
    return await this.hrService.repayStaffAdvance(this.tenant.get().tenantId, id, Number(dto.amount));
  }

  // ── Performance appraisals ──────────────────────────────────────────────────

  @Post('appraisals')
  createAppraisal(
    @Body() dto: { employeeId: string; employeeName?: string; period: string; reviewerId?: string; criteria: AppraisalCriterion[]; strengths?: string; improvements?: string; comments?: string },
  ): Promise<PerformanceAppraisal> {
    if (!dto?.employeeId) throw new BadRequestException('employeeId is required');
    if (!dto?.period?.trim()) throw new BadRequestException('period is required');
    if (!Array.isArray(dto?.criteria) || dto.criteria.length === 0) throw new BadRequestException('at least one criterion is required');
    const ctx = this.tenant.get();
    return this.hrService.createAppraisal({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      employeeId: dto.employeeId,
      employeeName: dto.employeeName ?? null,
      period: dto.period,
      reviewerId: dto.reviewerId ?? ctx.actorId,
      criteria: dto.criteria,
      strengths: dto.strengths ?? null,
      improvements: dto.improvements ?? null,
      comments: dto.comments ?? null,
      createdBy: ctx.actorId,
    });
  }

  @Get('appraisals')
  listAppraisals(@Query('employeeId') employeeId?: string): Promise<PerformanceAppraisal[]> {
    return this.hrService.listAppraisals(this.tenant.get().tenantId, employeeId);
  }

  @Get('appraisals/paged')
  listAppraisalsPaged(@Query('employeeId') employeeId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.hrService.listAppraisalsPaged({ tenantId: this.tenant.get().tenantId, employeeId }, parsePageParams(limit, offset));
  }

  @Put('appraisals/:id/submit')
  async submitAppraisal(@Param('id') id: string): Promise<PerformanceAppraisal> {
    return await this.hrService.submitAppraisal(this.tenant.get().tenantId, id);
  }

  @Put('appraisals/:id/acknowledge')
  async acknowledgeAppraisal(@Param('id') id: string): Promise<PerformanceAppraisal> {
    return await this.hrService.acknowledgeAppraisal(this.tenant.get().tenantId, id);
  }

  // ── Org chart ──────────────────────────────────────────────────────────────

  @Get('org-chart')
  orgChart(): Promise<OrgChartNode[]> {
    return this.hrService.orgChart(this.tenant.get().tenantId);
  }
}
