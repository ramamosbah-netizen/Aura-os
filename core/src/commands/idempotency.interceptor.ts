import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';
import { TenantContext } from '../tenancy/tenant-context';
import type { Response, Request } from 'express';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger('IdempotencyInterceptor');

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly tenant: TenantContext,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const idempotencyKey = request.headers['idempotency-key'] || request.headers['Idempotency-Key'];
    if (!idempotencyKey || Array.isArray(idempotencyKey)) {
      return next.handle();
    }

    const { tenantId } = this.tenant.get();
    
    // Check if key has cached response in registry
    const cached = await this.idempotency.getRecord(tenantId, idempotencyKey);
    if (cached) {
      this.logger.log(`Idempotency intercept hit for key: ${idempotencyKey}`);
      response.status(cached.status);
      response.setHeader('X-Cache-Lookup', 'HIT - Idempotency Lock');
      return of(cached.body);
    }

    // Wrap execution to save the response on completion
    return next.handle().pipe(
      tap(async (body) => {
        const statusCode = response.statusCode || HttpStatus.OK;
        // Only cache successful mutations (e.g. 200, 201)
        if (statusCode >= 200 && statusCode < 300) {
          await this.idempotency.saveRecord(tenantId, idempotencyKey, statusCode, body);
        }
      }),
    );
  }
}
