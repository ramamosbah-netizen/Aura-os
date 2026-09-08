import type { AccessService } from '@aura/core';
import type { AccessTarget, Id, OrgLevel } from '@aura/shared';
import type { ProjectStore } from './project-store';

/**
 * The two checks every governed write against a project makes: the project exists and belongs to
 * this tenant, and the actor holds the permission for what they are about to do.
 *
 * A plain function rather than a base class. The §21 services are separate authorities by design
 * (DG-21.4), and a shared superclass is exactly the shape that would quietly grow into the unified
 * register the split exists to prevent. Sharing a guard is not sharing an authority.
 */
export async function assertProjectWriteAllowed(
  deps: { projects: ProjectStore | null; access: AccessService | null },
  input: { projectId: Id; tenantId: Id; actorId?: Id | null; permission: string },
): Promise<void> {
  if (deps.projects) {
    const project = await deps.projects.get(input.projectId);
    // Another tenant's project is not "forbidden", it is absent — saying otherwise would confirm
    // the project exists to someone who should not know that.
    if (!project || project.tenantId !== input.tenantId) {
      throw new Error(`project ${input.projectId} not found`);
    }
  }
  if (input.actorId && deps.access) {
    const target: AccessTarget = {
      permission: input.permission,
      orgPath: [{ level: 'tenant' as OrgLevel, id: input.tenantId }],
    };
    deps.access.assert(input.actorId, target);
  }
}
