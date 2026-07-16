import { Controller, Post, Query } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { NotificationService, TenantContext } from '@aura/core';
import {
  AccountService,
  ActivityService,
  LeadService,
  detectAutomation,
  type AutomationRun,
} from '@aura/crm';

// C7 (§8 automation) — the CRM sweep.
//
// Deliberately a tenant-scoped endpoint an external scheduler calls, NOT a background timer. That
// is the platform's existing pattern for time-based work (see POST /fleet/vehicles/check-expiry),
// and it is the only one that works here: CRM tables are under RLS, so a cross-tenant sweep on the
// system connection would read nothing. A request binds the tenant; a timer would not.
//
// `windowHours` must match the caller's real cadence — it is the whole basis of the once-only
// escalation. Running the sweep more often than it declares can double-notify; running it less
// often silently drops alerts. That contract is the price of holding no state, and it is stated
// here rather than discovered in production.

interface RunReport extends AutomationRun {
  /** What was actually done, as opposed to what was detected. */
  applied: { notifications: number; assignments: number; failures: number };
}

@Controller('crm/automation')
export class CrmAutomationController {
  private readonly logger = new Logger('CRM-Automation');

  constructor(
    private readonly leads: LeadService,
    private readonly activities: ActivityService,
    private readonly accounts: AccountService,
    private readonly notifications: NotificationService,
    private readonly tenant: TenantContext,
  ) {}

  @Post('run')
  async run(@Query('windowHours') windowHours?: string): Promise<RunReport> {
    const ctx = this.tenant.get();
    const tenantId = ctx.tenantId;
    const parsed = Number(windowHours);
    const window = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 24 * 30) : 24;

    const [leads, activities, accounts] = await Promise.all([
      this.leads.list({ tenantId, limit: 5000 }),
      this.activities.list({ tenantId, limit: 5000 }),
      this.accounts.list({ tenantId, limit: 2000 }),
    ]);

    const detected = detectAutomation(
      {
        windowHours: window,
        leads: leads.map((l) => ({
          id: l.id, name: l.name, companyName: l.companyName, email: l.email, phone: l.phone,
          status: l.status, assignedTo: l.assignedTo, assignedAt: l.assignedAt,
          acceptedAt: l.acceptedAt, firstRespondedAt: l.firstRespondedAt,
          slaFirstResponseHours: l.slaFirstResponseHours, createdAt: l.createdAt,
        })),
        activities: activities.map((a) => ({
          id: a.id, subject: a.subject, status: a.status, dueDate: a.dueDate,
          assigneeId: a.assigneeId, relatedId: a.relatedId, relatedType: a.relatedType,
          relatedName: a.relatedName, completedAt: a.completedAt, createdAt: a.createdAt,
        })),
        accounts: accounts.map((a) => ({
          id: a.id, name: a.name, email: a.email, phone: a.phone, ownerId: a.ownerId,
        })),
      },
    );

    const applied = { notifications: 0, assignments: 0, failures: 0 };

    // One escalation must never sink the rest of the sweep — a scheduler retrying the whole run
    // because one notification failed would re-notify everything that already succeeded.
    for (const e of detected.escalations) {
      try {
        await this.notifications.record(
          {
            tenantId,
            title: e.title,
            body: e.body,
            category: 'crm',
            refType: e.refType,
            refId: e.refId,
          },
          [],
          // Activates the admin per-event rule (notify.rule.<event>) — the same switch every other
          // notified event goes through, so this is configurable where all the others are.
          `crm.automation.${e.kind.toLowerCase()}`,
        );
        applied.notifications += 1;
      } catch (err) {
        applied.failures += 1;
        this.logger.error(`Escalation ${e.key} failed to notify: ${err}`);
      }
    }

    for (const a of detected.assignments) {
      try {
        // Goes through the normal assign path, so it emits crm.lead.assigned, resets the
        // first-response clock and is audited exactly like a human assignment. Automation gets no
        // private door into the domain.
        await this.leads.assign(a.leadId, a.assigneeId, ctx.actorId);
        applied.assignments += 1;
        this.logger.log(`Routed lead ${a.leadName} → ${a.assigneeId} (${a.reason})`);
      } catch (err) {
        applied.failures += 1;
        this.logger.error(`Routing lead ${a.leadId} failed: ${err}`);
      }
    }

    return { ...detected, applied };
  }
}
