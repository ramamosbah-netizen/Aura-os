import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@aura/core';
import { type DomainEvent } from '@aura/shared';
import { EngineeringService } from '@aura/engineering';
import { DocControlService } from '@aura/doccontrol';
import { ProjectResponsibilityService } from '@aura/projects';

/**
 * Engineering → Document Control: when an approved shop drawing is TRANSMITTED, the official
 * conveyance record lives in doccontrol (a Transmittal), not in engineering — "a transmittal is a
 * conveyance" (doccontrol domain). This reactor turns `engineering.drawing.transmitted` into a
 * doccontrol Transmittal and links its reference back onto the drawing, so the two modules stay
 * decoupled (ADR-0004: cross-context coordination in the app layer) while the engineer sees the
 * transmittal on the drawing's Transmittals tab.
 *
 * Idempotent: the transmittal code is derived from the drawing id + revision, so an at-least-once
 * re-delivery never creates a second transmittal for the same transmitted revision.
 */
@Injectable()
export class DrawingTransmittalSubscriber implements OnModuleInit {
  private readonly logger = new Logger('DrawingTransmittal');

  constructor(
    private readonly bus: EventBus,
    private readonly doccontrol: DocControlService,
    private readonly engineering: EngineeringService,
    private readonly responsibilities: ProjectResponsibilityService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe('engineering.drawing.transmitted', async (e: DomainEvent) => {
      const p = e.payload as {
          code?: string;
          title?: string;
          revision?: string;
          projectId?: string;
          projectName?: string;
          recipient?: string | null;
          purpose?: string | null;
          responsibilityId?: string | null;
      };
      const revision = p.revision ?? '0';
      // Keep the full aggregate id: the database uniqueness key is tenant+project+code, so
      // truncating UUIDs would turn a rare prefix collision into the wrong drawing's conveyance.
      const code = `TR-${e.aggregateId}-${revision}`;

      // Idempotency is based on the immutable drawing-revision identity. A replay resumes any
      // unfinished work instead of returning early, so a prior failure cannot leave an unlinked
      // draft behind while the outbox marks the event complete.
      const existing = await this.doccontrol.listTransmittals(e.tenantId);
      let transmittal = existing.find((t) => t.code === code);

      if (!transmittal) {
        transmittal = await this.doccontrol.createTransmittal({
          tenantId: e.tenantId,
          companyId: e.companyId ?? undefined,
          code,
          title: `${p.code ?? 'Drawing'} Rev ${revision} — ${p.title ?? ''}`.trim(),
          projectId: p.projectId ?? '',
          projectName: p.projectName ?? undefined,
          sender: 'Engineering',
          recipient: p.recipient ?? undefined,
          purpose: p.purpose ?? undefined,
          // System-initiated conveyance: no createdBy → no cross-module permission coupling.
        });
      }

      if (transmittal.status === 'draft') {
        transmittal = await this.doccontrol.sendTransmittal(e.tenantId, null, transmittal.id);
      }

      // Link on every delivery, including a replay that found the conveyance already present.
      await this.engineering.linkTransmittal(e.tenantId, e.aggregateId, transmittal.code);
      if (p.responsibilityId) {
        await this.responsibilities.linkEngineeringRelease({
          id: p.responsibilityId,
          tenantId: e.tenantId,
          projectId: p.projectId ?? '',
          drawingId: e.aggregateId,
          drawingCode: p.code ?? 'Drawing',
          revision,
          transmittalRef: transmittal.code,
          actorId: e.actorId,
        });
      }

      this.logger.log(
        `drawing.transmitted → sent doccontrol transmittal ${transmittal.code} for ${p.code} Rev ${revision}`,
      );
    });
  }
}
