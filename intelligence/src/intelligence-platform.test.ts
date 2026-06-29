import { describe, expect, it, beforeEach } from 'vitest';
import { AiContextEngine } from './ai-context.engine';
import { ProcessMiningService } from './process-mining.service';
import { McpServerService } from './mcp-server.service';
import { AiPlatformService } from './ai-platform.service';
import { AiGuardrailsService } from './ai-guardrails.service';

describe('Next-Gen Intelligence Platform — Phase 6.5', () => {
  // ── AI Context Engine ────────────────────────────────────────────────────────
  describe('AiContextEngine', () => {
    let engine: AiContextEngine;
    beforeEach(() => { engine = new AiContextEngine(); });

    it('should capture digital twin snapshots and build context window', async () => {
      await engine.captureSnapshot({ tenantId: 't1', entityType: 'project', entityId: 'p-001',
        snapshotData: { name: 'Tower A', status: 'active', budget: 5_000_000, progress: 42 } });
      await engine.captureSnapshot({ tenantId: 't1', entityType: 'invoice', entityId: 'inv-101',
        snapshotData: { amount: 150_000, status: 'pending_approval', supplier: 'Steel Corp' } });

      const ctx = await engine.buildContextWindow({
        tenantId: 't1',
        query: 'What is the status of active projects and pending invoices?',
        entityTypes: ['project', 'invoice'],
      });

      expect(ctx.relevantEntities).toHaveLength(2);
      expect(ctx.tokenEstimate).toBeGreaterThan(0);
      expect(ctx.systemContext).toContain('AURA OS');
    });

    it('should filter context window by entity type', async () => {
      await engine.captureSnapshot({ tenantId: 't1', entityType: 'project', entityId: 'p-002', snapshotData: {} });
      await engine.captureSnapshot({ tenantId: 't1', entityType: 'asset', entityId: 'a-001', snapshotData: {} });

      const ctx = await engine.buildContextWindow({ tenantId: 't1', query: 'projects only', entityTypes: ['project'] });
      expect(ctx.relevantEntities.every((e) => e.entityType === 'project')).toBe(true);
    });
  });

  // ── Process Mining ───────────────────────────────────────────────────────────
  describe('ProcessMiningService', () => {
    let svc: ProcessMiningService;
    beforeEach(() => { svc = new ProcessMiningService(); });

    it('should detect bottleneck in invoice approval process', () => {
      const base = Date.now();
      const timeOffsets = [0, 1, 9, 10]; // hours: gap between submitted(1h) → approved(9h) = 8h is the largest
      ['created', 'submitted', 'approved', 'paid'].forEach((activity, i) => {
        svc.recordEvent({
          caseId: 'invoice-inv-001',
          activity,
          timestamp: new Date(base + timeOffsets[i] * 3_600_000),
        });
      });

      const trace = svc.analyzeTrace('invoice-inv-001');
      expect(trace).not.toBeNull();
      expect(trace!.events).toHaveLength(4);
      expect(trace!.bottleneck).toBe('submitted'); // Largest gap: submitted(1h)→approved(9h)
    });

    it('should forecast cashflow with trend projection', () => {
      const forecast = svc.forecastCashflow({
        tenantId: 't1',
        targetPeriod: '2026-07',
        historicalInflows: [400_000, 420_000, 450_000, 480_000, 500_000, 520_000],
        historicalOutflows: [350_000, 360_000, 370_000, 380_000, 390_000, 400_000],
      });

      expect(forecast.projectedInflow).toBeGreaterThan(400_000);
      expect(forecast.projectedNet).toBeGreaterThan(0);
      expect(forecast.confidence).toBeGreaterThan(0);
    });
  });

  // ── MCP Server ───────────────────────────────────────────────────────────────
  describe('McpServerService', () => {
    let svc: McpServerService;
    beforeEach(() => { svc = new McpServerService(); });

    it('should list registered tools', async () => {
      svc.registerTool(
        { name: 'get_project_status', description: 'Get live project status',
          inputSchema: { type: 'object', properties: { projectId: { type: 'string', description: 'Project ID' } } } },
        async (args) => ({ projectId: args.projectId, status: 'active', progress: 72 })
      );

      const response = await svc.handle({ method: 'tools/list' });
      expect(response.result.tools).toHaveLength(1);
      expect(response.result.tools[0].name).toBe('get_project_status');
    });

    it('should call a registered tool and return result', async () => {
      svc.registerTool(
        { name: 'get_balance', description: 'Get account balance',
          inputSchema: { type: 'object', properties: { account: { type: 'string', description: 'Account ID' } } } },
        async (args) => ({ account: args.account, balance: 250_000 })
      );

      const response = await svc.handle({ method: 'tools/call', params: { name: 'get_balance', arguments: { account: 'acc-001' } } });
      expect(response.result.balance).toBe(250_000);
    });
  });

  // ── AI Platform ──────────────────────────────────────────────────────────────
  describe('AiPlatformService', () => {
    let svc: AiPlatformService;
    beforeEach(() => { svc = new AiPlatformService(); });

    it('should render prompt with variable substitution', () => {
      svc.registerPrompt({
        key: 'invoice-summary', label: 'Invoice Summary', version: 1, modelHint: 'gemini-2.0-flash', tags: ['finance'],
        systemPrompt: 'You are an expert financial analyst for {{companyName}}.',
        userTemplate: 'Summarize invoice {{invoiceId}} worth {{amount}} AED.',
      });

      const rendered = svc.renderPrompt('invoice-summary', { companyName: 'ACME', invoiceId: 'INV-001', amount: '50,000' });
      expect(rendered?.user).toContain('INV-001');
      expect(rendered?.system).toContain('ACME');
    });

    it('should run an agent using registered tools', async () => {
      svc.registerTool({
        key: 'check-credit', label: 'Check Credit', description: 'Check supplier credit limit',
        inputSchema: {}, outputSchema: {},
        handler: async (input) => ({ supplier: input.supplier, creditLimit: 500_000 }),
      });
      svc.registerAgent({
        key: 'procurement-agent', label: 'Procurement Agent',
        description: 'Automates PO validation', promptKey: 'po-prompt',
        toolKeys: ['check-credit'], model: 'gemini-2.0-flash', maxIterations: 3, enabled: true,
      });

      const result = await svc.runAgent('procurement-agent', { supplier: 'Steel Corp' });
      expect(result.agentKey).toBe('procurement-agent');
      expect(result.steps).toBe(1);
      expect(result.output.toolOutputs[0].tool).toBe('check-credit');
    });
  });

  // ── AI Guardrails ────────────────────────────────────────────────────────────
  describe('AiGuardrailsService', () => {
    let svc: AiGuardrailsService;
    beforeEach(() => { svc = new AiGuardrailsService(); });

    it('should block content containing forbidden keywords', () => {
      svc.registerRule({ key: 'no-threats', label: 'No Threats', type: 'blocked_keywords',
        enabled: true, config: { keywords: ['hack', 'malware', 'exploit'] } });

      const result = svc.check('How to exploit system vulnerabilities?');
      expect(result.passed).toBe(false);
      expect(result.violations[0].reason).toContain('exploit');
    });

    it('should mask PII in AI output', () => {
      svc.registerRule({ key: 'pii-mask', label: 'PII Masking', type: 'pii_mask',
        enabled: true, config: { piiPatterns: ['\\b\\d{3}-\\d{2}-\\d{4}\\b'] } });

      const result = svc.check('Employee SSN: 123-45-6789 is confidential.');
      expect(result.sanitizedContent).toContain('[REDACTED]');
      expect(result.sanitizedContent).not.toContain('123-45-6789');
    });

    it('should pass clean content with no violations', () => {
      svc.registerRule({ key: 'token-limit', label: 'Token Limit', type: 'max_tokens',
        enabled: true, config: { maxTokens: 1000 } });

      const result = svc.check('This is a normal business query.', 50);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });
});
