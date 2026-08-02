import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AiPlatformService } from './ai-platform.service';

export interface CapabilityCheckInput {
  agentId: string;
  requiredCapability: string;
  tenantId: string;
  actorId?: string;
}

@Injectable()
export class CapabilityGuardService {
  private readonly logger = new Logger('CapabilityGuardService');

  constructor(private readonly aiPlatform: AiPlatformService) {}

  /**
   * Verify if an agent has been granted the required capability.
   */
  canExecute(agentId: string, requiredCapability: string): boolean {
    const agent = this.aiPlatform.getAgent(agentId);
    if (!agent) {
      this.logger.warn(`Capability check failed: Agent "${agentId}" not found`);
      return false;
    }

    if (!agent.enabled) {
      this.logger.warn(`Capability check failed: Agent "${agentId}" is disabled`);
      return false;
    }

    const granted = agent.grantedCapabilities ?? [];
    const allowed = granted.includes(requiredCapability) || granted.includes('*');

    if (!allowed) {
      this.logger.warn(
        `Capability DENIED for agent "${agentId}": required "${requiredCapability}", granted: [${granted.join(', ')}]`,
      );
    } else {
      this.logger.log(`Capability GRANTED for agent "${agentId}": "${requiredCapability}"`);
    }

    return allowed;
  }

  /**
   * Assert capability permission, throwing an UnauthorizedException if denied.
   */
  assertCapability(agentId: string, requiredCapability: string): void {
    if (!this.canExecute(agentId, requiredCapability)) {
      throw new UnauthorizedException(
        `Agent "${agentId}" lacks required capability permission "${requiredCapability}". Execution blocked.`,
      );
    }
  }
}
