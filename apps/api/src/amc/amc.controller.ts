import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, Logger, NotFoundException } from '@nestjs/common';
import { AmcService, SupportTicket, type PpmFrequency } from '@aura/amc';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';

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

  /**
   * THE TENANT COMES FROM THE SESSION, NEVER FROM THE REQUEST.
   *
   * Ten routes used to take `body.tenantId` or `?tenantId=` first and fall back to the session, and
   * the session to a literal 'default' — so any caller could read or write another tenant's service
   * contracts, tickets and work orders by naming it. A supplied tenant that is the caller's own is
   * tolerated; any other is refused, loudly, rather than quietly ignored, so a client that sends one
   * learns it was wrong. No tenant at all is a refusal, not a default.
   */
  private tenantId(supplied?: unknown): string {
    const own = this.tenant.get().tenantId;
    if (!own) throw new ForbiddenException('no tenant is bound to this request');
    if (supplied !== undefined && supplied !== null && supplied !== '' && supplied !== own) {
      throw new ForbiddenException('the tenant is taken from your session, never from the request');
    }
    return own;
  }

  // ─── Service Contracts ────────────────────────────────────────────────────

  @Post('contracts')
  async createContract(@Body() body: any) {
    const tenantId = this.tenantId(body?.tenantId);
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
    return this.service.listContracts(this.tenantId(tenantId));
  }

  @Get('contracts/:id')
  async getContract(@Param('id') id: string) {
    // Another tenant's contract is "not found" — indistinguishable from one that does not exist.
    const contract = await this.service.findContract(id);
    if (!contract) throw new NotFoundException(`service contract ${id} not found`);
    return contract;
  }

  @Post('contracts/:id/terminate')
  async terminateContract(@Param('id') id: string, @Body('reason') reason?: string) {
    const ctx = this.tenant.get();
    if (ctx.actorId && !reason?.trim()) throw new BadRequestException('a reason is required to terminate a service contract');
    return this.service.terminateContract(id, ctx.actorId, reason);
  }

  // ─── Support Tickets ──────────────────────────────────────────────────────

  @Post('tickets')
  async raiseTicket(@Body() body: any) {
    const tenantId = this.tenantId(body?.tenantId);
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
    const tickets = await this.service.listTickets(this.tenantId(tenantId), contractId);
    // Add real-time SLA breach check to response payload
    return tickets.map((t: SupportTicket) => ({
      ...t,
      isSlaBreached: t.isSlaBreached(),
      timeRemainingMs: t.slaDueAt.getTime() - Date.now(),
    }));
  }

  // literal routes before :id
  @Get('tickets/paged')
  async pagedTickets(
    @Query('contractId') contractId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const page = await this.service.listTicketsPaged(this.tenantId(), parsePageParams(limit, offset), contractId);
    return {
      ...page,
      items: page.items.map((t: SupportTicket) => ({
        ...t,
        isSlaBreached: t.isSlaBreached(),
        timeRemainingMs: t.slaDueAt.getTime() - Date.now(),
      })),
    };
  }

  @Get('tickets/sla-status')
  async slaStatus(@Query('tenantId') tenantId?: string) {
    const report = await this.service.slaStatusReport(this.tenantId(tenantId));
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
    const escalated = await this.service.sweepSlaBreaches(this.tenantId(tenantId));
    return { escalated: escalated.length, tickets: escalated.map((t) => ({ id: t.id, ticketNumber: t.ticketNumber, escalationLevel: t.escalationLevel })) };
  }

  @Get('tickets/:id')
  async getTicket(@Param('id') id: string) {
    const ticket = await this.service.findTicket(id);
    if (!ticket) throw new NotFoundException(`ticket ${id} not found`);
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
    return this.service.resolveTicket(id, this.tenant.get().actorId);
  }

  // ─── Work Orders & GIS Dispatch ───────────────────────────────────────────

  @Post('work-orders')
  async createWorkOrder(@Body() body: any) {
    const tenantId = this.tenantId(body?.tenantId);
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
    return this.service.listWorkOrders(this.tenantId(tenantId), contractId);
  }

  @Get('work-orders/paged')
  async pagedWorkOrders(
    @Query('contractId') contractId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.listWorkOrdersPaged(this.tenantId(), parsePageParams(limit, offset), contractId);
  }

  @Get('dispatch-board')
  async getDispatchBoard(
    @Query('tenantId') tenantId?: string,
    @Query('minLat') minLat?: string,
    @Query('maxLat') maxLat?: string,
    @Query('minLng') minLng?: string,
    @Query('maxLng') maxLng?: string,
  ) {
    const tid = this.tenantId(tenantId);
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

  /** assigned → in_progress. The class carried `startWork()` from the start; nothing ever called it. */
  @Post('work-orders/:id/start')
  async startWorkOrder(@Param('id') id: string) {
    return this.service.startWorkOrder(id);
  }

  @Post('work-orders/:id/cancel')
  async cancelWorkOrder(@Param('id') id: string, @Body('reason') reason?: string) {
    const ctx = this.tenant.get();
    if (ctx.actorId && !reason?.trim()) throw new BadRequestException('a reason is required to cancel a work order');
    return this.service.cancelWorkOrder(id, ctx.actorId, reason);
  }

  /** Work Order 360 — the visit with the contract that governs its SLA. */
  @Get('work-orders/:id/detail')
  async workOrderDetail(@Param('id') id: string) {
    const order = await this.service.findWorkOrder(id);
    if (!order) throw new NotFoundException(`work order ${id} not found`);
    const contract = order.contractId ? await this.service.findContract(order.contractId) : null;
    return { order, contract };
  }

  @Post('work-orders/:id/complete')
  async completeWorkOrder(@Param('id') id: string, @Body('cost') cost?: number) {
    return this.service.completeWorkOrder(id, cost !== undefined ? Number(cost) : undefined, this.tenant.get().actorId);
  }

  // ─── PPM Schedules (preventive maintenance) ───────────────────────────────

  @Post('ppm-schedules')
  async createPpm(@Body() body: { contractId: string; assetId?: string; taskDescription: string; frequency: PpmFrequency; startDate?: string }) {
    return await this.service.createPpmSchedule({
      tenantId: this.tenantId(),
      contractId: body.contractId,
      assetId: body.assetId,
      taskDescription: body.taskDescription,
      frequency: body.frequency,
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
    });
  }

  @Get('ppm-schedules')
  async listPpms(@Query('tenantId') tenantId?: string, @Query('contractId') contractId?: string) {
    return this.service.listPpmSchedules(this.tenantId(tenantId), contractId);
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
