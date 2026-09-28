import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@aura/core';
import { businessDate, type DomainEvent } from '@aura/shared';
import { AmcService } from '@aura/amc';
import { ProjectService } from '@aura/projects';

/** What a contract says when the project it maintains names no customer — never another name. */
export const CUSTOMER_NOT_RECORDED = 'Customer not recorded on the project';

/** Calendar months on a YYYY-MM-DD date, in UTC where a day is a day; the 31st clamps to month end. */
function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Deliver → maintain: when a project handover is ACCEPTED by the client, the warranty/DLP clock
 * starts — which is exactly when the AMC/service relationship begins. This reactor turns an
 * accepted handover into a service contract automatically, closing the ELV lifecycle loop
 * (commission → handover → maintain). Cross-context coordination lives in the app layer
 * (ADR-0004), same as the other deal-chain reactors.
 *
 * THE CONTRACT SAYS WHERE IT CAME FROM (J6-01). It used to carry no project and no handover, and
 * wrote the project's name into the client field. It now names the project, the handover and the
 * customer — the project's canonical account, read from Projects in the same tenant — and when the
 * project names no customer the contract says exactly that instead of borrowing a name.
 *
 * Idempotent per handover: the store keeps one contract per handover (a unique key in PostgreSQL),
 * so an at-least-once re-delivery never opens a second contract.
 */
@Injectable()
export class HandoverAmcSubscriber implements OnModuleInit {
  private readonly logger = new Logger('HandoverAMC');

  constructor(
    private readonly bus: EventBus,
    private readonly amc: AmcService,
    @Optional() @Inject(ProjectService) private readonly projects?: Pick<ProjectService, 'get'>,
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
        // A contract that cannot name the project it maintains has no lineage to give; opening one
        // would recreate the orphan this exists to remove.
        if (!p.projectId) {
          this.logger.error(`handover ${e.aggregateId} was accepted without a project — no service contract opened`);
          return;
        }
        const found = this.projects ? await this.projects.get(p.projectId) : null;
        const project = found && found.tenantId === e.tenantId ? found : null;
        const months = p.warrantyMonths ?? 12;
        const start = p.warrantyStartDate && /^\d{4}-\d{2}-\d{2}/.test(p.warrantyStartDate) ? p.warrantyStartDate.slice(0, 10) : businessDate();

        const { contract, opened } = await this.amc.openFromHandover({
          tenantId: e.tenantId,
          companyId: e.companyId ?? undefined,
          handoverId: e.aggregateId,
          projectId: p.projectId,
          projectName: project?.title ?? p.projectName ?? null,
          accountId: project?.accountId ?? null,
          clientName: project?.accountName?.trim() || CUSTOMER_NOT_RECORDED,
          startDate: new Date(`${start}T00:00:00.000Z`),
          endDate: new Date(`${addMonths(start, months)}T00:00:00.000Z`),
        });
        if (opened) {
          this.logger.log(`⚡ handover.accepted → opened AMC contract ${contract.contractNumber} for ${contract.clientName} (${months}mo warranty from ${start})`);
        }
      } catch (err) {
        this.logger.error(`Failed to auto-open AMC contract from handover.accepted: ${err}`);
      }
    });
  }
}
