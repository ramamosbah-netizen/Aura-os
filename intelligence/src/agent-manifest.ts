// ── Agent Manifest Schema (Declarative Unit) ─────────────────────────────────

export interface AgentManifest {
  id: string;
  name: string;
  version: string;
  role: string;
  description: string;
  category: 'procurement' | 'finance' | 'projects' | 'tendering' | 'hse' | 'general';
  
  // Skills & Capabilities
  skills: string[];                      // Skill keys
  capabilities: string[];                // Granular RBAC capabilities (e.g. 'procurement.po.create')
  
  // Memory & Knowledge Tiers
  memoryTiers: ('session' | 'working' | 'knowledge' | 'business' | 'user' | 'digital_twin')[];
  
  // Model Strategy
  modelStrategy: {
    preferredModel: 'claude-3-5-sonnet' | 'gemini-2.0-flash' | 'gpt-4o' | 'claude-3-opus' | 'auto';
    fallbackModel: string;
    maxIterations: number;
  };
  
  // Governance & Policies
  guardrails: {
    requiresApproval: boolean;
    policyRules: string[];               // Policy keys enforced
  };
  
  // Associated Workflows
  workflows: string[];
}
