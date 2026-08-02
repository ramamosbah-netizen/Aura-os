import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@aura/core';
import { type DomainEvent } from '@aura/shared';
import { AmcService } from '@aura/amc';

/**
 * Deliver → maintain: when a project handover is ACCEPTED by the client, the warranty/DLP clock
 * starts — which is exactly when the AMC/service relationship begins. This reactor turns an
 * accepted handover into a service contract automatically, closing the ELV lifecycle loop
 * (commission → handover → maintain). Cross-context coordination lives in the app layer
 * (ADR-0004), same as the other deal-chain reactors.
 *
 * Idempotent: keyed on a derived contract number (AMC-<handoverId>), so an at-least-once event
 * re-delivery never opens a second contract for the same handover.
 */
@Injectable()
export class HandoverAmcSubscriber implements OnModuleInit {
  private readonly logger = new Logger('HandoverAMC');

  constructor(
    private readonly bus: EventBus,
    private readonly amc: AmcService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe('commissioning.handover.accepted', async (e: DomainEvent) => {
      try {
        const p = e.payload as {
          projectId?: string;
          projectName?: string;
          warrantyStartDate?: string | null;
          warrantyMonths?: number | null;
        };
        const contractNumber = `AMC-${e.aggregateId.slice(0, 8)}`;

        // Idempotency: skip if a contract for this handover already exists.
        const existing = await this.amc.listContracts(e.tenantId);
        if (existing.some((c) => c.contractNumber === contractNumber)) return;

        const months = p.warrantyMonths ?? 12;
        const start = p.warrantyStartDate ? new Date(p.warrantyStartDate) : new Date();
        const end = new Date(start);
        end.setMonth(end.getMonth() + months);

        const contract = await this.amc.createContract({
          tenantId: e.tenantId,
          companyId: e.companyId ?? undefined,
          contractNumber,
          clientName: p.projectName ?? 'Handover client',
          serviceScope: `Warranty & AMC — ${p.projectName ?? 'project'} (from handover ${e.aggregateId.slice(0, 8)})`,
          startDate: start,
          endDate: end,
          value: 0,
        });
        this.logger.log(
          `⚡ handover.accepted → auto-opened AMC contract ${contract.contractNumber} (${months}mo warranty from ${start.toISOString().slice(0, 10)})`,
        );
      } catch (err) {
        this.logger.error(`Failed to auto-open AMC contract from handover.accepted: ${err}`);
      }
    });
  }
}
