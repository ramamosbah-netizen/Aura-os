import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ProjectResolverRegistry, TenantContext } from '@aura/core';
import {
  NCR_STORE, INSPECTION_REQUEST_STORE, SNAG_STORE, ITP_STORE,
  MATERIAL_APPROVAL_STORE, CALIBRATION_STORE, AUDIT_SCHEDULE_STORE,
} from './quality.service';
import type {
  NcrStore, InspectionRequestStore, SnagStore, ItpStore,
  MaterialApprovalStore, CalibrationStore, AuditScheduleStore,
} from './store.interface';

/**
 * Quality tells the permission guard which project each of its records belongs to.
 *
 * Twenty quality routes address a record by its own id — `ncrs/:id/verify`, `irs/:id/raise-ncr`,
 * `snags/:id/close` and the rest. See `core/src/identity/project-resolver.ts` for why resolving
 * from the record beats reading a project out of the request.
 *
 * These stores take the tenant explicitly, so the bound tenant is passed from context: the read
 * happens inside the request's tenant, which is what makes it legal under fail-closed RLS. No
 * tenant bound means no resolution rather than a cross-tenant read.
 */
@Injectable()
export class QualityProjectResolvers implements OnModuleInit {
  constructor(
    private readonly registry: ProjectResolverRegistry,
    private readonly tenant: TenantContext,
    @Inject(NCR_STORE) private readonly ncrs: NcrStore,
    @Inject(INSPECTION_REQUEST_STORE) private readonly irs: InspectionRequestStore,
    @Inject(SNAG_STORE) private readonly snags: SnagStore,
    @Inject(ITP_STORE) private readonly itps: ItpStore,
    @Inject(MATERIAL_APPROVAL_STORE) private readonly approvals: MaterialApprovalStore,
    @Inject(CALIBRATION_STORE) private readonly calibrations: CalibrationStore,
    @Inject(AUDIT_SCHEDULE_STORE) private readonly audits: AuditScheduleStore,
  ) {}

  /** The tenant this request is bound to, or null — never a guess. */
  private tenantId(): string | null {
    try {
      return this.tenant.get().tenantId ?? null;
    } catch {
      return null;
    }
  }

  onModuleInit(): void {
    const scoped = <T extends { projectId?: string | null }>(
      find: (id: string, tenantId: string) => Promise<T | null>,
    ) => async (id: string): Promise<string | null> => {
      const tenantId = this.tenantId();
      if (!tenantId) return null;
      return (await find(id, tenantId))?.projectId ?? null;
    };

    this.registry.register('quality', 'ncr', scoped((id, t) => this.ncrs.findById(id, t)));
    this.registry.register('quality', 'ir', scoped((id, t) => this.irs.findById(id, t)));
    this.registry.register('quality', 'snag', scoped((id, t) => this.snags.findById(id, t)));
    this.registry.register('quality', 'itp', scoped((id, t) => this.itps.findById(id, t)));
    this.registry.register('quality', 'material-approval', scoped((id, t) => this.approvals.findById(id, t)));
    this.registry.register('quality', 'calibration', scoped((id, t) => this.calibrations.findById(id, t)));
    this.registry.register('quality', 'audit', scoped((id, t) => this.audits.findById(id, t)));
  }
}
