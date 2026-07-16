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
        // e.type activates the admin per-event rule (notify.rule.<event>, §2.8 depth).
        await this.notifications.record({ tenantId: e.tenantId, title, body, category, refType, refId: e.aggregateId }, [], e.type);
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

    // C7 — the CRM half of the stream, which had never been wired here. Event-driven facts only:
    // the time-based ones (SLA breach, overdue follow-up) cannot be events because nothing happens
    // when nothing happens — the sweep at POST /crm/automation/run raises those.
    // The lead events carry ids, not names (payload: { assignedTo, assignedAt } and
    // { opportunityId, accountId, ... }) — so these bodies say what the payload actually knows
    // rather than interpolating fields that would render as "undefined". The notification links to
    // the record by refId; the record is where the name lives.
    this.bus.subscribe('crm.lead.assigned', (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      void raise(e, 'Lead assigned', `A lead was assigned to ${p.assignedTo ?? 'someone'}. The first-response clock starts now.`, 'crm', 'crm.lead');
    });

    this.bus.subscribe('crm.lead.converted', (e: DomainEvent) => {
      void raise(e, 'Lead converted', 'A lead was qualified and became an opportunity.', 'crm', 'crm.lead');
    });

    this.bus.subscribe('crm.opportunity.stage_changed', (e: DomainEvent) => {
      const p = e.payload as Record<string, unknown>;
      // Only the terminal moves are news. A deal walking through the pipeline IS the pipeline
      // working; notifying on every step is how people learn to ignore notifications.
      const stage = String(p.stage ?? '');
      if (stage !== 'won' && stage !== 'lost') return;
      void raise(
        e,
        `Deal ${stage}: ${p.title ?? ''}`.trim(),
        `${p.title ?? 'A deal'}${p.accountName ? ` (${p.accountName})` : ''} — value ${p.value ?? 0} — was marked ${stage}.`,
        'crm',
        'crm.opportunity',
      );
    });

    this.logger.log('Notification subscribers registered (po.approved, ipc.certified, period.closed, tender.awarded, registration.expiring, amc.sla_breached, crm.lead.assigned, crm.lead.converted, crm.opportunity.stage_changed)');
  }
}
