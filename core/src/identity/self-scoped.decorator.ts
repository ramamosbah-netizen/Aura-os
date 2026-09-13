import { SetMetadata } from '@nestjs/common';

export const SELF_SCOPED_KEY = 'self-scoped';

/**
 * "Authenticated; this handler authorises itself."
 *
 * A DISCOVERY endpoint cannot be authorised the ordinary way, and the reason is structural rather
 * than a matter of convenience. `GET /projects/projects/mine` answers "which projects may I see?".
 * The guard would derive `projects.project.read` with no resource on the target, so only an
 * ORG-wide grant could satisfy it — and the people the endpoint exists for are precisely those who
 * hold project-scoped grants and no org grant. The check would refuse everyone who needed it.
 *
 * So the handler takes the decision instead, against the actor's own grants, and returns only what
 * those grants reach. Everything else the guard does still happens: the tenant is bound, the module
 * must be enabled, a deactivated account is refused, and an unauthenticated request never arrives.
 * What is skipped is one thing — the blanket permission assertion — and only for handlers that
 * replace it with a narrower one of their own.
 *
 * This is a real hole if it spreads by habit, so it is fenced: `self-scoped-routes.fitness.test.ts`
 * enumerates every use and fails on any that is not on a reviewed list with a reason. Adding the
 * decorator is therefore a decision someone has to write down, not a one-line convenience.
 */
export const SelfScoped = (): MethodDecorator & ClassDecorator => SetMetadata(SELF_SCOPED_KEY, true);
