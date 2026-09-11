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

  // 409 — state-transition guards: the request is well-formed but the aggregate's current
  // state forbids it ("only a draft agreement can be activated", "is already disposed", …).
  if (
    /\balready\b|\blineage\b.*\bwithout\b|is closed|is inactive|is not (in|active|approved)|is not a locked|immutable after handover|require(?:s)? a signed contract|\bonly\b.*\bcan\b|can only\b|requires approval|approval blocked|readiness checklist|below the required|insufficient|outside its validity|belongs to another|belongs to a different/i.test(m)
    // Immutability and concurrency. A signed revision, an approved baseline and a certified
    // payment certificate all refuse the same way: the record is closed to further writes, or
    // someone else moved it first. The caller must re-read and use the governed correction path.
    // "…has changed since this proposal was produced" (§22 governed acceptance) is the same shape:
    // the schedule moved after the proposal was cut, so the stale proposal cannot be promoted.
    || /\bis immutable\b|changed concurrently|changed since\b|^conflicting\b|dedupe conflict/i.test(m)
    // Ownership boundaries between ledgers. "CBS actual cost is Cost Ledger-owned; post a
    // canonical CostTransaction" is not bad input — it is a write aimed at the wrong authority.
    || /-owned;|is not allowed for\b/i.test(m)
    // Prerequisites the aggregate needs and does not have: no frozen evidence, no FX rate, no
    // handover, a closeout that is not ready. The request is well-formed; the state is not.
    || /\bis unavailable\b|\bis not ready\b|\bis not prepared\b|\bapproval not submitted\b|only available\b|has no immutable\b/i.test(m)
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
