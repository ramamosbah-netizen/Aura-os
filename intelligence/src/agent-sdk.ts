import { AgentManifest } from './agent-manifest';

// ── Agent SDK (Developer Ergonomics) ─────────────────────────────────────────

export function defineAgent(manifest: AgentManifest): AgentManifest {
  if (!manifest.id || !manifest.name || !manifest.version) {
    throw new Error('[AgentSDK] Manifest requires id, name, and version.');
  }
  return {
    ...manifest,
    skills: manifest.skills ?? [],
    capabilities: manifest.capabilities ?? [],
    memoryTiers: manifest.memoryTiers ?? ['session', 'working'],
    guardrails: manifest.guardrails ?? { requiresApproval: true, policyRules: [] },
    workflows: manifest.workflows ?? [],
  };
}

export interface SkillDefinition {
  key: string;
  label: string;
  version: string;
  description: string;
  promptKey: string;
  requiredTools: string[];
  requiredCapabilities: string[];
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  evaluationCriteria?: string;
}

export function defineSkill(skill: SkillDefinition): SkillDefinition {
  return skill;
}

export interface AgentSdkWorkflowDefinition {
  key: string;
  name: string;
  version: string;
  description: string;
  steps: Array<{
    stepId: string;
    agentKey: string;
    skillKey: string;
    nextSteps?: string[];
  }>;
}

export function defineWorkflow(workflow: AgentSdkWorkflowDefinition): AgentSdkWorkflowDefinition {
  return workflow;
}
