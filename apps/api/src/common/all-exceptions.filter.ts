import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

/**
 * Global exception filter + error taxonomy. Maps every uncaught error to a consistent
 * envelope `{ statusCode, error, code, message, correlationId }`:
 *  - HttpException → its own status/message.
 *  - Plain domain Errors → 403 / 404 / 409 / 400 by message class (see classifyDomainMessage);
 *    otherwise 500 (logged, message hidden).
 * Removes the need for per-controller try/catch→400 boilerplate.
 *
 * The taxonomy is ENFORCED by apps/api/src/error-taxonomy.fitness.test.ts: it scans every
 * `throw new Error(...)` message literal in the codebase and fails if one would escape to 500
 * (outside an explicit internal-error allowlist). Extend the patterns here when adding a new
 * guard-message shape — the test tells you when you must.
 */

export interface DomainClassification {
  status: number;
  code: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION' | 'INTERNAL';
}

/** Pure message → status classification (kept headless so the fitness test runs the real logic). */
export function classifyDomainMessage(m: string): DomainClassification {
  // 403 — authorization phrased as a domain error (kernel AccessService).
  if (/access denied/i.test(m)) return { status: 403, code: 'FORBIDDEN' };

  // 404 — absent aggregates and absent prerequisite data.
  if (/not found|no longer exists|^no (payroll|schedule|.* records?|.* runs?)\b/i.test(m)) return { status: 404, code: 'NOT_FOUND' };

  // 403 — authorization expressed as a role fact rather than as a grant check.
  if (/is not an approver\b/i.test(m)) return { status: 403, code: 'FORBIDDEN' };

  // 403 — SEPARATION OF DUTIES. "The author may not approve their own work" is neither bad input
  // nor a state conflict: the request is well formed, the record is at the right step, and a
  // DIFFERENT person can perform the act immediately with nothing else changing. Only the actor is
  // wrong, which is exactly what 403 means. Without this branch `may not` falls through to the 400
  // group below and tells the caller to fix their request — advice that cannot be followed.
  //
  // Deliberately a SHAPE, not one message: SEC-01 stage 3 asks the same maker/checker question of 63
  // more governing acts, and every answer that refuses a self-act should classify here without
  // another pattern being added.
  if (/\bmay not\b[^.]*\b(?:their|your) own\b/i.test(m)) return { status: 403, code: 'FORBIDDEN' };

  // 403 — SEPARATION OF DUTIES BETWEEN TWO DIFFERENT ACTS, which the shape above does not catch.
  // "The person who APPROVED this revision may not ISSUE it" names no "own": the second act is not
  // the person's own work, it is a second authority they must not also hold. The rule above was
  // written for self-approval and predicted this — "deliberately a shape, not one message" — but its
  // shape only fits a self-act, and Wave C's headline rule is not one. Without this branch, refusing
  // the approver their own release returned 500: a correct, deliberate refusal reported to the
  // caller as a server fault, which is how a working control looks like a broken system.
  if (/\bthe person who\b[^.]*\bmay not\b/i.test(m)) return { status: 403, code: 'FORBIDDEN' };
  // 403 — the same question asked of a ROUTE rather than a person: this path is not the one that
  // holds the authority for this act. `releaseInternally` refuses an external conveyance here.
  if (/\bmay not be (?:released|issued|conveyed|sent)\b/i.test(m)) return { status: 403, code: 'FORBIDDEN' };

  // 409 — state-transition guards: the request is well-formed but the aggregate's current
  // state forbids it ("only a draft agreement can be activated", "is already disposed", …).
  if (
    // `\bonly\b.*\b(?:can|may)\b` covers both moods: "only a draft agreement CAN be activated" and
    // "only a draft revision MAY be edited" are the same refusal, and a message that said `may`
    // escaped to a 500 until it was added.
    /\balready\b|\blineage\b.*\bwithout\b|is closed|is inactive|is not (in|active|approved)|is not a locked|immutable after handover|require(?:s)? a signed contract|\bonly\b.*\b(?:can|may)\b|can only\b|requires approval|approval blocked|readiness checklist|below the required|insufficient|outside its validity|belongs to another|belongs to a different/i.test(m)
    // Maker/checker queues: "a draft recommendation is not awaiting a decision" is a state guard —
    // the request is well formed and the caller entitled to make it; the record is simply not at
    // the step being acted on.
    || /\bis not awaiting\b/i.test(m)
    // "Finance period 2018-01 is not currently closed" — the endpoint exists, the period exists and
    // the request is well formed; the record is simply not in the state the act undoes. 404 would
    // claim the period is unknown, which it is not, and 400 would tell the caller to fix a request
    // that has nothing wrong with it.
    || /\bis not currently\b/i.test(m)
    // CEILINGS. "Certifying 250000 would take this subcontract past its authorised value of 100000"
    // is not bad input: the request is well formed and the caller is entitled to make it, and the
    // figure is raised by a DIFFERENT governed act — instructing a variation — not by correcting this
    // request. A shape rather than one message: cumulative positions measured against an authorised
    // figure recur across the governing acts SEC-01 has still to reach.
    || /\bwould take\b[^.]*\b(?:past|beyond|over)\b/i.test(m)
    // Immutability and concurrency. A signed revision, an approved baseline and a certified
    // payment certificate all refuse the same way: the record is closed to further writes, or
    // someone else moved it first. The caller must re-read and use the governed correction path.
    // "…has changed since this proposal was produced" (§22 governed acceptance) is the same shape:
    // the schedule moved after the proposal was cut, so the stale proposal cannot be promoted.
    || /\bis immutable\b|changed concurrently|changed since\b|^conflicting\b|dedupe conflict/i.test(m)
    // COMMITTED EVIDENCE belongs here and not in the 400 group below. A witness's signature, or a
    // photograph a witness signed against, is refused because a COMPLETED ACT relies on those
    // bytes — the request is well formed, the caller is entitled to make it, and no correction to
    // the request will help. It reads as 409 for the same reason an immutable revision does, and
    // the remedy is a further governed act rather than a retry.
    //
    // A SHAPE rather than one message: four modules phrase this refusal in their own words
    // ("cannot be replaced", "can no longer be replaced"), and three of them escaped to 500 until
    // this line existed — a deliberate refusal reported to the caller as a server fault, which is
    // how a working control looks like a broken system.
    || /\b(?:cannot|can no longer) be replaced\b/i.test(m)
    // Ownership boundaries between ledgers. "CBS actual cost is Cost Ledger-owned; post a
    // canonical CostTransaction" is not bad input — it is a write aimed at the wrong authority.
    || /-owned;|is not allowed for\b/i.test(m)
    // Prerequisites the aggregate needs and does not have: no frozen evidence, no FX rate, no
    // handover, a closeout that is not ready. The request is well-formed; the state is not.
    || /\b(?:is|are) unavailable\b|\bis not ready\b|\bis not prepared\b|\bnot approval-ready\b|\bapproval not submitted\b|only available\b|has no immutable\b/i.test(m)
  ) {
    return { status: 409, code: 'CONFLICT' };
  }

  // 400 — validation and limit guards ("exceeds remaining ceiling", "validation failed",
  // "needs at least one line", "out of range", "dependency cycle", "duplicate …", "unknown …").
  // Also the pricing-sheet precondition guards: nothing to freeze/compare, no earlier version,
  // and "not linked to a quotation yet — create the quote shell first".
  if (
    /required|requires\b|\bmust\b|invalid|cannot|expected|validation failed|exceeds\b|out of range|needs a\b|needs at least|duplicate\b|dependency cycle|would create a cycle|gate blocked|no lines?\b|missing\b|negative\b|unknown\b|nothing to \w+|not linked|no earlier version/i.test(m)
    // References that name the wrong record, and evidence that contradicts the frozen snapshot.
    // These are all "what you sent does not line up with what is on file" — the caller fixes the
    // request, not the aggregate — which is what separates them from the 409s above.
    || /does not belong to\b|does not match\b|does not resolve to\b|is not present in\b|does not reproduce\b/i.test(m)
    || /\bis incomplete\b|\bis inconsistent\b|is not a valid\b|is not a \w+ fact\b/i.test(m)
  ) {
    return { status: 400, code: 'VALIDATION' };
  }

  return { status: 500, code: 'INTERNAL' };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<{ statusCode?: number; getHeader?: (k: string) => unknown; status: (c: number) => { json: (b: unknown) => void } }>();
    const req = http.getRequest<{ headers?: Record<string, unknown> }>();
    const correlationId = (req?.headers?.['x-correlation-id'] as string) ?? null;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as string | { message?: unknown; error?: unknown };
      message = typeof body === 'string' ? body : String((body?.message ?? exception.message));
      code = status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : status === 409 ? 'CONFLICT' : status === 400 ? 'VALIDATION' : 'HTTP_ERROR';
    } else if (exception instanceof Error) {
      const cls = classifyDomainMessage(exception.message);
      if (cls.status !== 500) {
        status = cls.status;
        code = cls.code;
        message = exception.message;
      } else {
        this.logger.error(`Unhandled: ${exception.message}`, exception.stack);
      }
    }

    res.status(status).json({ statusCode: status, error: HttpStatus[status] ?? 'Error', code, message, correlationId });
  }
}
