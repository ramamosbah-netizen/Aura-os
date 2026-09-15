import { Injectable, Logger } from '@nestjs/common';
import type { Id } from '@aura/shared';
import type { LabourSpentProvider, ProjectLabourSpent } from '@aura/projects';
import { SiteService } from '@aura/site';

/**
 * Where a project's recorded hours went, read from the module that owns them.
 *
 * The app-layer adapter for `LABOUR_SPENT_PROVIDER` (ADR-0004): Projects declares the question,
 * Site owns the answer, and the two never import each other. Shaped exactly like
 * `ResourceAvailabilityFromRegisters`, for the same reason.
 *
 * ONE READ PER PROJECT, folded here rather than at the caller: the planning desk has already been
 * repaired once for asking a register per row, and a schedule of forty activities must not become
 * forty scans of a labour table.
 *
 * THE UNATTRIBUTED REMAINDER IS COMPUTED HERE, not inferred later. A caller that only received the
 * per-package totals could not tell a project where every hour is attributed from one where nine
 * tenths of the hours name no package at all — and those two projects' productivity figures deserve
 * very different amounts of trust.
 */
@Injectable()
export class LabourSpentFromSite implements LabourSpentProvider {
  private readonly logger = new Logger('ProjectsLabour');

  constructor(private readonly site: SiteService) {}

  async spentOn(tenantId: Id, projectId: Id): Promise<ProjectLabourSpent> {
    const byWorkPackage = new Map<Id, number>();
    let unattributedManHours = 0;
    let totalManHours = 0;
    try {
      const allocations = await this.site.listLabourAllocations(tenantId);
      for (const allocation of allocations) {
        // Another project's hours are not this project's labour, whatever package they name.
        if (allocation.projectId !== projectId) continue;
        const manHours = Number(allocation.manHours) || 0;
        totalManHours += manHours;
        if (allocation.wbsNodeId) {
          byWorkPackage.set(allocation.wbsNodeId, (byWorkPackage.get(allocation.wbsNodeId) ?? 0) + manHours);
        } else {
          unattributedManHours += manHours;
        }
      }
    } catch (error) {
      // Silence, never a favourable answer: a labour table that cannot be read must not make every
      // package look perfectly efficient, and must not fail the planner's whole screen either.
      this.logger.warn(`labour records unavailable for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
      return { byWorkPackage: new Map(), unattributedManHours: 0, totalManHours: 0 };
    }
    return { byWorkPackage, unattributedManHours, totalManHours };
  }
}
