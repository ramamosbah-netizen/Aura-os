import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { AccessDeniedError } from '@aura/shared';

/**
 * Maps the kernel's `AccessDeniedError` to a clean HTTP 403 at the API edge — instead of
 * the generic 500 a thrown Error would produce. One place, every module benefits.
 */
@Catch(AccessDeniedError)
export class AccessDeniedFilter implements ExceptionFilter {
  catch(err: AccessDeniedError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<{ status: (code: number) => { json: (body: unknown) => void } }>();
    res.status(HttpStatus.FORBIDDEN).json({ statusCode: 403, error: 'Forbidden', message: err.message });
  }
}
