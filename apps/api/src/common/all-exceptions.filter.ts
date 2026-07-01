import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

/**
 * Global exception filter + error taxonomy. Maps every uncaught error to a consistent
 * envelope `{ statusCode, error, code, message, correlationId }`:
 *  - HttpException → its own status/message.
 *  - Plain domain Errors → 404 (not found) / 409 (conflict/state) / 400 (validation) by
 *    message pattern; otherwise 500 (logged, message hidden).
 * Removes the need for per-controller try/catch→400 boilerplate.
 */
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
      const m = exception.message;
      if (/not found/i.test(m)) { status = 404; code = 'NOT_FOUND'; message = m; }
      else if (/already exists|is closed|requires approval|below the required|insufficient/i.test(m)) { status = 409; code = 'CONFLICT'; message = m; }
      else if (/required|must be|must not|invalid|cannot|expected/i.test(m)) { status = 400; code = 'VALIDATION'; message = m; }
      else { this.logger.error(`Unhandled: ${m}`, exception.stack); }
    }

    res.status(status).json({ statusCode: status, error: HttpStatus[status] ?? 'Error', code, message, correlationId });
  }
}
