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
  if (/not found|^no (payroll|schedule|.* records?|.* runs?)\b/i.test(m)) return { status: 404, code: 'NOT_FOUND' };

  // 409 — state-transition guards: the request is well-formed but the aggregate's current
  // state forbids it ("only a draft agreement can be activated", "is already disposed", …).
  if (
    /\balready\b|is closed|is inactive|is not (in|active|approved)|\bonly\b.*\bcan\b|can only\b|requires approval|below the required|insufficient|outside its validity|belongs to another/i.test(m)
  ) {
    return { status: 409, code: 'CONFLICT' };
  }

  // 400 — validation and limit guards ("exceeds remaining ceiling", "validation failed",
  // "needs at least one line", "out of range", "dependency cycle", "duplicate …", "unknown …").
  if (
    /required|requires\b|\bmust\b|invalid|cannot|expected|validation failed|exceeds\b|out of range|needs a\b|needs at least|duplicate\b|dependency cycle|gate blocked|no lines?\b|missing\b|negative\b|unknown\b/i.test(m)
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
