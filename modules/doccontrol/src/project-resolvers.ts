import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ProjectResolverRegistry, TenantContext } from '@aura/core';
import {
  TRANSMITTAL_STORE, DOCUMENT_REVISION_STORE, CORRESPONDENCE_STORE,
  SUBMITTAL_STORE, DRAWING_REGISTER_STORE,
  type TransmittalStore, type DocumentRevisionStore, type CorrespondenceStore,
  type SubmittalStore, type DrawingRegisterStore,
} from './store.interface';

/**
 * Document control tells the permission guard which project each record belongs to.
 *
 * Nineteen routes address a record by its own id — `transmittals/:id/send`,
 * `revisions/:id/approve` and the rest. See `core/src/identity/project-resolver.ts`.
 *
 * `TransmittalItem` and `TransmittalAcknowledgement` are absent: they carry no project of their own
 * and are reached through the transmittal, which is what the route names and what gets resolved.
 */
@Injectable()
export class DocControlProjectResolvers implements OnModuleInit {
  constructor(
    private readonly registry: ProjectResolverRegistry,
    private readonly tenant: TenantContext,
    @Inject(TRANSMITTAL_STORE) private readonly transmittals: TransmittalStore,
    @Inject(DOCUMENT_REVISION_STORE) private readonly revisions: DocumentRevisionStore,
    @Inject(CORRESPONDENCE_STORE) private readonly correspondence: CorrespondenceStore,
    @Inject(SUBMITTAL_STORE) private readonly submittals: SubmittalStore,
    @Inject(DRAWING_REGISTER_STORE) private readonly register: DrawingRegisterStore,
  ) {}

  private tenantId(): string | null {
    try { return this.tenant.get().tenantId ?? null; } catch { return null; }
  }

  onModuleInit(): void {
    const scoped = <T extends { projectId?: string | null }>(
      find: (id: string, tenantId: string) => Promise<T | null>,
    ) => async (id: string): Promise<string | null> => {
      const tenantId = this.tenantId();
      if (!tenantId) return null;
      return (await find(id, tenantId))?.projectId ?? null;
    };

    this.registry.register('doccontrol', 'transmittal', scoped((id, t) => this.transmittals.findById(id, t)));
    this.registry.register('doccontrol', 'revision', scoped((id, t) => this.revisions.findById(id, t)));
    this.registry.register('doccontrol', 'correspondence', scoped((id, t) => this.correspondence.findById(id, t)));
    this.registry.register('doccontrol', 'submittal', scoped((id, t) => this.submittals.findById(id, t)));
    this.registry.register('doccontrol', 'register', scoped((id, t) => this.register.findById(id, t)));
  }
}
