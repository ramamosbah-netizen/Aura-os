import { Injectable } from '@nestjs/common';
import { AccessService, AuthService } from '@aura/core';
import {
  ProjectService,
  ResourceBookingService,
  WbsService,
  type ResourceBooking,
  type ResourceBookingView,
} from '@aura/projects';

/**
 * The other side of a conflict: which activities, in which projects, are competing for this
 * resource — resolved from the persisted records, and redacted before it leaves the server.
 *
 * THE CHAIN, and every link of it comes from a stored row:
 *
 *   Resource  →  Booking  →  Requirement  →  Schedule activity  →  WBS node  →  Project
 *
 * NOTHING IS TAKEN FROM THE CALLER. The request names the project whose desk is being read and
 * nothing else; the competing side is discovered by asking the booking store which held bookings
 * cover the same resource over the same days, and every id after that — requirement, activity,
 * work package, project — is read off those rows. A `projectId` or `activityId` supplied by a
 * client is never used to decide who the other party is, because a client that could name the
 * other party could also name one it has no business seeing.
 *
 * AUTHORIZATION IS APPLIED HERE, not in the browser. `projects.resource-conflict.*` says a person
 * may take conflicts on; it says nothing about reading another project, and the two are checked
 * separately: each competing commitment is tested against `projects.schedule.read` on ITS OWN
 * project before any of its identity is included. A caller without that grant receives a
 * commitment marked `restricted` — its overlap and its size, so the clash is still actionable, and
 * no project name, customer, activity or work package at all. Redaction that happens in React is
 * not redaction: the data has already crossed the wire.
 *
 * IT IS ENTIRELY DERIVED, and holds nothing. The relationship exists while two bookings overlap
 * and disappears when they stop — a released or re-dated commitment simply is not returned on the
 * next read — while the ownership and decision recorded against the conflict (migration 0321)
 * live in their own table and survive untouched. Nothing in this file writes anything.
 */

/** A competing commitment the caller may see in full. */
export interface VisibleConflictingCommitment {
  access: 'visible';
  bookingId: string;
  requirementId: string | null;
  projectId: string;
  projectName: string | null;
  activityId: string | null;
  activityName: string | null;
  wbsNodeId: string | null;
  wbsCode: string | null;
  wbsTitle: string | null;
  quantity: number;
  unit: string;
  from: string;
  to: string;
  /** The days both commitments cover — where the competition actually is. */
  overlapDays: string[];
}

/**
 * A competing commitment the caller may not see.
 *
 * Carries what makes the clash actionable and nothing that identifies whose it is. The quantity
 * and the days are deliberately included: they are the conflict itself, already visible in the
 * capacity arithmetic on the same screen, and withholding them would leave a planner told that
 * something is wrong and given no way to judge how much.
 */
export interface RestrictedConflictingCommitment {
  access: 'restricted';
  quantity: number;
  unit: string;
  overlapDays: string[];
}

export type ConflictingCommitment = VisibleConflictingCommitment | RestrictedConflictingCommitment;

/**
 * One booking's share of a day's load, redacted the same way.
 *
 * The cross-project report has ALWAYS carried these — it is what makes a clash attributable — and
 * they name the booking and the project holding it. Redacting the new lineage while leaving these
 * untouched would be redaction as theatre: the same facts, one field along.
 */
export type ConflictContributor =
  | { access: 'visible'; bookingId: string; projectId: string; quantity: number; unit: string }
  | { access: 'restricted'; quantity: number; unit: string };

export interface RedactedConflictDay {
  day: string;
  capacity: number | null;
  committed: number;
  unit: string | null;
  overBy: number | null;
  unknownReason?: string;
  unavailable?: { reason: string; source: string };
  contributors: ConflictContributor[];
}

/**
 * The cross-project verdict as this caller may see it.
 *
 * The ARITHMETIC is never redacted — capacity, committed, the days that clash — because that is
 * the conflict itself and a planner told only that something is wrong can do nothing with it. What
 * is redacted is identity: which project, which booking. `restrictedProjects` keeps the count
 * honest without naming anybody, so "involves 3 projects" stays true on a screen that may only
 * name one of them.
 */
export interface RedactedResourceConflict {
  resource: { resourceType: string; canonicalResourceId: string };
  from: string;
  to: string;
  feasibility: string;
  reason?: string;
  conflictDays: string[];
  days: RedactedConflictDay[];
  /** Only the projects this caller may read. */
  projectsInvolved: string[];
  /** How many more are involved that they may not. */
  restrictedProjects: number;
}

export interface ResourceBookingViewWithLineage extends Omit<ResourceBookingView, 'resourceConflict'> {
  resourceConflict: RedactedResourceConflict;
  /** Every OTHER held commitment overlapping this one, its lineage resolved and authorized. */
  conflictingCommitments: ConflictingCommitment[];
}

const eachDay = (from: string, to: string): string[] => {
  const days: string[] = [];
  for (let at = new Date(`${from}T00:00:00.000Z`); at <= new Date(`${to}T00:00:00.000Z`); at.setUTCDate(at.getUTCDate() + 1)) {
    days.push(at.toISOString().slice(0, 10));
  }
  return days;
};

@Injectable()
export class ConflictLineageService {
  constructor(
    private readonly bookings: ResourceBookingService,
    private readonly projects: ProjectService,
    private readonly wbs: WbsService,
    private readonly access: AccessService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Attach the competing side to each view.
   *
   * Every view is answered, not only the conflicted ones: a planner looking at a commitment that
   * currently fits still benefits from seeing who else holds the resource those days, and hiding
   * it until the arithmetic tips would make the screen change shape under them.
   */
  async attach(
    tenantId: string,
    actorId: string | null,
    companyId: string | null,
    views: readonly ResourceBookingView[],
  ): Promise<ResourceBookingViewWithLineage[]> {
    const projectNames = new Map<string, string | null>();
    const packages = new Map<string, { code: string; title: string } | null>();

    const mayRead = (projectId: string): boolean => this.mayRead(tenantId, actorId, companyId, projectId);

    return Promise.all(views.map(async (view) => {
      const resourceConflict = this.redact(view.resourceConflict, mayRead);
      if (view.booking.status !== 'held') return { ...view, resourceConflict, conflictingCommitments: [] };

      // Discovered, never supplied: the store answers which held commitments cover this resource
      // over these days, across every project in the tenant.
      const overlapping = await this.bookings.listAssignments(
        tenantId,
        view.booking.resource,
        { from: view.booking.from, to: view.booking.to },
      );

      const commitments = await Promise.all(overlapping
        .filter((other) => other.booking.id !== view.booking.id)
        .map(async (other) => this.describe(tenantId, actorId, companyId, view.booking, other.booking, other.activityName, other.wbsNodeId, projectNames, packages)));

      return { ...view, resourceConflict, conflictingCommitments: commitments };
    }));
  }

  /** One view, for the caller who just made the commitment. Same rules, same redaction. */
  async attachOne(
    tenantId: string,
    actorId: string | null,
    companyId: string | null,
    view: ResourceBookingView,
  ): Promise<ResourceBookingViewWithLineage> {
    const [attached] = await this.attach(tenantId, actorId, companyId, [view]);
    return attached;
  }

  /**
   * Strip identity from the cross-project report, keeping every number in it.
   *
   * Done here rather than in the domain because it is a question about the VIEWER, not about the
   * resource: the same conflict is one report and several redactions of it, and the engine that
   * computes it has no business knowing who is asking.
   */
  private redact(
    report: ResourceBookingView['resourceConflict'],
    mayRead: (projectId: string) => boolean,
  ): RedactedResourceConflict {
    const readable = report.projectsInvolved.filter(mayRead);
    return {
      resource: report.resource,
      from: report.from,
      to: report.to,
      feasibility: report.feasibility,
      ...(report.reason ? { reason: report.reason } : {}),
      conflictDays: report.conflictDays,
      days: report.days.map((day) => ({
        day: day.day,
        capacity: day.capacity,
        committed: day.committed,
        unit: day.unit,
        overBy: day.overBy,
        ...(day.unknownReason ? { unknownReason: day.unknownReason } : {}),
        ...(day.unavailable ? { unavailable: day.unavailable } : {}),
        contributors: day.contributors.map((share) => mayRead(share.projectId)
          ? { access: 'visible' as const, bookingId: share.bookingId, projectId: share.projectId, quantity: share.quantity, unit: share.unit }
          : { access: 'restricted' as const, quantity: share.quantity, unit: share.unit }),
      })),
      projectsInvolved: readable,
      restrictedProjects: report.projectsInvolved.length - readable.length,
    };
  }

  private async describe(
    tenantId: string,
    actorId: string | null,
    companyId: string | null,
    mine: ResourceBooking,
    other: ResourceBooking,
    activityName: string | null,
    wbsNodeId: string | null,
    projectNames: Map<string, string | null>,
    packages: Map<string, { code: string; title: string } | null>,
  ): Promise<ConflictingCommitment> {
    const overlapDays = eachDay(
      mine.from > other.from ? mine.from : other.from,
      mine.to < other.to ? mine.to : other.to,
    );
    const shared = { quantity: other.quantity, unit: other.unit, overlapDays };

    if (!this.mayRead(tenantId, actorId, companyId, other.projectId)) {
      return { access: 'restricted', ...shared };
    }

    if (!projectNames.has(other.projectId)) {
      projectNames.set(other.projectId, (await this.projects.get(other.projectId))?.title ?? null);
    }
    if (wbsNodeId && !packages.has(wbsNodeId)) {
      const node = await this.wbs.get(wbsNodeId);
      // Tenant-checked even though the id came off a row in this tenant: a getter that hands back
      // whatever it is asked for is the shape this codebase's isolation ratchet exists to prevent.
      packages.set(wbsNodeId, node && node.tenantId === tenantId ? { code: node.code, title: node.title } : null);
    }
    const node = wbsNodeId ? packages.get(wbsNodeId) ?? null : null;

    return {
      access: 'visible',
      bookingId: other.id,
      requirementId: other.requirementId,
      projectId: other.projectId,
      projectName: projectNames.get(other.projectId) ?? null,
      activityId: other.taskId,
      activityName,
      wbsNodeId,
      wbsCode: node?.code ?? null,
      wbsTitle: node?.title ?? null,
      ...shared,
      from: other.from,
      to: other.to,
    };
  }

  /**
   * May this actor read the OTHER project's schedule?
   *
   * A separate question from whether they may own conflicts, and asked with a separate permission
   * on purpose. `projects.resource-conflict.*` is organization-governed because a conflict spans
   * projects; it would be an obvious and quiet privilege escalation if holding it also opened
   * every project's plan.
   */
  private mayRead(tenantId: string, actorId: string | null, companyId: string | null, projectId: string): boolean {
    // Auth off (the dev default) is the same pass-through the permission guard applies; with a
    // verifier configured, an unauthenticated request never reaches here.
    if (!this.auth.enabled) return true;
    if (!actorId) return false;
    return this.access.can(actorId, {
      permission: 'projects.schedule.read',
      orgPath: [
        { level: 'tenant', id: tenantId },
        ...(companyId ? [{ level: 'company' as const, id: companyId }] : []),
      ],
      resource: { type: 'project', id: projectId },
    }).allowed;
  }
}
