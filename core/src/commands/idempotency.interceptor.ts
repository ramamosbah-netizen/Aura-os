import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';
import { TenantContext } from '../tenancy/tenant-context';
import type { Response, Request } from 'express';

/** Replaying a read is harmless, so only mutations take a lease. */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Gives `Idempotency-Key` its meaning: a mutation carrying one runs at most once per
 * tenant, and a replay of the same key returns the first response instead of executing
 * again. This is what makes the offline queue safe to flush — a field device that loses
 * the network after the server committed will resend the same key on reconnect.
 *
 * Bound globally in apps/api/src/app.module.ts. Requests without the header pass straight
 * through, so this is inert for every caller that does not opt in.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger('IdempotencyInterceptor');

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly tenant: TenantContext,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    if (context.getType() !== 'http') return next.handle();

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const header = request.headers['idempotency-key'];
    const key = Array.isArray(header) ? undefined : header;
    if (!key || !MUTATING.has(request.method?.toUpperCase() ?? '')) {
      return next.handle();
    }

    const { tenantId, actorId } = this.tenant.get();
    const endpoint = request.originalUrl ?? request.url ?? '';

    // A mismatched payload or a live lease throws ConflictException here, which the
    // exception filter renders as the 409 the offline client already handles.
    const lease = await this.idempotency.acquireLease(
      tenantId,
      key,
      actorId ?? '',
      endpoint,
      request.method,
      request.body,
    );

    if (lease.status === 'cached') {
      const cached = lease.cachedResponse!;
      this.logger.log(`Idempotent replay ${request.method} ${endpoint} key=${key}`);
      response.status(cached.status);
      response.setHeader('X-Idempotent-Replay', 'true');
      return of(cached.body);
    }

    return next.handle().pipe(
      // concatMap (not tap) so the lease is durably closed before the response is emitted —
      // otherwise a replay arriving immediately after could miss the cached record.
      concatMap(async (body) => {
        const statusCode = response.statusCode || HttpStatus.OK;
        if (statusCode >= 200 && statusCode < 300) {
          await this.idempotency.completeLease(tenantId, key, statusCode, body ?? {});
        } else {
          await this.idempotency.releaseLease(tenantId, key);
        }
        return body;
      }),
      catchError((err) =>
        // Free the key so the client's retry is not blocked for the whole lease window.
        from(this.idempotency.releaseLease(tenantId, key)).pipe(
          concatMap(() => throwError(() => err)),
        ),
      ),
    );
  }
}
