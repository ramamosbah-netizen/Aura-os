import { Injectable, Logger } from '@nestjs/common';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF-OPEN';

@Injectable()
export class CircuitBreaker {
  private readonly logger = new Logger('CircuitBreaker');
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime?: number;

  constructor(
    private readonly threshold: number = 5,
    private readonly timeoutMs: number = 30000,
  ) {}

  getState(): CircuitState {
    return this.state;
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.timeoutMs) {
        this.state = 'HALF-OPEN';
        this.logger.warn('Circuit breaker state set to HALF-OPEN. Probing downstream...');
      } else {
        throw new Error('Circuit Breaker is OPEN. Request rejected.');
      }
    }

    try {
      const result = await action();
      if (this.state === 'HALF-OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.logger.log('Circuit breaker recovered. State reset to CLOSED.');
      }
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      this.logger.error(`Execution failed. Failure count: ${this.failureCount}. Error: ${(error as Error).message}`);

      if (this.failureCount >= this.threshold) {
        this.state = 'OPEN';
        this.logger.error(`Circuit breaker tripped to OPEN state. Requests will be blocked for ${this.timeoutMs}ms.`);
      }
      throw error;
    }
  }
}
