import { Injectable, Logger } from '@nestjs/common';

export interface AgentMessage {
  id: string;
  workflowInstanceId?: string;
  fromAgent: string;
  toAgent: string;
  task: string;
  context: Record<string, any>;
  output: any;
  confidenceScorePercent: number;
  status: 'sent' | 'received' | 'accepted' | 'rejected' | 'failed';
  timestamp: Date;
}

export interface CollaborationSession {
  sessionId: string;
  initiatingAgent: string;
  participantAgents: string[];
  messages: AgentMessage[];
  status: 'active' | 'completed' | 'terminated';
  startedAt: Date;
}

export interface SwarmSignal {
  topic: 'ai.signal.detected' | 'ai.tender.feasibility_requested' | 'ai.quotation.pricing_suggested' | 'ai.cashflow.anomaly_detected';
  correlationId: string;
  sourceAgent: string;
  targetAgent?: string;
  payload: Record<string, any>;
  timestamp: Date;
}

type SwarmHandler = (signal: SwarmSignal) => void | Promise<void>;

@Injectable()
export class AgentCollaborationService {
  private readonly logger = new Logger('AgentCollaborationService');
  private readonly messages: AgentMessage[] = [];
  private readonly sessions = new Map<string, CollaborationSession>();
  private readonly swarmListeners = new Map<string, Set<SwarmHandler>>();

  /**
   * Subscribe an agent handler to a Swarm topic.
   */
  subscribeSwarm(topic: SwarmSignal['topic'], handler: SwarmHandler): () => void {
    if (!this.swarmListeners.has(topic)) {
      this.swarmListeners.set(topic, new Set());
    }
    this.swarmListeners.get(topic)!.add(handler);
    return () => {
      this.swarmListeners.get(topic)?.delete(handler);
    };
  }

  /**
   * Publish a Swarm Signal onto the inter-agent bus.
   */
  async publishSwarmSignal(signal: Omit<SwarmSignal, 'timestamp'>): Promise<SwarmSignal> {
    const fullSignal: SwarmSignal = {
      ...signal,
      timestamp: new Date(),
    };

    this.logger.log(
      `[SwarmBus] 🐝 ${fullSignal.sourceAgent} published topic "${fullSignal.topic}" (Correlation: ${fullSignal.correlationId})`,
    );

    const handlers = this.swarmListeners.get(fullSignal.topic);
    if (handlers && handlers.size > 0) {
      for (const handler of handlers) {
        try {
          await handler(fullSignal);
        } catch (err) {
          this.logger.error(`[SwarmBus] Error executing swarm handler for ${fullSignal.topic}: ${err}`);
        }
      }
    }

    return fullSignal;
  }

  /**
   * Dispatch a structured inter-agent collaboration message over the bus.
   */
  dispatchMessage(msg: Omit<AgentMessage, 'id' | 'timestamp' | 'status'>): AgentMessage {
    const fullMessage: AgentMessage = {
      ...msg,
      id: `msg-${Math.random().toString(36).slice(2, 9)}`,
      status: 'sent',
      timestamp: new Date(),
    };

    this.messages.push(fullMessage);
    this.logger.log(
      `[CollaborationBus] Message ${fullMessage.id}: ${fullMessage.fromAgent} ➔ ${fullMessage.toAgent} [Task: "${fullMessage.task}"] (Confidence: ${fullMessage.confidenceScorePercent}%)`,
    );

    // Record to session if associated with a workflow instance
    if (fullMessage.workflowInstanceId) {
      let session = this.sessions.get(fullMessage.workflowInstanceId);
      if (!session) {
        session = {
          sessionId: fullMessage.workflowInstanceId,
          initiatingAgent: fullMessage.fromAgent,
          participantAgents: [fullMessage.fromAgent],
          messages: [],
          status: 'active',
          startedAt: new Date(),
        };
        this.sessions.set(fullMessage.workflowInstanceId, session);
      }
      if (!session.participantAgents.includes(fullMessage.toAgent)) {
        session.participantAgents.push(fullMessage.toAgent);
      }
      session.messages.push(fullMessage);
    }

    return fullMessage;
  }

  listMessages(workflowInstanceId?: string): AgentMessage[] {
    if (workflowInstanceId) {
      return this.messages.filter((m) => m.workflowInstanceId === workflowInstanceId);
    }
    return [...this.messages];
  }

  listSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values());
  }
}
