import { BadRequestException, Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { FormOverridesService, Permissions, TenantContext } from '@aura/core';
import {
  type FieldOverride,
  type FormOverrides,
  type FormSchema,
  employeeFormSchema,
  quotationFormSchema,
  subcontractFormSchema,
} from '@aura/shared';

/**
 * Form Designer P1 (Vol 15 §2.4). Lists the code-registered form schemas and
 * manages per-tenant override patches (labels, hints, placeholders, required,
 * visibility). The web renderer and assertFormValid both run on the merged
 * schema, so what an admin configures here is exactly what users see AND what
 * the API enforces. Guarded by `admin.forms.manage`.
 */
@Controller('admin/forms')
export class FormsAdminController {
  constructor(
    private readonly overrides: FormOverridesService,
    private readonly tenant: TenantContext,
  ) {}

  /** The designable schemas — code-registered in shared (grow this list as schemas land). */
  private schemas(): FormSchema[] {
    return [employeeFormSchema, quotationFormSchema, subcontractFormSchema()];
  }

  private schemaById(id: string): FormSchema {
    const s = this.schemas().find((x) => x.id === id);
    if (!s) throw new BadRequestException(`unknown form schema: ${id}`);
    return s;
  }

  @Permissions('admin.forms.manage')
  @Get()
  async list(): Promise<Array<{ id: string; entity: string; endpoint: string; fieldCount: number; overridden: number }>> {
    const stored = await this.overrides.list(this.tenant.get().tenantId);
    return this.schemas().map((s) => ({
      id: s.id,
      entity: s.entity,
      endpoint: s.endpoint,
      fieldCount: s.fields.length,
      overridden: Object.keys(stored[s.id]?.fields ?? {}).length,
    }));
  }

  /** One schema's designable fields + the current override patch. */
  @Permissions('admin.forms.manage')
  @Get(':id')
  async detail(@Param('id') id: string): Promise<{
    schema: { id: string; entity: string; endpoint: string; fields: Array<Pick<FormSchema['fields'][number], 'name' | 'label' | 'kind' | 'required' | 'hint' | 'placeholder' | 'hidden' | 'transient'>> };
    overrides: FormOverrides;
  }> {
    const s = this.schemaById(id);
    const o = await this.overrides.get(this.tenant.get().tenantId, id);
    return {
      schema: {
        id: s.id,
        entity: s.entity,
        endpoint: s.endpoint,
        fields: s.fields.map((f) => ({
          name: f.name,
          label: f.label,
          kind: f.kind,
          required: f.required,
          hint: f.hint,
          placeholder: f.placeholder,
          hidden: f.hidden,
          transient: f.transient,
        })),
      },
      overrides: o ?? { fields: {} },
    };
  }

  @Permissions('admin.forms.manage')
  @Put(':id')
  async save(@Param('id') id: string, @Body() dto: { fields?: Record<string, FieldOverride> }): Promise<{ ok: true }> {
    const s = this.schemaById(id);
    const known = new Set(s.fields.map((f) => f.name));
    const fields: Record<string, FieldOverride> = {};
    for (const [name, patch] of Object.entries(dto?.fields ?? {})) {
      if (!known.has(name)) throw new BadRequestException(`unknown field: ${name}`);
      const clean: FieldOverride = {};
      if (typeof patch?.label === 'string' && patch.label.trim()) clean.label = patch.label.trim();
      if (typeof patch?.hint === 'string') clean.hint = patch.hint.trim();
      if (typeof patch?.placeholder === 'string') clean.placeholder = patch.placeholder.trim();
      if (typeof patch?.required === 'boolean') clean.required = patch.required;
      if (typeof patch?.hidden === 'boolean') clean.hidden = patch.hidden;
      if (Object.keys(clean).length > 0) fields[name] = clean;
    }
    await this.overrides.set(this.tenant.get().tenantId, id, { fields });
    return { ok: true };
  }

  @Permissions('admin.forms.manage')
  @Delete(':id')
  async reset(@Param('id') id: string): Promise<{ removed: boolean }> {
    this.schemaById(id);
    return { removed: await this.overrides.remove(this.tenant.get().tenantId, id) };
  }
}

/**
 * Read-side for every user: the renderer fetches the tenant's effective override
 * patch for a schema id and merges it client-side (applyFormOverrides), so forms
 * look exactly like what the admin designed AND what assertFormValid enforces.
 * Permission derives to `forms.override.read` — a normal module read.
 */
@Controller('forms')
export class FormOverridesReadController {
  constructor(
    private readonly overrides: FormOverridesService,
    private readonly tenant: TenantContext,
  ) {}

  @Get(':id/overrides')
  async effective(@Param('id') id: string): Promise<FormOverrides> {
    return (await this.overrides.get(this.tenant.get().tenantId, id)) ?? { fields: {} };
  }
}
