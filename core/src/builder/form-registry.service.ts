import { Injectable, Logger } from '@nestjs/common';

// ── Field Definition ──────────────────────────────────────────────────────────

export type FieldType =
  | 'text' | 'number' | 'boolean' | 'date' | 'datetime'
  | 'select' | 'multi-select' | 'relation' | 'file' | 'richtext';

export interface FieldOption {
  label: string;
  value: string;
}

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  defaultValue?: any;
  options?: FieldOption[];           // For select / multi-select
  relationEntity?: string;           // e.g. 'project', 'supplier'
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

// ── Form Definition ───────────────────────────────────────────────────────────

export interface FormDefinition {
  id: string;
  tenantId: string;
  formKey: string;
  label: string;
  entityType: string;
  fields: FormField[];
  version: number;
  isActive: boolean;
}

// ── Registry (in-memory fallback) ─────────────────────────────────────────────

@Injectable()
export class FormRegistryService {
  private readonly logger = new Logger('FormRegistryService');
  private readonly store = new Map<string, FormDefinition>();

  private storeKey(tenantId: string, formKey: string, version: number) {
    return `${tenantId}::${formKey}::v${version}`;
  }

  async register(def: Omit<FormDefinition, 'id'>): Promise<FormDefinition> {
    const id = `form-${Math.random().toString(36).substring(7)}`;
    const form: FormDefinition = { id, ...def };
    this.store.set(this.storeKey(def.tenantId, def.formKey, def.version), form);
    this.logger.log(`[FormRegistry] Registered form "${def.formKey}" v${def.version} for entity "${def.entityType}"`);
    return form;
  }

  async get(tenantId: string, formKey: string, version?: number): Promise<FormDefinition | null> {
    if (version !== undefined) {
      return this.store.get(this.storeKey(tenantId, formKey, version)) ?? null;
    }
    // Get latest version
    let latest: FormDefinition | null = null;
    for (const [, form] of this.store) {
      if (form.tenantId === tenantId && form.formKey === formKey) {
        if (!latest || form.version > latest.version) latest = form;
      }
    }
    return latest;
  }

  async list(tenantId: string): Promise<FormDefinition[]> {
    return Array.from(this.store.values()).filter((f) => f.tenantId === tenantId && f.isActive);
  }

  /**
   * Validate a data payload against a form definition's field rules.
   * Returns an array of validation error messages (empty = valid).
   */
  validate(form: FormDefinition, data: Record<string, any>): string[] {
    const errors: string[] = [];
    for (const field of form.fields) {
      const value = data[field.key];
      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push(`Field "${field.label}" is required.`);
        continue;
      }
      if (value !== undefined && field.validation) {
        const v = field.validation;
        if (v.min !== undefined && Number(value) < v.min)
          errors.push(v.message ?? `Field "${field.label}" must be at least ${v.min}.`);
        if (v.max !== undefined && Number(value) > v.max)
          errors.push(v.message ?? `Field "${field.label}" must be at most ${v.max}.`);
        if (v.pattern && !new RegExp(v.pattern).test(String(value)))
          errors.push(v.message ?? `Field "${field.label}" format is invalid.`);
      }
    }
    return errors;
  }
}
