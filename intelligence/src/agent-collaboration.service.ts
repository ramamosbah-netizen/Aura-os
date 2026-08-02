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

@Injectable()
export class AgentCollaborationService {
  private readonly logger = new Logger('AgentCollaborationService');
  private readonly messages: AgentMessage[] = [];
  private readonly sessions = new Map<string, CollaborationSession>();

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
