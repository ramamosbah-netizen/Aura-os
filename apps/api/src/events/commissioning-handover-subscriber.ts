import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@aura/core';
import { type DomainEvent } from '@aura/shared';
import { CommissioningService, HandoverService } from '@aura/commissioning';

/**
 * Commission → handover: when the LAST system on a project is commissioned (every commissioning
 * record is `commissioned`), the project is ready to hand over — so open a draft handover package
 * automatically for the delivery team to complete. Closes the stage 11 → 12 automation.
 *
 * Idempotent two ways: it only fires when the whole project is commissioned, and only creates a
 * package if the project has none — so any of the project's commission events (and re-deliveries)
 * converge on exactly one draft handover.
 */
@Injectable()
export class CommissioningHandoverSubscriber implements OnModuleInit {
  private readonly logger = new Logger('CommissioningHandover');

  constructor(
    private readonly bus: EventBus,
    private readonly commissioning: CommissioningService,
    private readonly handover: HandoverService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe('commissioning.record.commissioned', async (e: DomainEvent) => {
      try {
        const p = e.payload as { projectId?: string; projectName?: string | null };
        if (!p.projectId) return;

        const systems = await this.commissioning.list(e.tenantId, p.projectId);
        // Only when every registered system on the project is commissioned.
        if (systems.length === 0 || !systems.every((s) => s.status === 'commissioned')) return;

        // Idempotent: one draft handover per project.
        const existing = await this.handover.list(e.tenantId, p.projectId);
        if (existing.length > 0) return;

        const pkg = await this.handover.create({
          tenantId: e.tenantId,
          companyId: e.companyId,
          projectId: p.projectId,
          projectName: p.projectName ?? null,
          code: `HO-${p.projectId.slice(0, 8)}`,
          title: `Handover — ${p.projectName ?? 'project'}`,
          createdBy: e.actorId,
        });
        this.logger.log(
          `⚡ all ${systems.length} systems commissioned → opened draft handover ${pkg.code} for project ${p.projectId}`,
        );
      } catch (err) {
        this.logger.error(`Failed to open handover from commissioning.record.commissioned: ${err}`);
      }
    });
  }
}
