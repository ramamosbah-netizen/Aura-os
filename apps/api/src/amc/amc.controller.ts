import { Body, Controller, Get, Param, Post, Query, Logger } from '@nestjs/common';
import { AmcService, SupportTicket } from '@aura/amc';
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
@Controller('v1/amc')
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
  async completeWorkOrder(@Param('id') id: string) {
    return this.service.completeWorkOrder(id);
  }
}
