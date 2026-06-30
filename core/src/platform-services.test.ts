import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from './reliability/circuit-breaker';
import { RateLimiter } from './reliability/rate-limiter';
import { NotificationService } from './notifications/notification.service';
import { InMemoryNotificationStore } from './notifications/notification-store';
import { FeatureFlagService } from './config/feature-flag.service';
import { BackgroundJobService } from './jobs/background-job.service';

describe('Platform Services - Phase 3', () => {
  describe('CircuitBreaker', () => {
    it('should trip to OPEN after threshold failures and reject requests', async () => {
      const breaker = new CircuitBreaker(3, 100); // threshold = 3, timeout = 100ms
      const badAction = () => Promise.reject(new Error('fail'));

      await expect(breaker.execute(badAction)).rejects.toThrow('fail');
      await expect(breaker.execute(badAction)).rejects.toThrow('fail');
      await expect(breaker.execute(badAction)).rejects.toThrow('fail');

      expect(breaker.getState()).toBe('OPEN');

      // Subsequent call should be instantly rejected by the breaker itself
      await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(
        'Circuit Breaker is OPEN. Request rejected.'
      );

      // Wait for breaker timeout window to pass
      await new Promise((resolve) => setTimeout(resolve, 120));

      // Circuit breaker goes HALF-OPEN and permits trial call
      const result = await breaker.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('RateLimiter', () => {
    it('should limit requests exceeding limit within window', async () => {
      const limiter = new RateLimiter();
      const key = 'user-1';

      expect(await limiter.isAllowed(key, 2, 500)).toBe(true);
      expect(await limiter.isAllowed(key, 2, 500)).toBe(true);
      expect(await limiter.isAllowed(key, 2, 500)).toBe(false); // third request blocked

      // Wait for window to clear
      await new Promise((resolve) => setTimeout(resolve, 510));
      expect(await limiter.isAllowed(key, 2, 500)).toBe(true);
    });
  });

  describe('NotificationService', () => {
    it('should route notifications across multiple channels successfully', async () => {
      const svc = new NotificationService(new InMemoryNotificationStore());
      const results = await svc.send({
        tenantId: 't1',
        userId: 'u-admin',
        title: 'Security Alert',
        body: 'Unauthorized access detected from IP.',
        channels: ['email', 'sms', 'slack'],
      });

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('FeatureFlagService', () => {
    it('should fallback to default and apply per-tenant overrides', async () => {
      const svc = new FeatureFlagService(null); // In-memory local fallback

      await svc.setFlag('ai-auto-pricing', false, [
        { tenantId: 't-premium', enabled: true },
        { tenantId: 't-standard', enabled: false },
      ]);

      expect(await svc.isEnabled('ai-auto-pricing', 't-other')).toBe(false);
      expect(await svc.isEnabled('ai-auto-pricing', 't-premium')).toBe(true);
      expect(await svc.isEnabled('ai-auto-pricing', 't-standard')).toBe(false);
    });
  });

  describe('BackgroundJobService', () => {
    it('should enqueue and successfully process background jobs', async () => {
      const svc = new BackgroundJobService(null); // In-memory local fallback
      const processorSpy = vi.fn().mockResolvedValue(undefined);

      const jobId = await svc.enqueue('t1', 'pdf-export', { docId: 'doc-123' });
      expect(jobId).toBeDefined();

      const processedCount = await svc.pollAndProcess('pdf-export', processorSpy);
      expect(processedCount).toBe(1);
      expect(processorSpy).toHaveBeenCalledWith({ docId: 'doc-123' }, 't1');
    });
  });
});
