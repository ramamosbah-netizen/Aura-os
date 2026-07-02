import { BadRequestException, Body, Controller, Get, Param, Post, Query, Logger } from '@nestjs/common';
import { AmcService, SupportTicket, type PpmFrequency } from '@aura/amc';
import { TenantContext } from '@aura/core';

/**
 * AmcController — REST API endpoints for the AMC & Service Module.
 *
 * Exposes endpoints for:
 *   • Service Contracts
 *   • Support Tickets & SLA status checks
 *   • Work Orders & GIS Coordinates mapping
 *
 * Blueprint Reference: Phase 8 — Week 3-4, Task M1 (AMC Service Backend Integration)
 */
@Controller('amc')
export class AmcController {
  private readonly logger = new Logger('AmcController');

  constructor(
    private readonly service: AmcService,
    private readonly tenant: TenantContext,
  ) {}

  private tenantId(): string {
    return this.tenant.get().tenantId ?? 'default';
  }

  // ─── Service Contracts ────────────────────────────────────────────────────

  @Post('contracts')
  async createContract(@Body() body: any) {
    const tenantId = body.tenantId || this.tenantId();
    this.logger.log(`Creating AMC contract for client "${body.clientName}" in tenant ${tenantId}`);
    return this.service.createContract({
      ...body,
      tenantId,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    });
  }

  @Get('contracts')
  async listContracts(@Query('tenantId') tenantId?: string) {
    return this.service.listContracts(tenantId || this.tenantId());
  }

  @Get('contracts/:id')
  async getContract(@Param('id') id: string) {
    return this.service.findContract(id);
  }

  @Post('contracts/:id/terminate')
  async terminateContract(@Param('id') id: string) {
    return this.service.terminateContract(id);
  }

  // ─── Support Tickets ──────────────────────────────────────────────────────

  @Post('tickets')
  async raiseTicket(@Body() body: any) {
    const tenantId = body.tenantId || this.tenantId();
    this.logger.log(`Raising support ticket "${body.title}" in tenant ${tenantId}`);
    return this.service.raiseTicket({
      ...body,
      tenantId,
    });
  }

  @Get('tickets')
  async listTickets(
    @Query('tenantId') tenantId?: string,
    @Query('contractId') contractId?: string,
  ) {
    const tickets = await this.service.listTickets(tenantId || this.tenantId(), contractId);
    // Add real-time SLA breach check to response payload
    return tickets.map((t: SupportTicket) => ({
      ...t,
      isSlaBreached: t.isSlaBreached(),
      timeRemainingMs: t.slaDueAt.getTime() - Date.now(),
    }));
  }

  // literal routes before :id
  @Get('tickets/sla-status')
  async slaStatus(@Query('tenantId') tenantId?: string) {
    const report = await this.service.slaStatusReport(tenantId || this.tenantId());
    return report.map((r) => ({
      id: r.ticket.id,
      ticketNumber: r.ticket.ticketNumber,
      title: r.ticket.title,
      priority: r.ticket.priority,
      status: r.ticket.status,
      slaStatus: r.slaStatus,
      hoursRemaining: r.hoursRemaining,
      escalationLevel: r.ticket.escalationLevel,
      slaDueAt: r.ticket.slaDueAt.toISOString(),
    }));
  }

  @Post('tickets/sla-sweep')
  async slaSweep(@Body('tenantId') tenantId?: string) {
    const escalated = await this.service.sweepSlaBreaches(tenantId || this.tenantId());
    return { escalated: escalated.length, tickets: escalated.map((t) => ({ id: t.id, ticketNumber: t.ticketNumber, escalationLevel: t.escalationLevel })) };
  }

  @Get('tickets/:id')
  async getTicket(@Param('id') id: string) {
    const ticket = await this.service.findTicket(id);
    if (!ticket) return null;
    return {
      ...ticket,
      isSlaBreached: ticket.isSlaBreached(),
      timeRemainingMs: ticket.slaDueAt.getTime() - Date.now(),
    };
  }

  @Post('tickets/:id/assign')
  async assignTicket(@Param('id') id: string, @Body('technicianId') technicianId: string) {
    return this.service.assignTicket(id, technicianId);
  }

  @Post('tickets/:id/resolve')
  async resolveTicket(@Param('id') id: string) {
    return this.service.resolveTicket(id);
  }

  // ─── Work Orders & GIS Dispatch ───────────────────────────────────────────

  @Post('work-orders')
  async createWorkOrder(@Body() body: any) {
    const tenantId = body.tenantId || this.tenantId();
    this.logger.log(`Creating work order "${body.orderNumber}" in tenant ${tenantId}`);
    return this.service.createWorkOrder({
      ...body,
      tenantId,
      scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : undefined,
    });
  }

  @Get('work-orders')
  async listWorkOrders(
    @Query('tenantId') tenantId?: string,
    @Query('contractId') contractId?: string,
  ) {
    return this.service.listWorkOrders(tenantId || this.tenantId(), contractId);
  }

  @Get('dispatch-board')
  async getDispatchBoard(
    @Query('tenantId') tenantId?: string,
    @Query('minLat') minLat?: string,
    @Query('maxLat') maxLat?: string,
    @Query('minLng') minLng?: string,
    @Query('maxLng') maxLng?: string,
  ) {
    const tid = tenantId || this.tenantId();
    if (minLat && maxLat && minLng && maxLng) {
      return this.service.getDispatchBoard(tid, {
        minLat: Number(minLat),
        maxLat: Number(maxLat),
        minLng: Number(minLng),
        maxLng: Number(maxLng),
      });
    }
    return this.service.getDispatchBoard(tid);
  }

  @Post('work-orders/:id/assign')
  async assignWorkOrder(@Param('id') id: string, @Body('technicianId') technicianId: string) {
    return this.service.assignWorkOrder(id, technicianId);
  }

  @Post('work-orders/:id/complete')
  async completeWorkOrder(@Param('id') id: string, @Body('cost') cost?: number) {
    return this.service.completeWorkOrder(id, cost !== undefined ? Number(cost) : undefined);
  }

  // ─── PPM Schedules (preventive maintenance) ───────────────────────────────

  @Post('ppm-schedules')
  async createPpm(@Body() body: { contractId: string; assetId?: string; taskDescription: string; frequency: PpmFrequency; startDate?: string }) {
    try {
      return await this.service.createPpmSchedule({
        tenantId: this.tenantId(),
        contractId: body.contractId,
        assetId: body.assetId,
        taskDescription: body.taskDescription,
        frequency: body.frequency,
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('ppm-schedules')
  async listPpms(@Query('tenantId') tenantId?: string, @Query('contractId') contractId?: string) {
    return this.service.listPpmSchedules(tenantId || this.tenantId(), contractId);
  }

  @Post('ppm-schedules/:id/deactivate')
  async deactivatePpm(@Param('id') id: string) {
    return this.service.deactivatePpmSchedule(id);
  }

  @Post('ppm-schedules/generate-due')
  async generateDue(@Body() body: { asOf?: string }) {
    return this.service.generateDueVisits(this.tenantId(), body?.asOf ? new Date(body.asOf) : new Date());
  }
}
