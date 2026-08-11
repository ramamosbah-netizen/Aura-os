import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@aura/core';
import { type DomainEvent } from '@aura/shared';
import { EngineeringService } from '@aura/engineering';
import { DocControlService } from '@aura/doccontrol';

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
  ) {}

  onModuleInit(): void {
    this.bus.subscribe('engineering.drawing.transmitted', async (e: DomainEvent) => {
      try {
        const p = e.payload as {
          code?: string;
          title?: string;
          revision?: string;
          projectId?: string;
          projectName?: string;
          recipient?: string | null;
          purpose?: string | null;
        };
        const revision = p.revision ?? '0';
        const code = `TR-${e.aggregateId.slice(0, 8)}-${revision}`;

        // Idempotency: skip if a transmittal for this drawing revision already exists.
        const existing = await this.doccontrol.listTransmittals(e.tenantId);
        if (existing.some((t) => t.code === code)) return;

        const transmittal = await this.doccontrol.createTransmittal({
          tenantId: e.tenantId,
          companyId: e.companyId ?? undefined,
          code,
          title: `${p.code ?? 'Drawing'} Rev ${revision} — ${p.title ?? ''}`.trim(),
          projectId: p.projectId ?? '',
          projectName: p.projectName ?? undefined,
          sender: 'Engineering',
          recipient: p.recipient ?? undefined,
          // System-initiated conveyance: no createdBy → no cross-module permission coupling.
        });

        // Link the transmittal reference back onto the transmitted drawing revision.
        await this.engineering.linkTransmittal(e.tenantId, e.aggregateId, transmittal.code);

        this.logger.log(
          `⚡ drawing.transmitted → doccontrol transmittal ${transmittal.code} for ${p.code} Rev ${revision}`,
        );
      } catch (err) {
        this.logger.error(`Failed to create transmittal from drawing.transmitted: ${err}`);
      }
    });
  }
}
