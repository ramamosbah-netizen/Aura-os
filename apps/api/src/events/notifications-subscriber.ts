import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus, NotificationService } from '@aura/core';
import type { DomainEvent } from '@aura/shared';

/**
 * Raises in-app notifications from spine events — wiring the notification center to the
 * business stream (approvals, billing milestones, period close). Persisted via
 * NotificationService; channel delivery (email/SMS) is dispatched there too.
 */
@Injectable()
export class NotificationsSubscriber implements OnModuleInit {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly bus: EventBus,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    const raise = async (e: DomainEvent, title: string, body: string, category: string, refType: string): Promise<void> => {
      try {
        await this.notifications.record({ tenantId: e.tenantId, title, body, category, refType, refId: e.aggregateId });
      } catch (err) {
        this.logger.error(`Failed to raise notification for ${e.type}: ${err}`);
      }
    };

    this.bus.subscribe('procurement.po.approved', (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      void raise(e, `PO approved: ${p.title ?? ''}`.trim(), `Purchase order approved (value ${p.value ?? 0}).`, 'procurement', 'procurement.po');
    });

    this.bus.subscribe('contracts.ipc.certified', (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      void raise(e, `IPC certified: ${p.reference ?? ''}`.trim(), `Interim payment certificate certified (net ${p.netThisCertificate ?? 0}).`, 'contracts', 'contracts.ipc');
    });

    this.bus.subscribe('finance.period.closed', (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      void raise(e, `Period closed: ${p.period ?? ''}`.trim(), `Fiscal period ${p.period ?? ''} is locked against further posting.`, 'finance', 'finance.period');
    });

    this.bus.subscribe('tendering.tender.awarded', (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      void raise(e, `Tender won: ${p.title ?? ''}`.trim(), `Tender awarded (value ${p.value ?? 0}) — a contract was drafted downstream.`, 'tendering', 'tendering.tender');
    });

    this.bus.subscribe('fleet.vehicle.registration_expiring', (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      void raise(e, `Mulkiya expiring: ${p.plateNumber ?? ''}`.trim(), `Vehicle ${p.plateNumber ?? ''} registration expires on ${p.registrationExpiry ?? ''} (${p.daysRemaining ?? 0} days remaining). Please schedule renewal.`, 'fleet', 'fleet.vehicle');
    });

    this.bus.subscribe('amc.ticket.sla_breached', (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      void raise(e, `SLA breach (L${p.escalationLevel ?? 1}): ${p.ticketNumber ?? ''}`.trim(), `AMC ticket "${p.title ?? ''}" (${p.priority ?? ''}) has breached its SLA (due ${p.slaDueAt ?? ''}). Escalated to level ${p.escalationLevel ?? 1}.`, 'amc', 'amc.ticket');
    });

    this.logger.log('Notification subscribers registered (po.approved, ipc.certified, period.closed, tender.awarded, registration.expiring, amc.sla_breached)');
  }
}
