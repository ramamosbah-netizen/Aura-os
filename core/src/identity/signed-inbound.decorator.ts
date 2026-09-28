import { SetMetadata } from '@nestjs/common';

export const SIGNED_INBOUND_KEY = 'signed-inbound';

/**
 * A MACHINE CALLING IN, WHICH PROVES ITSELF BY SIGNATURE — NOT A USER, AND NOT A ROLE.
 *
 * An inbound webhook (Meta delivering a WhatsApp message, a telematics box reporting a position)
 * arrives with no user and no tenant. The permission guard asks "which role may do this?", and for
 * these the honest answer is "none": the caller is not a person, so no grant can describe it, and the
 * only way to let one through the user-permission model was to hand the machine an administrator's
 * token. SEC-01's stage-4 draft put both routes aside for exactly this reason (owner, 2026-09-28:
 * "security/authentication work, not business-role permissions").
 *
 * Marking a handler with this skips the USER-permission check and nothing else. The handler takes
 * the obligation instead, and must refuse before doing any work unless the request carries a valid
 * signature over its raw body (or, for a provider's subscription handshake, the shared verify token).
 * `verifiedBy` names that mechanism, so a reader of the controller sees what stands in the guard's
 * place.
 *
 * NOT A HIDING PLACE: `signed-inbound.fitness.test.ts` pins the exact set of handlers that carry it.
 * A new one fails the build by name, and the route audit counts a marked handler as governed only
 * because that list exists.
 */
export const SignedInbound = (verifiedBy: string): MethodDecorator => SetMetadata(SIGNED_INBOUND_KEY, verifiedBy);
