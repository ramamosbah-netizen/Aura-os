import { describe, expect, it, vi } from 'vitest';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';
import { TenantContext } from '../tenancy/tenant-context';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';

describe('IdempotencyInterceptor', () => {
  it('bypasses when idempotency key is absent', async () => {
    const mockIdempotency = {
      getRecord: vi.fn(),
      saveRecord: vi.fn(),
    } as unknown as IdempotencyService;

    const mockTenant = {
      get: () => ({ tenantId: 't1', companyId: null, actorId: null }),
    } as unknown as TenantContext;

    const interceptor = new IdempotencyInterceptor(mockIdempotency, mockTenant);

    // Mock Nest Execution Context
    const mockRequest = { headers: {} };
    const mockResponse = { statusCode: 200 };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;

    const mockHandler = {
      handle: () => of({ success: true }),
    } as CallHandler;

    const result$ = await interceptor.intercept(mockContext, mockHandler);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ success: true });
    expect(mockIdempotency.getRecord).not.toHaveBeenCalled();
  });

  it('restores cached response and sets custom headers on cache hit', async () => {
    const mockIdempotency = {
      getRecord: vi.fn().mockResolvedValue({ status: 201, body: { restored: true } }),
      saveRecord: vi.fn(),
    } as unknown as IdempotencyService;

    const mockTenant = {
      get: () => ({ tenantId: 't1', companyId: null, actorId: null }),
    } as unknown as TenantContext;

    const interceptor = new IdempotencyInterceptor(mockIdempotency, mockTenant);

    const mockRequest = { headers: { 'idempotency-key': 'idem-123' } };
    const setHeaderSpy = vi.fn();
    const statusSpy = vi.fn();
    const mockResponse = {
      statusCode: 200,
      status: statusSpy,
      setHeader: setHeaderSpy,
    };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;

    const mockHandler = {
      handle: vi.fn(),
    } as unknown as CallHandler;

    const result$ = await interceptor.intercept(mockContext, mockHandler);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ restored: true });
    expect(statusSpy).toHaveBeenCalledWith(201);
    expect(setHeaderSpy).toHaveBeenCalledWith('X-Cache-Lookup', 'HIT - Idempotency Lock');
    expect(mockHandler.handle).not.toHaveBeenCalled();
  });
});
