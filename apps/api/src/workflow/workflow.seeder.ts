import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { makeWorkflowDefinition } from '@aura/shared';
import { AccessService, WorkflowService } from '@aura/core';

/**
 * Seeds a demo workflow + access grant at boot so the workflow endpoints are
 * exercisable end-to-end: a generic PO-approval flow whose `approve`/`reject`
 * transitions require `procurement.po.approve`, plus a user (u-demo) granted that
 * permission in company c-demo with a 100,000 approval limit (ABAC ceiling).
 */
@Injectable()
export class WorkflowSeeder implements OnModuleInit {
  private readonly logger = new Logger('WorkflowSeeder');

  constructor(
    private readonly workflow: WorkflowService,
    private readonly access: AccessService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.workflow.registerDefinition(
      makeWorkflowDefinition({
        key: 'po.approval',
        name: 'Purchase Order Approval',
        tenantId: null, // global
        initialState: 'draft',
        states: ['draft', 'submitted', 'approved', 'rejected'],
        terminalStates: ['approved', 'rejected'],
        transitions: [
          { from: 'draft', to: 'submitted', action: 'submit' },
          { from: 'submitted', to: 'approved', action: 'approve', permission: 'procurement.po.approve' },
          { from: 'submitted', to: 'rejected', action: 'reject', permission: 'procurement.po.approve' },
        ],
      }),
    );

    this.access.registerRole({ id: 'procurementMgr', name: 'Procurement Manager', permissions: ['procurement.*'] });
    this.access.grant({
      userId: 'u-demo',
      roleId: 'procurementMgr',
      scope: { kind: 'org', level: 'company', id: 'c-demo' },
      attributes: { approvalLimit: 100000 },
    });

    this.logger.log("Seeded 'po.approval' workflow + demo grant (u-demo can approve ≤100000 in c-demo).");
  }
}
