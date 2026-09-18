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
 * THIS IS AN INTERNAL RELEASE, AND IT IS NOW MARKED AS ONE.
 *
 * The recipients are platform `userId`s — the Site Engineer, Project Engineer and Buyer who take an
 * `engineering_release` responsibility for the drawing. Nothing leaves the business here. But the
 * record it produced was indistinguishable from a conveyance to the client: the same Transmittal,
 * marked `sent`, created with no actor and sent by nobody, by an engineer holding no document-control
 * permission at all. Read back from the register afterwards, there was nothing to tell the two apart.
 *
 * Two things fix that, and neither of them takes the handoff away from engineering:
 *   • `kind: 'internal_release'` — unreachable from any request body, so this path CANNOT produce an
 *     external conveyance even if someone asks it to.
 *   • the engineer is recorded as creator and releaser. `engineering.drawing.transmit` was already
 *     asserted upstream; what was missing was not authority, it was the signature.
 *
 * Issuing a controlled document OUTSIDE the business remains `doccontrol.revision.issue`, held by the
 * Document Controller, and no part of this path reaches it.
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
          recipients?: Array<{ userId?: string; party?: string }> | null;
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
          kind: 'internal_release',
          // The engineer who released the drawing. An internal release asserts no document-control
          // permission (see `createTransmittal`), so naming them costs nothing and buys the record
          // an author — which is exactly the trade the old `no createdBy` comment got backwards.
          createdBy: e.actorId ?? undefined,
        });
      }

      // ADDRESS IT BEFORE SENDING (ENG-06). The distribution is fixed at `sent`, so the named
      // Site Engineer, Project Engineer and Buyer go on while it is still a draft — and only they
      // can accept it afterwards. Idempotent on a replay: a recipient already on the conveyance is
      // skipped rather than duplicated, and a failure part-way resumes here on the next delivery.
      if (transmittal.status === 'draft') {
        for (const r of p.recipients ?? []) {
          const userId = r?.userId?.trim();
          if (!userId) continue;
          try {
            await this.doccontrol.addTransmittalRecipient({
              tenantId: e.tenantId, actorId: null, transmittalId: transmittal.id,
              userId, party: r.party ?? null,
            });
          } catch (error) {
            // Already addressed on a previous delivery of this same event. Anything else is a real
            // failure and escapes to the durable handler for retry rather than being swallowed.
            if (!/already a recipient/i.test((error as Error).message)) throw error;
          }
        }
        // Released BY THE ENGINEER, not by nobody. This used to call `sendTransmittal(…, null, …)`:
        // the null both skipped the permission check and emptied `sent_by`, so the way the engineer
        // got past a guard they should not have to satisfy was by not saying who they were.
        // `releaseInternally` refuses anything that is not an internal release, and records them.
        transmittal = await this.doccontrol.releaseInternally(e.tenantId, e.actorId ?? null, transmittal.id);
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
