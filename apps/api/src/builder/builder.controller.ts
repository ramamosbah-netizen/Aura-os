import { Body, Controller, Get, Param, Post, Query, Logger } from '@nestjs/common';
import {
  FormRegistryService,
  type FormDefinition,
  ApprovalMatrixService,
  type ApprovalMatrixConfig,
  EntityRegistryService,
  TenantContext,
} from '@aura/core';

/**
 * BuilderController — Admin REST API for the dynamic Builder Platform.
 *
 * Exposes CRUD endpoints for:
 *   • Form Definitions (JSON Schema-driven layouts)
 *   • Approval Matrices (threshold routing rules)
 *   • Entity Registry (custom entity schema definitions)
 *
 * All operations are tenant-scoped via TenantContext.
 *
 * Blueprint Reference: Phase 8 — Week 1-2, Task K1 (Builder API Missing Layer)
 */
@Controller('v1/builder')
export class BuilderController {
  private readonly logger = new Logger('BuilderController');

  constructor(
    private readonly forms: FormRegistryService,
    private readonly approvals: ApprovalMatrixService,
    private readonly entities: EntityRegistryService,
    private readonly tenant: TenantContext,
  ) {}

  private tenantId(): string {
    return this.tenant.get().tenantId ?? 'default';
  }

  // ─── Form Definition CRUD ─────────────────────────────────────────────────

  @Post('forms')
  async createForm(@Body() body: Omit<FormDefinition, 'id'>): Promise<FormDefinition> {
    const tenantId = body.tenantId || this.tenantId();
    this.logger.log(`Creating form "${body.formKey}" for tenant ${tenantId}`);
    return this.forms.register({ ...body, tenantId });
  }

  @Get('forms')
  async listForms(@Query('tenantId') tenantId?: string): Promise<FormDefinition[]> {
    return this.forms.list(tenantId || this.tenantId());
  }

  @Get('forms/:formKey')
  async getForm(
    @Param('formKey') formKey: string,
    @Query('tenantId') tenantId?: string,
    @Query('version') version?: string,
  ): Promise<FormDefinition | null> {
    return this.forms.get(tenantId || this.tenantId(), formKey, version ? Number(version) : undefined);
  }

  @Post('forms/:formKey/validate')
  async validateFormData(
    @Param('formKey') formKey: string,
    @Body() data: Record<string, any>,
    @Query('tenantId') tenantId?: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const tid = tenantId || this.tenantId();
    const form = await this.forms.get(tid, formKey);
    if (!form) return { valid: false, errors: [`Form "${formKey}" not found.`] };
    const errors = this.forms.validate(form, data);
    return { valid: errors.length === 0, errors };
  }

  // ─── Approval Matrix CRUD ─────────────────────────────────────────────────

  @Post('approvals')
  async createApprovalMatrix(@Body() body: ApprovalMatrixConfig) {
    const tenantId = body.tenantId || this.tenantId();
    this.logger.log(`Configuring approval matrix for "${body.entityType}" in tenant ${tenantId}`);
    await this.approvals.configure({ ...body, tenantId });
    return { success: true, entityType: body.entityType, tenantId };
  }

  @Post('approvals/:entityType/evaluate')
  async evaluateApproval(
    @Param('entityType') entityType: string,
    @Body() payload: Record<string, any>,
    @Query('tenantId') tenantId?: string,
  ) {
    const result = await this.approvals.resolve(tenantId || this.tenantId(), entityType, payload);
    return result ?? { matched: false, message: 'No matching approval rule found.' };
  }

  // ─── Entity Registry CRUD ─────────────────────────────────────────────────

  @Post('entities')
  async registerEntity(@Body() body: {
    tenantId?: string;
    entityKey: string;
    label: string;
    module: string;
    schema: { fields: Array<{ key: string; label: string; type: string; required: boolean; indexed?: boolean; searchable?: boolean }>; labelField: string };
  }) {
    const tenantId = body.tenantId || this.tenantId();
    return this.entities.register({ tenantId, entityKey: body.entityKey, label: body.label, module: body.module, schema: body.schema });
  }

  @Get('entities')
  async listEntities(@Query('tenantId') tenantId?: string, @Query('module') module?: string) {
    return this.entities.list(tenantId || this.tenantId(), module);
  }

  @Get('entities/:entityKey')
  async getEntity(
    @Param('entityKey') entityKey: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.entities.get(tenantId || this.tenantId(), entityKey);
  }
}
