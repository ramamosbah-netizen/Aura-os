import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AuditService, FormCustomValuesService, FormOverridesService, Permissions, TenantContext, type FormOverridesStatus } from '@aura/core';
import {
  ADDED_FIELD_NAME,
  validateFormOverrides,
  type AddedField,
  type FieldOverride,
  type FieldValidation,
  type FormOverrides,
  type FormRule,
  type FormSchema,
  type LayoutNode,
  employeeFormSchema,
  quotationFormSchema,
  subcontractFormSchema,
} from '@aura/shared';

const ADDED_KINDS = new Set(['text', 'number', 'select', 'date', 'textarea']);
// Designer-authorable validation types — 'custom' (plugin validators) stays code-side.
const VALIDATION_TYPES = new Set(['min', 'max', 'minLength', 'maxLength', 'pattern']);

/** Keep only well-shaped declarative validation rules (deep checks run in validateFormOverrides). */
function cleanValidation(input: unknown): FieldValidation[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: FieldValidation[] = [];
  for (const v of input) {
    if (!v || typeof v !== 'object' || !VALIDATION_TYPES.has((v as FieldValidation).type)) continue;
    const r = v as FieldValidation;
    out.push({
      type: r.type,
      ...(r.value !== undefined ? { value: r.value } : {}),
      ...(typeof r.message === 'string' && r.message.trim() ? { message: r.message.trim() } : {}),
    });
  }
  return out;
}

/**
 * Form Designer (Vol 15 §2.4). P1: per-tenant override patches (labels, hints,
 * placeholders, required, visibility). P2: designer-added `cf_*` custom fields,
 * field ordering, and the draft→publish cycle — the designer edits a DRAFT; the
 * renderer and assertFormValid only ever see the PUBLISHED patch, so half-finished
 * designs never leak into the product. Guarded by `admin.forms.manage`.
 */
@Controller('admin/forms')
export class FormsAdminController {
  constructor(
    private readonly overrides: FormOverridesService,
    private readonly customValues: FormCustomValuesService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
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

  /** One schema's designable fields + the DRAFT patch (falls back to published) + status. */
  @Permissions('admin.forms.manage')
  @Get(':id')
  async detail(@Param('id') id: string): Promise<{
    schema: {
      id: string;
      entity: string;
      endpoint: string;
      fields: Array<
        Pick<FormSchema['fields'][number], 'name' | 'label' | 'kind' | 'required' | 'hint' | 'placeholder' | 'hidden' | 'transient' | 'formula'> & {
          options?: string[];
          validationCount?: number;
        }
      >;
      ruleCount: number;
      hasLayout: boolean;
    };
    overrides: FormOverrides;
    status: FormOverridesStatus;
  }> {
    const s = this.schemaById(id);
    const tenantId = this.tenant.get().tenantId;
    const [o, status] = await Promise.all([
      this.overrides.getDraft(tenantId, id),
      this.overrides.status(tenantId, id),
    ]);
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
          formula: f.formula,
          ...(f.options?.length ? { options: f.options.map((op) => op.value) } : {}),
          ...(f.validation?.length ? { validationCount: f.validation.length } : {}),
        })),
        ruleCount: s.rules?.length ?? 0,
        hasLayout: (s.layout?.length ?? 0) > 0,
      },
      overrides: o ?? { fields: {} },
      status,
    };
  }

  /** Save designer edits to the DRAFT — the live form is untouched until publish. */
  @Permissions('admin.forms.manage')
  @Put(':id')
  async save(
    @Param('id') id: string,
    @Body() dto: {
      fields?: Record<string, FieldOverride>;
      added?: AddedField[];
      order?: string[];
      rules?: FormRule[];
      layout?: LayoutNode[];
    },
  ): Promise<{ ok: true }> {
    const s = this.schemaById(id);
    const known = new Set(s.fields.map((f) => f.name));
    const codeFormula = new Map(s.fields.filter((f) => f.formula).map((f) => [f.name, f.formula]));
    const fields: Record<string, FieldOverride> = {};
    for (const [name, patch] of Object.entries(dto?.fields ?? {})) {
      if (!known.has(name)) throw new BadRequestException(`unknown field: ${name}`);
      const clean: FieldOverride = {};
      if (typeof patch?.label === 'string' && patch.label.trim()) clean.label = patch.label.trim();
      if (typeof patch?.hint === 'string') clean.hint = patch.hint.trim();
      if (typeof patch?.placeholder === 'string') clean.placeholder = patch.placeholder.trim();
      if (typeof patch?.required === 'boolean') clean.required = patch.required;
      if (typeof patch?.hidden === 'boolean') clean.hidden = patch.hidden;
      // P3: a non-empty formula overrides; '' is only meaningful as "clear the code formula".
      if (typeof patch?.formula === 'string') {
        const f = patch.formula.trim();
        if (f) clean.formula = f;
        else if (codeFormula.has(name)) clean.formula = '';
      }
      const validation = cleanValidation(patch?.validation);
      if (validation && validation.length > 0) clean.validation = validation;
      if (Object.keys(clean).length > 0) fields[name] = clean;
    }

    // P2: added custom fields — cf_ prefix, safe kinds, no clashes, selects need options.
    const added: AddedField[] = [];
    const seen = new Set<string>();
    for (const a of dto?.added ?? []) {
      const name = a?.name?.trim() ?? '';
      if (!ADDED_FIELD_NAME.test(name)) throw new BadRequestException(`added field name must match ${ADDED_FIELD_NAME}: "${name}"`);
      if (known.has(name)) throw new BadRequestException(`added field clashes with a code field: ${name}`);
      if (seen.has(name)) throw new BadRequestException(`duplicate added field: ${name}`);
      if (!a?.label?.trim()) throw new BadRequestException(`added field ${name} needs a label`);
      if (!ADDED_KINDS.has(a?.kind)) throw new BadRequestException(`added field ${name}: kind must be one of ${[...ADDED_KINDS].join(', ')}`);
      const options = (a.options ?? []).map((v) => String(v).trim()).filter(Boolean);
      if (a.kind === 'select' && options.length === 0) throw new BadRequestException(`select field ${name} needs at least one option`);
      seen.add(name);
      const addedValidation = cleanValidation(a.validation);
      added.push({
        name,
        label: a.label.trim(),
        kind: a.kind,
        ...(a.required !== undefined ? { required: !!a.required } : {}),
        ...(a.hint?.trim() ? { hint: a.hint.trim() } : {}),
        ...(a.placeholder?.trim() ? { placeholder: a.placeholder.trim() } : {}),
        ...(a.kind === 'select' ? { options } : {}),
        ...(typeof a.formula === 'string' && a.formula.trim() ? { formula: a.formula.trim() } : {}),
        ...(addedValidation && addedValidation.length > 0 ? { validation: addedValidation } : {}),
      });
    }

    // P2: order — only known (code or added-in-this-save) names survive.
    const orderable = new Set([...known, ...seen]);
    const order = (dto?.order ?? []).filter((n) => orderable.has(n));

    // P3: rules — structural pass-through; deep checks (fields/ops/messages)
    // run in validateFormOverrides below.
    const rules: FormRule[] = [];
    for (const r of dto?.rules ?? []) {
      if (!r || typeof r !== 'object' || !r.when || !Array.isArray(r.actions)) {
        throw new BadRequestException('each rule needs a condition and an actions array');
      }
      rules.push({
        ...(typeof r.description === 'string' && r.description.trim() ? { description: r.description.trim() } : {}),
        when: r.when,
        actions: r.actions,
        ...(Array.isArray(r.otherwise) ? { otherwise: r.otherwise } : {}),
      });
    }

    // P3: layout — the designer authors sections of fields; anything else is refused.
    const layout: LayoutNode[] = [];
    for (const node of dto?.layout ?? []) {
      if (!node || typeof node !== 'object' || node.type !== 'section' || !Array.isArray(node.children)) {
        throw new BadRequestException('layout nodes must be sections of fields');
      }
      const children = node.children.filter(
        (c): c is { type: 'field'; name: string } => !!c && c.type === 'field' && typeof c.name === 'string',
      );
      layout.push({
        type: 'section',
        ...(typeof node.label === 'string' && node.label.trim() ? { label: node.label.trim() } : {}),
        ...(typeof node.description === 'string' && node.description.trim() ? { description: node.description.trim() } : {}),
        children,
      });
    }

    const draft: FormOverrides = {
      fields,
      ...(added.length > 0 ? { added } : {}),
      ...(order.length > 0 ? { order } : {}),
      ...(rules.length > 0 ? { rules } : {}),
      ...(layout.length > 0 ? { layout } : {}),
    };

    // The deep gate: broken formulas, rules pointing at unknown fields, bad
    // regexes, duplicate layout placements — a draft with problems is refused,
    // so the published channel can never hold one.
    const problems = validateFormOverrides(s, draft);
    if (problems.length > 0) throw new BadRequestException(problems.join('; '));

    const ctx = this.tenant.get();
    await this.overrides.setDraft(ctx.tenantId, id, draft);
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'form', id, 'draft-saved', {
      fields: Object.keys(fields),
      added: added.map((a) => a.name),
      ordered: order.length > 0,
      rules: rules.length,
      sections: layout.length,
    });
    return { ok: true };
  }

  /** Promote the draft to the live (published) form — version++, audited. */
  @Permissions('admin.forms.manage')
  @Post(':id/publish')
  async publish(@Param('id') id: string): Promise<{ version: number }> {
    this.schemaById(id);
    const ctx = this.tenant.get();
    const version = await this.overrides.publish(ctx.tenantId, id);
    if (version === null) throw new BadRequestException('nothing to publish — save draft changes first');
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'form', id, 'published', { version });
    return { version };
  }

  @Permissions('admin.forms.manage')
  @Delete(':id')
  async reset(@Param('id') id: string): Promise<{ removed: boolean }> {
    this.schemaById(id);
    const ctx = this.tenant.get();
    const removed = await this.overrides.remove(ctx.tenantId, id);
    if (removed) void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'form', id, 'reset', {});
    return { removed };
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
    private readonly customValues: FormCustomValuesService,
    private readonly tenant: TenantContext,
  ) {}

  @Get(':id/overrides')
  async effective(@Param('id') id: string): Promise<FormOverrides> {
    return (await this.overrides.get(this.tenant.get().tenantId, id)) ?? { fields: {} };
  }

  /** Custom-field (`cf_*`) values captured for a record (Form Designer P2). */
  @Get(':id/values/:recordId')
  async values(@Param('id') id: string, @Param('recordId') recordId: string): Promise<Record<string, unknown>> {
    return this.customValues.get(this.tenant.get().tenantId, id, recordId);
  }
}
